import { useCallback, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ImageBackground,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { icons, images } from "../../constants";
import { useGlobalContext } from "../../context/GlobalProvider";
import { uploadFile } from "../../lib/appwrite";
import {
  areCirclesCollectionsConfigured,
  createCircle,
  ensureSeedCircles,
  formatMemberCount,
  formatMembersLabel,
  getJoinedCircleIds,
  listCircles,
  toggleJoinCircle,
  CIRCLE_VISIBILITY,
} from "../../lib/circles";
import * as ImagePicker from "expo-image-picker";

const FILTERS = ["all", "popular", "local", "interests"];
const CIRCLE_ICON_OPTIONS = [
  "users",
  "disc",
  "music",
  "camera",
  "map-pin",
  "trending-up",
  "heart",
  "book",
];
const MAX_CIRCLES_PER_USER = 10;

const Circles = () => {
  const { user, isRTL, theme, isDarkMode } = useGlobalContext();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [circles, setCircles] = useState([]);
  const [joinedIds, setJoinedIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTagline, setNewTagline] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTags, setNewTags] = useState("");
  const [newIcon, setNewIcon] = useState("users");
  const [newLocal, setNewLocal] = useState(false);
  const [newPrivate, setNewPrivate] = useState(false);
  const [newAvatarUri, setNewAvatarUri] = useState(null);
  const [newBannerUri, setNewBannerUri] = useState(null);

  const themedColor = useCallback(
    (darkColor, lightColor) => (isDarkMode ? darkColor : lightColor),
    [isDarkMode]
  );

  const panelBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.textBackgroundLight),
    [isDarkMode]
  );

  const loadCircles = useCallback(async () => {
    try {
      await ensureSeedCircles({ userId: user?.$id });
      const joined = await getJoinedCircleIds(user?.$id);
      const list = await listCircles({
        skipSeed: true,
        viewerId: user?.$id,
        joinedIds: joined,
      });
      setCircles(list);
      setJoinedIds(joined);
    } catch (e) {
      if (__DEV__) console.warn("[circles] load failed", e?.message || e);
    }
  }, [user?.$id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadCircles();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCircles]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCircles();
    setRefreshing(false);
  }, [loadCircles]);

  const filteredCircles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = circles.filter((circle) => {
      let matchesFilter = true;
      if (activeFilter === "popular") {
        // Real popularity: members first, not vanity seed tags.
        matchesFilter = (Number(circle.memberCount) || 0) > 0;
      } else if (activeFilter !== "all") {
        matchesFilter = (circle.filterKeys || []).includes(activeFilter);
      }
      const matchesSearch =
        !q ||
        circle.name.toLowerCase().includes(q) ||
        (circle.tags || []).some((tag) => tag.toLowerCase().includes(q));
      return matchesFilter && matchesSearch;
    });
    if (activeFilter === "popular") {
      return [...list].sort(
        (a, b) => (Number(b.memberCount) || 0) - (Number(a.memberCount) || 0)
      );
    }
    return list;
  }, [circles, searchQuery, activeFilter]);

  const openCreateCircle = useCallback(() => {
    if (!user?.$id) {
      Alert.alert(t("alerts.loginRequired"));
      return;
    }
    const owned = circles.filter(
      (c) => String(c.creatorId || "") === String(user.$id)
    ).length;
    if (owned >= MAX_CIRCLES_PER_USER) {
      Alert.alert(
        t("circles.createLimitTitle"),
        t("circles.createLimitMessage", { count: MAX_CIRCLES_PER_USER })
      );
      return;
    }
    setNewName("");
    setNewTagline("");
    setNewDescription("");
    setNewTags("");
    setNewIcon("users");
    setNewLocal(false);
    setNewPrivate(false);
    setNewAvatarUri(null);
    setNewBannerUri(null);
    setShowCreateModal(true);
  }, [user, circles, t]);

  const pickCircleImage = useCallback(async (kind) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          t("alerts.permissionRequiredTitle"),
          t("alerts.permissionRequiredMessage")
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: kind === "banner" ? [16, 9] : [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const file = {
        uri: asset.uri,
        name: asset.fileName || `circle-${kind}.jpg`,
        type: asset.mimeType || "image/jpeg",
        size: asset.fileSize || 0,
      };
      if (kind === "banner") setNewBannerUri(file);
      else setNewAvatarUri(file);
    } catch (e) {
      Alert.alert(t("common.error"), e?.message || t("alerts.mediaSelectError"));
    }
  }, [t]);

  const handleCreateCircle = useCallback(async () => {
    if (!user?.$id || creating) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      Alert.alert(t("circles.createNameRequired"));
      return;
    }

    const tags = newTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (newLocal && !tags.some((tag) => /local/i.test(tag))) {
      tags.push("Local");
    }

    const filterKeys = ["all", "interests"];
    if (newLocal || tags.some((tag) => /local/i.test(tag))) {
      filterKeys.push("local");
    }

    setCreating(true);
    try {
      let avatarUrl = "";
      let bannerUrl = "";
      if (newAvatarUri?.uri) {
        avatarUrl = (await uploadFile(newAvatarUri, "image")) || "";
      }
      if (newBannerUri?.uri) {
        bannerUrl = (await uploadFile(newBannerUri, "image")) || "";
      }

      const created = await createCircle({
        user,
        name: trimmed,
        description: newDescription,
        tagline: newTagline || t("circles.defaultTagline"),
        tags,
        filterKeys,
        icon: newIcon,
        avatar: avatarUrl,
        banner: bannerUrl,
        memberCount: 0,
        visibility: newPrivate
          ? CIRCLE_VISIBILITY.PRIVATE
          : CIRCLE_VISIBILITY.PUBLIC,
      });
      if (!created?.$id) {
        throw new Error(t("circles.createFailedMessage"));
      }
      setShowCreateModal(false);
      setJoinedIds((prev) => new Set(prev).add(created.$id));
      setCircles((prev) => {
        const without = prev.filter((c) => c.$id !== created.$id);
        return [created, ...without];
      });
      router.push(`/circle/${created.$id}`);
    } catch (e) {
      Alert.alert(
        t("circles.createFailedTitle"),
        e?.message || t("circles.createFailedMessage")
      );
    } finally {
      setCreating(false);
    }
  }, [
    user,
    creating,
    newName,
    newTags,
    newLocal,
    newPrivate,
    newDescription,
    newTagline,
    newIcon,
    newAvatarUri,
    newBannerUri,
    t,
  ]);

  const handleToggleJoin = useCallback(
    async (circle) => {
      if (!user?.$id) {
        Alert.alert(t("alerts.loginRequired"));
        return;
      }
      if (!circle?.$id || joiningId) return;

      const wasJoined = joinedIds.has(circle.$id);
      setJoiningId(circle.$id);

      // Optimistic UI
      setJoinedIds((prev) => {
        const next = new Set(prev);
        if (wasJoined) next.delete(circle.$id);
        else next.add(circle.$id);
        return next;
      });
      setCircles((prev) =>
        prev.map((c) => {
          if (c.$id !== circle.$id) return c;
          const memberCount = Math.max(
            0,
            (Number(c.memberCount) || 0) + (wasJoined ? -1 : 1)
          );
          return {
            ...c,
            memberCount,
            membersLabel: formatMemberCount(memberCount),
          };
        })
      );

      try {
        const result = await toggleJoinCircle({
          circle,
          user,
          isJoined: wasJoined,
        });
        if (result?.circle) {
          setCircles((prev) =>
            prev.map((c) => (c.$id === result.circle.$id ? result.circle : c))
          );
        }
        setJoinedIds((prev) => {
          const next = new Set(prev);
          if (result?.joined) next.add(circle.$id);
          else next.delete(circle.$id);
          return next;
        });
      } catch (e) {
        // Revert optimistic update
        setJoinedIds((prev) => {
          const next = new Set(prev);
          if (wasJoined) next.add(circle.$id);
          else next.delete(circle.$id);
          return next;
        });
        setCircles((prev) =>
          prev.map((c) => (c.$id === circle.$id ? circle : c))
        );
        Alert.alert(
          t("circles.joinFailedTitle"),
          e?.message || t("circles.joinFailedMessage")
        );
      } finally {
        setJoiningId(null);
      }
    },
    [user, joiningId, joinedIds, t]
  );

  const renderCircle = useCallback(
    ({ item }) => {
      const isJoined = joinedIds.has(item.$id);
      const busy = joiningId === item.$id;
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => router.push(`/circle/${item.$id}`)}
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            paddingVertical: 12,
            paddingHorizontal: 12,
            backgroundColor: theme.surface,
            borderRadius: 16,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: themedColor(
                "rgba(255,156,1,0.18)",
                "rgba(255,156,1,0.14)"
              ),
              alignItems: "center",
              justifyContent: "center",
              marginRight: isRTL ? 0 : 12,
              marginLeft: isRTL ? 12 : 0,
              overflow: "hidden",
              borderWidth: 1,
              borderColor: themedColor(
                "rgba(255,156,1,0.35)",
                "rgba(255,156,1,0.28)"
              ),
            }}
          >
            {item.avatar ? (
              <Image
                source={{ uri: item.avatar }}
                style={{ width: 48, height: 48 }}
                resizeMode="cover"
              />
            ) : (
              <Feather name={item.icon || "users"} size={20} color={theme.accent} />
            )}
          </View>

          <View style={{ flex: 1, minWidth: 0, paddingRight: isRTL ? 0 : 8, paddingLeft: isRTL ? 8 : 0 }}>
            <Text
              style={{
                color: theme.textPrimary,
                fontFamily: "Poppins-SemiBold",
                fontSize: 15,
                lineHeight: 20,
                textAlign: isRTL ? "right" : "left",
              }}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontFamily: "Poppins-Regular",
                fontSize: 12,
                marginTop: 2,
                textAlign: isRTL ? "right" : "left",
              }}
              numberOfLines={1}
            >
              {formatMembersLabel(item.memberCount, t)}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => handleToggleJoin(item)}
            activeOpacity={0.8}
            disabled={busy}
            style={{
              backgroundColor: isJoined
                ? themedColor("#1E3A5F", "#DBEAFE")
                : theme.accent,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              minWidth: 68,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator
                size="small"
                color={isJoined ? themedColor("#93C5FD", "#1D4ED8") : "#0B0B0B"}
              />
            ) : (
              <Text
                style={{
                  color: isJoined
                    ? themedColor("#93C5FD", "#1D4ED8")
                    : "#0B0B0B",
                  fontFamily: "Poppins-SemiBold",
                  fontSize: 12,
                }}
              >
                {isJoined ? t("circles.joined") : t("circles.join")}
              </Text>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [
      joinedIds,
      joiningId,
      isRTL,
      theme,
      themedColor,
      t,
      handleToggleJoin,
    ]
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flex: 1 }}>
        <LinearGradient
          colors={
            isDarkMode
              ? ["#020617", "#0F172A", "#111827"]
              : ["#F8FAFC", "#EEF2FF", "#F8FAFC"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ flex: 1 }}
        >
          <ImageBackground
            source={panelBackgroundImage || images.backgroundImage}
            style={{ flex: 1 }}
            imageStyle={{ opacity: isDarkMode ? 0.45 : 0.85 }}
          >
            <View style={{ paddingHorizontal: 20, paddingTop: 20, flex: 1 }}>
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                  gap: 12,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 26,
                      fontFamily: "Poppins-Bold",
                      color: theme.textPrimary,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.title")}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: "Poppins-Regular",
                      color: theme.textSecondary,
                      marginTop: 2,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.subtitle")}
                  </Text>
                  {!areCirclesCollectionsConfigured() ? (
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily: "Poppins-Regular",
                        color: theme.textMuted || theme.textSecondary,
                        marginTop: 4,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t("circles.localModeHint")}
                    </Text>
                  ) : null}
                </View>

                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <TouchableOpacity
                    onPress={openCreateCircle}
                    activeOpacity={0.8}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: theme.accent,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("circles.createCircle")}
                  >
                    <Feather name="plus" size={20} color="#0B0B0B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push("/friends")}
                    activeOpacity={0.8}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: themedColor(
                        "rgba(15,23,42,0.75)",
                        "#FFFFFF"
                      ),
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("circles.openFriends")}
                  >
                    <Feather
                      name="user-plus"
                      size={18}
                      color={theme.textPrimary}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push("/live-map")}
                    activeOpacity={0.8}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: themedColor(
                        "rgba(15,23,42,0.75)",
                        "#FFFFFF"
                      ),
                      borderWidth: 1,
                      borderColor: theme.border,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Open live map"
                  >
                    <Feather name="map-pin" size={18} color={theme.accent} />
                  </TouchableOpacity>
                </View>
              </View>

              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  backgroundColor: themedColor(
                    "rgba(15,23,42,0.6)",
                    "rgba(255,255,255,0.8)"
                  ),
                  borderRadius: 16,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                  marginTop: 16,
                  marginBottom: 14,
                  borderWidth: 1,
                  borderColor: themedColor(
                    "rgba(255,255,255,0.15)",
                    theme.border
                  ),
                }}
              >
                <Image
                  source={icons.search}
                  style={{
                    width: 20,
                    height: 20,
                    marginRight: isRTL ? 0 : 12,
                    marginLeft: isRTL ? 12 : 0,
                    tintColor: theme.textSecondary,
                  }}
                  resizeMode="contain"
                />
                <TextInput
                  placeholder={t("circles.searchPlaceholder")}
                  placeholderTextColor={theme.textSecondary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={{
                    flex: 1,
                    color: theme.textPrimary,
                    fontSize: 16,
                    textAlign: isRTL ? "right" : "left",
                  }}
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexGrow: 0, marginBottom: 14, maxHeight: 40 }}
                contentContainerStyle={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 2,
                }}
              >
                {FILTERS.map((filter) => {
                  const selected = activeFilter === filter;
                  return (
                    <TouchableOpacity
                      key={filter}
                      onPress={() => setActiveFilter(filter)}
                      activeOpacity={0.8}
                      style={{
                        backgroundColor: selected
                          ? theme.accent
                          : themedColor("rgba(30,41,59,0.9)", "#E2E8F0"),
                        paddingHorizontal: 14,
                        height: 34,
                        borderRadius: 17,
                        alignItems: "center",
                        justifyContent: "center",
                        alignSelf: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: selected ? "#0B0B0B" : theme.textPrimary,
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 13,
                          lineHeight: 18,
                          includeFontPadding: false,
                          textAlignVertical: "center",
                        }}
                      >
                        {t(`circles.filters.${filter}`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text
                style={{
                  color: theme.textPrimary,
                  fontFamily: "Poppins-SemiBold",
                  fontSize: 16,
                  marginBottom: 10,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t("circles.recommended")}
              </Text>

              {loading ? (
                <View
                  style={{
                    paddingVertical: 48,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <ActivityIndicator size="large" color={theme.accent} />
                </View>
              ) : (
                <FlatList
                  style={{ flex: 1 }}
                  data={filteredCircles}
                  keyExtractor={(item) => item.$id}
                  renderItem={renderCircle}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
                  nestedScrollEnabled
                  refreshControl={
                    <RefreshControl
                      refreshing={refreshing}
                      onRefresh={onRefresh}
                      tintColor={theme.accent}
                    />
                  }
                  ListEmptyComponent={() => (
                    <View
                      style={{
                        paddingVertical: 48,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontSize: 15,
                          textAlign: "center",
                          lineHeight: 22,
                        }}
                      >
                        {searchQuery
                          ? t("circles.emptySearch")
                          : t("circles.emptyAll")}
                      </Text>
                    </View>
                  )}
                />
              )}
            </View>

          <Modal
            visible={showCreateModal}
            animationType="slide"
            transparent
            onRequestClose={() => !creating && setShowCreateModal(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              style={{
                flex: 1,
                justifyContent: "flex-end",
                backgroundColor: "rgba(0,0,0,0.55)",
              }}
            >
              <View
                style={{
                  maxHeight: "92%",
                  backgroundColor: theme.background,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  paddingBottom: 24,
                }}
              >
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingTop: 16,
                    paddingBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 18,
                    }}
                  >
                    {t("circles.createCircle")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => !creating && setShowCreateModal(false)}
                    hitSlop={10}
                  >
                    <Feather name="x" size={22} color={theme.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingBottom: 24,
                  }}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                      marginBottom: 6,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.createNameLabel")}
                  </Text>
                  <TextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder={t("circles.createNamePlaceholder")}
                    placeholderTextColor={theme.textSecondary}
                    style={{
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.textPrimary,
                      marginBottom: 14,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                      marginBottom: 6,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.createTaglineLabel")}
                  </Text>
                  <TextInput
                    value={newTagline}
                    onChangeText={setNewTagline}
                    placeholder={t("circles.defaultTagline")}
                    placeholderTextColor={theme.textSecondary}
                    style={{
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.textPrimary,
                      marginBottom: 14,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                      marginBottom: 6,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.createDescriptionLabel")}
                  </Text>
                  <TextInput
                    value={newDescription}
                    onChangeText={setNewDescription}
                    placeholder={t("circles.createDescriptionPlaceholder")}
                    placeholderTextColor={theme.textSecondary}
                    multiline
                    style={{
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.textPrimary,
                      marginBottom: 14,
                      minHeight: 80,
                      textAlignVertical: "top",
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                      marginBottom: 6,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.createTagsLabel")}
                  </Text>
                  <TextInput
                    value={newTags}
                    onChangeText={setNewTags}
                    placeholder={t("circles.createTagsPlaceholder")}
                    placeholderTextColor={theme.textSecondary}
                    style={{
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.textPrimary,
                      marginBottom: 14,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />

                  <TouchableOpacity
                    onPress={() => setNewLocal((v) => !v)}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: theme.accent,
                        backgroundColor: newLocal ? theme.accent : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {newLocal ? (
                        <Feather name="check" size={14} color="#0B0B0B" />
                      ) : null}
                    </View>
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontFamily: "Poppins-Regular",
                        fontSize: 14,
                      }}
                    >
                      {t("circles.createLocalToggle")}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setNewPrivate((v) => !v)}
                    activeOpacity={0.85}
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 1.5,
                        borderColor: theme.accent,
                        backgroundColor: newPrivate
                          ? theme.accent
                          : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {newPrivate ? (
                        <Feather name="check" size={14} color="#0B0B0B" />
                      ) : null}
                    </View>
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontFamily: "Poppins-Regular",
                        fontSize: 14,
                        flex: 1,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t("circles.createPrivateToggle")}
                    </Text>
                  </TouchableOpacity>

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                      marginBottom: 8,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.createImagesLabel")}
                  </Text>
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => pickCircleImage("avatar")}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 36,
                        overflow: "hidden",
                        backgroundColor: themedColor(
                          "rgba(30,41,59,0.9)",
                          "#E2E8F0"
                        ),
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      {newAvatarUri?.uri ? (
                        <Image
                          source={{ uri: newAvatarUri.uri }}
                          style={{ width: 72, height: 72 }}
                        />
                      ) : (
                        <Feather name="camera" size={20} color={theme.accent} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => pickCircleImage("banner")}
                      style={{
                        flex: 1,
                        height: 72,
                        borderRadius: 12,
                        overflow: "hidden",
                        backgroundColor: themedColor(
                          "rgba(30,41,59,0.9)",
                          "#E2E8F0"
                        ),
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      {newBannerUri?.uri ? (
                        <Image
                          source={{ uri: newBannerUri.uri }}
                          style={{ width: "100%", height: 72 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text
                          style={{
                            color: theme.textSecondary,
                            fontSize: 12,
                            fontFamily: "Poppins-Regular",
                          }}
                        >
                          {t("circles.addBanner")}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 13,
                      marginBottom: 8,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.createIconLabel")}
                  </Text>
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 18,
                    }}
                  >
                    {CIRCLE_ICON_OPTIONS.map((iconName) => {
                      const selected = newIcon === iconName;
                      return (
                        <TouchableOpacity
                          key={iconName}
                          onPress={() => setNewIcon(iconName)}
                          style={{
                            width: 44,
                            height: 44,
                            borderRadius: 22,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: selected
                              ? theme.accent
                              : themedColor("rgba(30,41,59,0.9)", "#E2E8F0"),
                          }}
                        >
                          <Feather
                            name={iconName}
                            size={18}
                            color={selected ? "#0B0B0B" : theme.textPrimary}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={handleCreateCircle}
                    disabled={creating}
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: theme.accent,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      opacity: creating ? 0.7 : 1,
                    }}
                  >
                    {creating ? (
                      <ActivityIndicator color="#0B0B0B" />
                    ) : (
                      <Text
                        style={{
                          color: "#0B0B0B",
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 15,
                        }}
                      >
                        {t("circles.publishCircle")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>
          </ImageBackground>
        </LinearGradient>
      </View>
    </SafeAreaView>
  );
};

export default Circles;

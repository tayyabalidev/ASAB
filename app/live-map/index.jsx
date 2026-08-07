/**
 * Friends Live Map (Step 5): background sharing + nearby / share-started alerts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";
import ClusteredMapView from "react-native-map-clustering";
import { Feather } from "@expo/vector-icons";

import { images } from "../../constants";
import { useGlobalContext } from "../../context/GlobalProvider";
import {
  reverseGeocodeLabel,
  watchForegroundLocation,
} from "../../lib/locationPermissions";
import { LOCATION_PRIVACY_MODES } from "../../lib/locationSchema";
import {
  getMutualFriendIds,
  getMyLocationDocument,
  subscribeVisibleFriendLocations,
  upsertMyLocation,
} from "../../lib/locationService";
import {
  disableLocationSharingSession,
  enableLocationSharingSession,
  syncLocationSharingPrefsFromUser,
} from "../../lib/locationSharingSession";
import { checkAndNotifyNearbyFriends } from "../../lib/locationNotifications";
import {
  callFriend,
  openFriendChat,
  openFriendProfile,
} from "../../lib/liveMapActions";

const DEFAULT_REGION = {
  latitude: 40.7231,
  longitude: -73.9982,
  latitudeDelta: 0.04,
  longitudeDelta: 0.04,
};

const PRIVACY_OPTIONS = [
  {
    id: LOCATION_PRIVACY_MODES.FRIENDS,
    title: "Friends",
    hint: "Mutual follows only",
    icon: "users",
  },
  {
    id: LOCATION_PRIVACY_MODES.EVERYONE,
    title: "Everyone",
    hint: "Anyone on ASAB who opens the map",
    icon: "globe",
  },
  {
    id: LOCATION_PRIVACY_MODES.SELECTED,
    title: "Selected friends",
    hint: "Only people you choose",
    icon: "user-check",
  },
  {
    id: LOCATION_PRIVACY_MODES.GHOST,
    title: "Ghost Mode",
    hint: "Hide your location",
    icon: "eye-off",
  },
];

export default function LiveMapScreen() {
  const { theme, isDarkMode, user, isRTL } = useGlobalContext();
  const mapRef = useRef(null);
  const watchRef = useRef(null);
  const followingRef = useRef(true);
  const lastCoordsRef = useRef(null);
  const sharingRef = useRef(false);
  const privacyRef = useRef(LOCATION_PRIVACY_MODES.FRIENDS);
  const allowedRef = useRef([]);

  const [coords, setCoords] = useState(null);
  const [placeLabel, setPlaceLabel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(LOCATION_PRIVACY_MODES.FRIENDS);
  const [allowedViewerIds, setAllowedViewerIds] = useState([]);
  const [friendsOnMap, setFriendsOnMap] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedPickerOpen, setSelectedPickerOpen] = useState(false);
  const [mutualProfiles, setMutualProfiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionFriend, setActionFriend] = useState(null);

  const mapProvider = Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;
  const mapStyle = useMemo(() => (isDarkMode ? DARK_MAP_STYLE : []), [isDarkMode]);
  const mutualFriends = useMemo(() => getMutualFriendIds(user), [user]);

  const filteredFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return friendsOnMap;
    return friendsOnMap.filter((f) => {
      const name = String(f.username || "").toLowerCase();
      const place = String(f.placeLabel || "").toLowerCase();
      return name.includes(q) || place.includes(q);
    });
  }, [friendsOnMap, searchQuery]);

  useEffect(() => {
    followingRef.current = following;
  }, [following]);
  useEffect(() => {
    sharingRef.current = isSharing;
  }, [isSharing]);
  useEffect(() => {
    privacyRef.current = privacyMode;
  }, [privacyMode]);
  useEffect(() => {
    allowedRef.current = allowedViewerIds;
  }, [allowedViewerIds]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.$id) return;
      const doc = await getMyLocationDocument(user.$id);
      if (cancelled || !doc) return;
      const mode = String(doc.privacyMode || LOCATION_PRIVACY_MODES.FRIENDS);
      const sharing = Boolean(doc.isSharing) && mode !== LOCATION_PRIVACY_MODES.GHOST;
      setIsSharing(sharing);
      setPrivacyMode(
        sharing ? mode : mode === LOCATION_PRIVACY_MODES.GHOST ? LOCATION_PRIVACY_MODES.FRIENDS : mode
      );
      setAllowedViewerIds(
        Array.isArray(doc.allowedViewerIds) ? doc.allowedViewerIds.map(String) : []
      );
      if (sharing) {
        setStatusNote(`Sharing · ${mode}`);
      } else {
        setStatusNote("Ghost Mode · not sharing");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.$id]);

  const publishIfSharing = useCallback(
    async (location, { force = false } = {}) => {
      if (!user?.$id || !sharingRef.current) return;
      if (privacyRef.current === LOCATION_PRIVACY_MODES.GHOST) return;
      try {
        await upsertMyLocation({
          userId: user.$id,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading,
          speed: location.coords.speed,
          altitude: location.coords.altitude,
          isSharing: true,
          privacyMode: privacyRef.current,
          allowedViewerIds: allowedRef.current,
          force,
        });
        await syncLocationSharingPrefsFromUser(user, {
          isSharing: true,
          privacyMode: privacyRef.current,
          allowedViewerIds: allowedRef.current,
        });
        await checkAndNotifyNearbyFriends({
          viewerUser: user,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      } catch (e) {
        if (__DEV__) console.warn("[live-map] publish failed", e?.message || e);
      }
    },
    [user]
  );

  const applyLocation = useCallback(
    async (location, animate) => {
      const next = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      lastCoordsRef.current = {
        ...next,
        accuracy: location.coords.accuracy,
        heading: location.coords.heading,
        speed: location.coords.speed,
        altitude: location.coords.altitude,
      };
      setCoords(next);
      setLoading(false);
      setError("");

      if (animate && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            ...next,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          600
        );
      }

      const label = await reverseGeocodeLabel(next.latitude, next.longitude);
      if (label) setPlaceLabel(label);

      await publishIfSharing(location);
    },
    [publishIfSharing]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sub = await watchForegroundLocation(async (location) => {
          if (cancelled) return;
          await applyLocation(location, followingRef.current);
        });
        if (cancelled) {
          sub?.remove?.();
          return;
        }
        watchRef.current = sub;
      } catch (e) {
        if (!cancelled) {
          setLoading(false);
          setError(
            e?.message ||
              "Location permission is required to show your position on the map."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      watchRef.current?.remove?.();
      watchRef.current = null;
    };
  }, [applyLocation]);

  useEffect(() => {
    if (!selectedPickerOpen || mutualFriends.length === 0) {
      if (!selectedPickerOpen) setMutualProfiles([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const { databases, appwriteConfig } = await import("../../lib/appwrite");
        const rows = await Promise.all(
          mutualFriends.map(async (id) => {
            try {
              const u = await databases.getDocument(
                appwriteConfig.databaseId,
                appwriteConfig.userCollectionId,
                id
              );
              return {
                $id: u.$id,
                username: u.username || id,
                avatar: u.avatar || "",
              };
            } catch {
              return { $id: id, username: id, avatar: "" };
            }
          })
        );
        if (!cancelled) setMutualProfiles(rows);
      } catch {
        if (!cancelled) {
          setMutualProfiles(
            mutualFriends.map((id) => ({ $id: id, username: id, avatar: "" }))
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mutualFriends, selectedPickerOpen]);

  useEffect(() => {
    if (!user?.$id) return undefined;
    const unsub = subscribeVisibleFriendLocations(user, (rows) => {
      setFriendsOnMap(rows);
    });
    return unsub;
  }, [user]);

  const recenter = useCallback(() => {
    if (!coords || !mapRef.current) return;
    setFollowing(true);
    mapRef.current.animateToRegion(
      {
        ...coords,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      500
    );
  }, [coords]);

  const focusFriend = useCallback((friend) => {
    if (!friend || !mapRef.current) return;
    setFollowing(false);
    mapRef.current.animateToRegion(
      {
        latitude: friend.latitude,
        longitude: friend.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      500
    );
  }, []);

  const openFriendActions = useCallback(
    (friend) => {
      if (!friend) return;
      focusFriend(friend);
      setActionFriend(friend);
    },
    [focusFriend]
  );

  const handleMessageFriend = useCallback((friend) => {
    setActionFriend(null);
    openFriendChat(friend?.userId);
  }, []);

  const handleProfileFriend = useCallback((friend) => {
    setActionFriend(null);
    openFriendProfile(friend?.userId);
  }, []);

  const handleCallFriend = useCallback(
    async (friend, callType) => {
      if (!user?.$id || !friend?.userId) return;
      setActionFriend(null);
      await callFriend({
        currentUserId: user.$id,
        receiverId: friend.userId,
        callType,
      });
    },
    [user?.$id]
  );

  const applyPrivacyChoice = useCallback(
    async (mode) => {
      if (!user?.$id) return;
      setBusy(true);
      try {
        if (mode === LOCATION_PRIVACY_MODES.GHOST) {
          await disableLocationSharingSession({ user });
          setIsSharing(false);
          setPrivacyMode(LOCATION_PRIVACY_MODES.FRIENDS);
          setStatusNote("Ghost Mode · not sharing");
          setSettingsOpen(false);
          return;
        }

        if (mode === LOCATION_PRIVACY_MODES.SELECTED) {
          setBusy(false);
          setSelectedPickerOpen(true);
          return;
        }

        const coordsPayload = lastCoordsRef.current;
        const { background } = await enableLocationSharingSession({
          user,
          privacyMode: mode,
          allowedViewerIds: [],
          coords: coordsPayload,
          enableBackground: true,
          notifyFriends: true,
        });
        setIsSharing(true);
        setPrivacyMode(mode);
        setAllowedViewerIds([]);
        setStatusNote(
          background?.ok
            ? `Sharing · ${mode} · background on`
            : `Sharing · ${mode} · background needs Always permission`
        );
        setSettingsOpen(false);
        if (background && !background.ok && background.reason === "background") {
          Alert.alert(
            "Background location",
            "Allow “Always” location access in Settings so friends can see updates when ASAB is closed."
          );
        }
      } catch (e) {
        setError(e?.message || "Could not update sharing settings");
      } finally {
        setBusy(false);
      }
    },
    [user]
  );

  const confirmSelectedFriends = useCallback(async () => {
    if (!user?.$id) return;
    setBusy(true);
    try {
      const coordsPayload = lastCoordsRef.current;
      const { background } = await enableLocationSharingSession({
        user,
        privacyMode: LOCATION_PRIVACY_MODES.SELECTED,
        allowedViewerIds,
        coords: coordsPayload,
        enableBackground: true,
        notifyFriends: true,
      });
      setIsSharing(true);
      setPrivacyMode(LOCATION_PRIVACY_MODES.SELECTED);
      setStatusNote(
        background?.ok
          ? `Sharing · selected (${allowedViewerIds.length}) · background on`
          : `Sharing · selected (${allowedViewerIds.length})`
      );
      setSelectedPickerOpen(false);
      setSettingsOpen(false);
    } catch (e) {
      setError(e?.message || "Could not save selected friends");
    } finally {
      setBusy(false);
    }
  }, [allowedViewerIds, user]);

  const toggleShareQuick = useCallback(async () => {
    if (!user?.$id) return;
    setBusy(true);
    try {
      if (isSharing) {
        await disableLocationSharingSession({ user });
        setIsSharing(false);
        setStatusNote("Ghost Mode · not sharing");
      } else {
        const mode =
          privacyMode === LOCATION_PRIVACY_MODES.GHOST
            ? LOCATION_PRIVACY_MODES.FRIENDS
            : privacyMode;
        const { background } = await enableLocationSharingSession({
          user,
          privacyMode: mode,
          allowedViewerIds,
          coords: lastCoordsRef.current,
          enableBackground: true,
          notifyFriends: true,
        });
        setIsSharing(true);
        setPrivacyMode(mode);
        setStatusNote(
          background?.ok
            ? `Sharing · ${mode} · background on`
            : `Sharing · ${mode}`
        );
        if (background && !background.ok && background.reason === "background") {
          Alert.alert(
            "Background location",
            "Allow “Always” location access in Settings so friends can see updates when ASAB is closed."
          );
        }
      }
    } catch (e) {
      setError(e?.message || "Could not update sharing");
    } finally {
      setBusy(false);
    }
  }, [allowedViewerIds, isSharing, privacyMode, user]);

  const toggleAllowed = useCallback((friendId) => {
    setAllowedViewerIds((prev) => {
      const id = String(friendId);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ClusteredMapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={mapProvider}
        customMapStyle={mapStyle}
        userInterfaceStyle={isDarkMode ? "dark" : "light"}
        initialRegion={
          coords
            ? { ...coords, latitudeDelta: 0.02, longitudeDelta: 0.02 }
            : DEFAULT_REGION
        }
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        onPanDrag={() => setFollowing(false)}
        animationEnabled
        clusteringEnabled
        radius={48}
        extent={512}
        minPoints={2}
        spiderLineColor={theme.accent}
        clusterColor={theme.accent}
        clusterTextColor="#111827"
        clusterFontFamily="Poppins-SemiBold"
      >
        {friendsOnMap.map((friend) => (
          <Marker
            key={friend.$id || friend.userId}
            coordinate={{
              latitude: friend.latitude,
              longitude: friend.longitude,
            }}
            title={friend.username}
            description={`${friend.freshness?.label || ""}${
              friend.placeLabel ? ` · ${friend.placeLabel}` : ""
            }`}
            onPress={() => openFriendActions(friend)}
            tracksViewChanges={false}
          >
            <View style={styles.markerWrap}>
              <View
                style={[
                  styles.markerRing,
                  {
                    borderColor: friend.freshness?.isLive ? "#22C55E" : theme.border,
                  },
                ]}
              >
                <Image
                  source={
                    friend.avatar
                      ? { uri: friend.avatar }
                      : images.profile
                  }
                  style={styles.markerAvatar}
                />
              </View>
              <Text
                style={[styles.markerLabel, { color: theme.textPrimary }]}
                numberOfLines={1}
              >
                {friend.username} {friend.freshness?.label || ""}
              </Text>
            </View>
          </Marker>
        ))}

        {coords ? (
          <Marker
            coordinate={coords}
            title={user?.username || "You"}
            description={placeLabel || "You · Now"}
            tracksViewChanges={false}
            cluster={false}
          >
            <View style={styles.markerWrap}>
              <View style={[styles.markerRing, styles.youRing]}>
                <Image
                  source={
                    user?.avatar ? { uri: user.avatar } : images.profile
                  }
                  style={styles.markerAvatar}
                />
              </View>
              <Text style={[styles.markerLabel, { color: theme.textPrimary }]}>
                You · Now
              </Text>
            </View>
          </Marker>
        ) : null}
      </ClusteredMapView>

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topRow} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.roundBtn, { backgroundColor: theme.surface }]}
          >
            <Feather
              name={isRTL ? "arrow-right" : "arrow-left"}
              size={22}
              color={theme.textPrimary}
            />
          </TouchableOpacity>

          <View style={[styles.badge, { backgroundColor: theme.surface }]}>
            <Text style={[styles.badgeTitle, { color: theme.textPrimary }]}>
              Friends Live Map
            </Text>
            <Text style={[styles.badgeSub, { color: theme.textSecondary }]}>
              {statusNote ||
                (isSharing ? `Sharing · ${privacyMode}` : "Ghost Mode · not sharing")}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setSettingsOpen(true)}
            style={[styles.roundBtn, { backgroundColor: theme.surface }]}
          >
            <Feather name="settings" size={20} color={theme.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.sideControls} pointerEvents="box-none">
          <TouchableOpacity
            onPress={recenter}
            style={[styles.roundBtn, { backgroundColor: theme.surface }]}
          >
            <Feather name="crosshair" size={22} color={theme.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomArea} pointerEvents="box-none">
          {loading ? (
            <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.sheetText, { color: theme.textSecondary }]}>
                Getting your location…
              </Text>
            </View>
          ) : null}

          {error ? (
            <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
              <Text style={[styles.sheetText, { color: theme.danger }]}>{error}</Text>
            </View>
          ) : null}

          {!loading && !error ? (
            <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
              <View style={styles.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.youTitle, { color: theme.textPrimary }]}>
                    {user?.username || "You"}
                    {isSharing ? " · Live" : " · Hidden"}
                  </Text>
                  <Text style={[styles.sheetText, { color: theme.textSecondary }]}>
                    {placeLabel ||
                      (coords
                        ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`
                        : "Waiting for GPS")}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={toggleShareQuick}
                  disabled={busy || !coords}
                  style={[
                    styles.shareChip,
                    {
                      backgroundColor: isSharing
                        ? "rgba(34,197,94,0.18)"
                        : theme.surfaceMuted,
                      borderColor: isSharing ? "#22C55E" : theme.border,
                    },
                  ]}
                >
                  <Feather
                    name={isSharing ? "radio" : "eye-off"}
                    size={14}
                    color={isSharing ? "#16A34A" : theme.textSecondary}
                  />
                  <Text
                    style={{
                      color: isSharing ? "#16A34A" : theme.textSecondary,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 12,
                    }}
                  >
                    {isSharing ? "Sharing" : "Ghost"}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                Friends on map ({filteredFriends.length}
                {searchQuery.trim() ? ` / ${friendsOnMap.length}` : ""})
              </Text>

              {friendsOnMap.length > 0 ? (
                <View
                  style={[
                    styles.searchRow,
                    {
                      backgroundColor: theme.surfaceMuted,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Feather name="search" size={16} color={theme.textMuted} />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search for friends..."
                    placeholderTextColor={theme.inputPlaceholder || theme.textMuted}
                    style={[styles.searchInput, { color: theme.textPrimary }]}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                      <Feather name="x" size={16} color={theme.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              {friendsOnMap.length === 0 ? (
                <Text style={[styles.sheetHint, { color: theme.textMuted }]}>
                  Mutual friends who are sharing will appear here. Tap a pin for
                  profile, message, or call.
                </Text>
              ) : filteredFriends.length === 0 ? (
                <Text style={[styles.sheetHint, { color: theme.textMuted }]}>
                  No friends match “{searchQuery.trim()}”.
                </Text>
              ) : (
                <ScrollView
                  style={{ maxHeight: 180 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredFriends.map((friend) => (
                    <TouchableOpacity
                      key={friend.userId}
                      style={styles.friendRow}
                      onPress={() => openFriendActions(friend)}
                    >
                      <Image
                        source={
                          friend.avatar ? { uri: friend.avatar } : images.profile
                        }
                        style={styles.friendAvatar}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: theme.textPrimary,
                            fontFamily: "Poppins-SemiBold",
                          }}
                        >
                          {friend.username}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          <Text
                            style={{
                              color: friend.freshness?.isLive
                                ? "#16A34A"
                                : theme.textSecondary,
                            }}
                          >
                            {friend.freshness?.label || "—"}
                          </Text>
                          {friend.placeLabel ? ` · ${friend.placeLabel}` : ""}
                        </Text>
                      </View>
                      <Feather name="more-horizontal" size={18} color={theme.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      <Modal visible={settingsOpen} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setSettingsOpen(false)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Who can see you?
            </Text>
            {PRIVACY_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.privacyRow,
                  {
                    borderColor:
                      (isSharing ? privacyMode : LOCATION_PRIVACY_MODES.GHOST) ===
                        opt.id ||
                      (!isSharing && opt.id === LOCATION_PRIVACY_MODES.GHOST)
                        ? theme.accent
                        : theme.border,
                  },
                ]}
                onPress={() => applyPrivacyChoice(opt.id)}
                disabled={busy}
              >
                <Feather name={opt.icon} size={18} color={theme.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>
                    {opt.title}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {opt.hint}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
            {busy ? <ActivityIndicator color={theme.accent} style={{ marginTop: 8 }} /> : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={selectedPickerOpen} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface, maxHeight: "70%" }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Selected friends
            </Text>
            <Text style={[styles.sheetHint, { color: theme.textMuted, marginBottom: 10 }]}>
              Mutual friends only ({mutualFriends.length} available)
            </Text>
            <ScrollView>
              {mutualFriends.length === 0 ? (
                <Text style={{ color: theme.textSecondary }}>
                  No mutual friends yet. Follow each other first.
                </Text>
              ) : (
                (mutualProfiles.length ? mutualProfiles : mutualFriends.map((id) => ({
                  $id: id,
                  username: id,
                  avatar: "",
                }))).map((friend) => {
                  const checked = allowedViewerIds.includes(String(friend.$id));
                  return (
                    <TouchableOpacity
                      key={friend.$id}
                      style={styles.friendRow}
                      onPress={() => toggleAllowed(friend.$id)}
                    >
                      <Image
                        source={
                          friend.avatar ? { uri: friend.avatar } : images.profile
                        }
                        style={styles.friendAvatar}
                      />
                      <Text style={{ color: theme.textPrimary, flex: 1 }}>
                        {friend.username}
                      </Text>
                      <Feather
                        name={checked ? "check-square" : "square"}
                        size={20}
                        color={checked ? theme.accent : theme.textMuted}
                      />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.surfaceMuted }]}
                onPress={() => setSelectedPickerOpen(false)}
              >
                <Text style={{ color: theme.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                onPress={confirmSelectedFriends}
                disabled={busy}
              >
                <Text style={{ color: "#111", fontFamily: "Poppins-SemiBold" }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!actionFriend} transparent animationType="fade">
        <Pressable style={styles.modalBackdrop} onPress={() => setActionFriend(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.actionHeader}>
              <Image
                source={
                  actionFriend?.avatar
                    ? { uri: actionFriend.avatar }
                    : images.profile
                }
                style={styles.actionAvatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: theme.textPrimary, marginBottom: 0 }]}>
                  {actionFriend?.username || "Friend"}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {actionFriend?.freshness?.label || "—"}
                  {actionFriend?.placeLabel ? ` · ${actionFriend.placeLabel}` : ""}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.actionRow, { borderColor: theme.border }]}
              onPress={() => handleProfileFriend(actionFriend)}
            >
              <Feather name="user" size={18} color={theme.accent} />
              <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>
                View profile
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { borderColor: theme.border }]}
              onPress={() => handleMessageFriend(actionFriend)}
            >
              <Feather name="message-circle" size={18} color={theme.accent} />
              <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>
                Message
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { borderColor: theme.border }]}
              onPress={() => handleCallFriend(actionFriend, "audio")}
            >
              <Feather name="phone" size={18} color={theme.accent} />
              <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>
                Audio call
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { borderColor: theme.border }]}
              onPress={() => handleCallFriend(actionFriend, "video")}
            >
              <Feather name="video" size={18} color={theme.accent} />
              <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>
                Video call
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.surfaceMuted, marginTop: 4 }]}
              onPress={() => setActionFriend(null)}
            >
              <Text style={{ color: theme.textPrimary }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { flex: 1, justifyContent: "space-between" },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
  },
  sideControls: {
    position: "absolute",
    right: 16,
    top: 110,
    gap: 10,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  badge: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  badgeTitle: { fontSize: 16, fontFamily: "Poppins-SemiBold" },
  badgeSub: { fontSize: 12, marginTop: 2 },
  bottomArea: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  sheet: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  youTitle: { fontSize: 16, fontFamily: "Poppins-SemiBold" },
  sheetText: { fontSize: 14, lineHeight: 20 },
  sheetHint: { fontSize: 12, lineHeight: 18 },
  sectionLabel: {
    marginTop: 6,
    fontSize: 12,
    fontFamily: "Poppins-SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  shareChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  friendAvatar: { width: 36, height: 36, borderRadius: 18 },
  actionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  actionAvatar: { width: 48, height: 48, borderRadius: 24 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  markerWrap: { alignItems: "center", maxWidth: 110 },
  markerRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  youRing: { borderColor: "#22C55E" },
  markerAvatar: { width: "100%", height: "100%" },
  markerLabel: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Poppins-SemiBold",
    textAlign: "center",
    backgroundColor: "rgba(255,255,255,0.88)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: 16,
  },
  modalCard: {
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  modalTitle: { fontSize: 18, fontFamily: "Poppins-SemiBold", marginBottom: 4 },
  privacyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  modalBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
});

const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8ec3b9" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a3646" }] },
  {
    featureType: "administrative.country",
    elementType: "geometry.stroke",
    stylers: [{ color: "#4b6878" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry.stroke",
    stylers: [{ color: "#334e87" }],
  },
  {
    featureType: "landscape.natural",
    elementType: "geometry",
    stylers: [{ color: "#023e58" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#283d6a" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#6f9ba5" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#304a7d" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#98a5be" }],
  },
  {
    featureType: "transit",
    elementType: "labels.text.fill",
    stylers: [{ color: "#98a5be" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0e1626" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#4e6d70" }],
  },
];

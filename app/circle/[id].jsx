import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ImageBackground,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useTranslation } from "react-i18next";

import { images } from "../../constants";
import MapDateTimePicker from "../../components/MapDateTimePicker";
import { useGlobalContext } from "../../context/GlobalProvider";
import { getCirclePosts, getPhotoUrl, uploadFile, getVideoPlaybackUrls, toggleLikePost, getComments, addComment } from "../../lib/appwrite";
import { subscribeContentFeedInvalidate } from "../../lib/contentFeedEvents";
import {
  areCircleEventsConfigured,
  createCircleEvent,
  defaultCircleEventDate,
  deleteCircleEvent,
  listCircleEvents,
  toggleCircleEventRsvp,
} from "../../lib/circleEvents";
import {
  formatMemberCount,
  formatMembersLabel,
  canEditCircle,
  getCircleById,
  isUserCircleMember,
  listCircleMembers,
  toggleJoinCircle,
  updateCircle,
  CIRCLE_VISIBILITY,
  CIRCLE_ROLES,
} from "../../lib/circles";
import * as ImagePicker from "expo-image-picker";
import { ResizeMode, Video } from "expo-av";
import { getPlaybackUriForPost } from "../../lib/muxPlayback";
import { isMuxPlaceholderVideo } from "../../lib/mediaType";

const TABS = ["feed", "events", "members", "about"];
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

function resolvePostThumb(post) {
  if (!post) return null;
  if (post.postType === "text") return null;
  if (post.postType === "photo") {
    return post.photo || (Array.isArray(post.photos) ? post.photos[0] : null);
  }
  const thumb = post.thumbnail;
  if (typeof thumb === "string" && thumb.startsWith("http")) return thumb;
  if (thumb) {
    try {
      return getPhotoUrl(thumb) || thumb;
    } catch (_) {
      return thumb;
    }
  }
  return null;
}

function resolveCreator(post) {
  const c = post?.creator;
  if (c && typeof c === "object") {
    return {
      id: c.$id || c.id || post?.creatorId || "",
      username: c.username || c.name || post?.creatorUsername || "User",
      avatar: c.avatar || post?.creatorAvatar || "",
    };
  }
  return {
    id: typeof c === "string" ? c : post?.creatorId || "",
    username: post?.creatorUsername || post?.username || "User",
    avatar: post?.creatorAvatar || post?.avatar || "",
  };
}

function postTypeLabelKey(postType) {
  if (postType === "photo") return "circles.postTypePhoto";
  if (postType === "text") return "circles.postTypeText";
  return "circles.postTypeVideo";
}

function getPostLikeIds(post) {
  if (!post) return [];
  if (Array.isArray(post.likes)) return post.likes.map(String).filter(Boolean);
  return [];
}

export default function CircleDetailScreen() {
  const { id: idParam } = useLocalSearchParams();
  const circleId = Array.isArray(idParam) ? idParam[0] : idParam;
  const { user, theme, isDarkMode, isRTL } = useGlobalContext();
  const { t } = useTranslation();

  const [circle, setCircle] = useState(null);
  const [members, setMembers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [events, setEvents] = useState([]);
  const [joined, setJoined] = useState(false);
  const [activeTab, setActiveTab] = useState("feed");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showEventModal, setShowEventModal] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventPlace, setEventPlace] = useState("");
  const [eventNote, setEventNote] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState(() => defaultCircleEventDate());
  const [savingEvent, setSavingEvent] = useState(false);
  const [rsvpBusyId, setRsvpBusyId] = useState(null);
  const [myRole, setMyRole] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editTagline, setEditTagline] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editIcon, setEditIcon] = useState("users");
  const [editLocal, setEditLocal] = useState(false);
  const [editPrivate, setEditPrivate] = useState(false);
  const [editAvatarFile, setEditAvatarFile] = useState(null);
  const [editBannerFile, setEditBannerFile] = useState(null);
  const [viewerPost, setViewerPost] = useState(null);
  const [likingPostId, setLikingPostId] = useState(null);
  const [commentPost, setCommentPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentSending, setCommentSending] = useState(false);
  const [commentCounts, setCommentCounts] = useState({});

  const themedColor = useCallback(
    (darkColor, lightColor) => (isDarkMode ? darkColor : lightColor),
    [isDarkMode]
  );

  const panelBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.textBackgroundLight),
    [isDarkMode]
  );

  const load = useCallback(async () => {
    if (!circleId) return;
    const [doc, memberList, isMember, circlePosts, circleEvents] =
      await Promise.all([
        getCircleById(circleId),
        listCircleMembers(circleId),
        isUserCircleMember(circleId, user?.$id),
        getCirclePosts(circleId),
        listCircleEvents(circleId),
      ]);
    setCircle(doc);
    setMembers(memberList);
    setJoined(isMember);
    setPosts(circlePosts || []);
    setEvents(circleEvents || []);
    const mine = (memberList || []).find(
      (m) => String(m.userId) === String(user?.$id || "")
    );
    setMyRole(mine?.role || null);
  }, [circleId, user?.$id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        if (__DEV__) console.warn("[circle detail] load failed", e?.message || e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const sub = subscribeContentFeedInvalidate(() => {
      getCirclePosts(circleId).then((list) => setPosts(list || [])).catch(() => {});
    });
    return () => sub?.remove?.();
  }, [circleId]);

  // Refresh when returning from /circle/create or other screens.
  useFocusEffect(
    useCallback(() => {
      if (!circleId) return undefined;
      let cancelled = false;
      (async () => {
        try {
          const [circlePosts, memberList, isMember] = await Promise.all([
            getCirclePosts(circleId),
            listCircleMembers(circleId),
            isUserCircleMember(circleId, user?.$id),
          ]);
          if (cancelled) return;
          setPosts(circlePosts || []);
          setMembers(memberList || []);
          setJoined(isMember);
          const mine = (memberList || []).find(
            (m) => String(m.userId) === String(user?.$id || "")
          );
          setMyRole(mine?.role || null);
        } catch (_) {
          /* keep current UI */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [circleId, user?.$id])
  );

  const canManage = useMemo(
    () => canEditCircle(circle, myRole, user?.$id),
    [circle, myRole, user?.$id]
  );

  const isPrivateLocked = useMemo(() => {
    if (!circle) return false;
    if (circle.visibility !== CIRCLE_VISIBILITY.PRIVATE) return false;
    if (canManage) return false;
    return !joined;
  }, [circle, canManage, joined]);

  const openCreateInCircle = useCallback(() => {
    if (!circleId) return;
    if (!user?.$id) {
      Alert.alert(t("alerts.loginRequired"));
      return;
    }
    if (isPrivateLocked || (!joined && !canManage)) {
      Alert.alert(t("circles.joinToPostTitle"), t("circles.joinToPostMessage"));
      return;
    }
    router.push({
      pathname: "/circle/create",
      params: {
        circleId: String(circleId),
        circleName: circle?.name || "",
      },
    });
  }, [circleId, circle?.name, user?.$id, t, isPrivateLocked, joined, canManage]);

  const patchPostLikes = useCallback((postId, likes) => {
    setPosts((prev) =>
      prev.map((p) => (p.$id === postId ? { ...p, likes } : p))
    );
    setViewerPost((prev) =>
      prev && prev.$id === postId ? { ...prev, likes } : prev
    );
    setCommentPost((prev) =>
      prev && prev.$id === postId ? { ...prev, likes } : prev
    );
  }, []);

  const handleToggleLike = useCallback(
    async (post) => {
      if (!post?.$id) return;
      if (!user?.$id) {
        Alert.alert(t("alerts.loginRequired"));
        return;
      }
      if (likingPostId) return;
      const prevLikes = getPostLikeIds(post);
      const uid = String(user.$id);
      const liked = prevLikes.includes(uid);
      const nextLikes = liked
        ? prevLikes.filter((id) => id !== uid)
        : [...prevLikes, uid];
      patchPostLikes(post.$id, nextLikes);
      setLikingPostId(post.$id);
      try {
        const updated = await toggleLikePost(
          post.$id,
          user.$id,
          post.postType || null
        );
        if (Array.isArray(updated?.likes)) {
          patchPostLikes(post.$id, updated.likes.map(String));
        }
      } catch (e) {
        patchPostLikes(post.$id, prevLikes);
        Alert.alert(
          t("circles.likeFailedTitle"),
          e?.message || t("circles.likeFailedMessage")
        );
      } finally {
        setLikingPostId(null);
      }
    },
    [user, likingPostId, patchPostLikes, t]
  );

  const openComments = useCallback(
    async (post) => {
      if (!post?.$id) return;
      setCommentPost(post);
      setCommentText("");
      setComments([]);
      setCommentsLoading(true);
      try {
        const list = await getComments(post.$id);
        setComments(Array.isArray(list) ? list : []);
        setCommentCounts((prev) => ({
          ...prev,
          [post.$id]: Array.isArray(list) ? list.length : 0,
        }));
      } catch (e) {
        Alert.alert(
          t("circles.commentsFailedTitle"),
          e?.message || t("circles.commentsFailedMessage")
        );
      } finally {
        setCommentsLoading(false);
      }
    },
    [t]
  );

  const handleSendComment = useCallback(async () => {
    if (!commentPost?.$id || !user?.$id || commentSending) return;
    const text = commentText.trim();
    if (!text) return;
    setCommentSending(true);
    try {
      await addComment(commentPost.$id, user.$id, text);
      const list = await getComments(commentPost.$id);
      setComments(Array.isArray(list) ? list : []);
      setCommentCounts((prev) => ({
        ...prev,
        [commentPost.$id]: Array.isArray(list) ? list.length : 0,
      }));
      setCommentText("");
    } catch (e) {
      Alert.alert(
        t("circles.commentFailedTitle"),
        e?.message || t("circles.commentFailedMessage")
      );
    } finally {
      setCommentSending(false);
    }
  }, [commentPost, user, commentSending, commentText, t]);

  const renderEngagementBar = useCallback(
    (post, { light = false } = {}) => {
      const likeIds = getPostLikeIds(post);
      const liked = user?.$id ? likeIds.includes(String(user.$id)) : false;
      const likeCount = likeIds.length;
      const commentCount = commentCounts[post.$id];
      const iconColor = light
        ? liked
          ? theme.accent
          : "#fff"
        : liked
          ? theme.accent
          : theme.textSecondary;
      const textColor = light ? "#fff" : theme.textSecondary;
      return (
        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 18,
            paddingHorizontal: light ? 0 : 12,
            paddingBottom: light ? 0 : 12,
            paddingTop: light ? 12 : 4,
          }}
        >
          <TouchableOpacity
            onPress={() => handleToggleLike(post)}
            hitSlop={8}
            disabled={likingPostId === post.$id}
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 6,
              opacity: likingPostId === post.$id ? 0.6 : 1,
            }}
          >
            <Feather
              name="heart"
              size={18}
              color={iconColor}
              style={liked ? { opacity: 1 } : undefined}
            />
            <Text
              style={{
                color: textColor,
                fontFamily: "Poppins-Regular",
                fontSize: 13,
              }}
            >
              {likeCount > 0 ? String(likeCount) : t("circles.like")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openComments(post)}
            hitSlop={8}
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Feather name="message-circle" size={18} color={iconColor} />
            <Text
              style={{
                color: textColor,
                fontFamily: "Poppins-Regular",
                fontSize: 13,
              }}
            >
              {typeof commentCount === "number" && commentCount > 0
                ? String(commentCount)
                : t("circles.comment")}
            </Text>
          </TouchableOpacity>
        </View>
      );
    },
    [
      user?.$id,
      commentCounts,
      theme,
      isRTL,
      likingPostId,
      handleToggleLike,
      openComments,
      t,
    ]
  );

  const openEditCircle = useCallback(() => {
    if (!circle || !canManage) return;
    setEditName(circle.name || "");
    setEditTagline(circle.tagline || "");
    setEditDescription(circle.description || "");
    setEditTags((circle.tags || []).join(", "));
    setEditIcon(circle.icon || "users");
    setEditLocal(
      (circle.filterKeys || []).includes("local") ||
        (circle.tags || []).some((tag) => /local/i.test(tag))
    );
    setEditPrivate(circle.visibility === CIRCLE_VISIBILITY.PRIVATE);
    setEditAvatarFile(null);
    setEditBannerFile(null);
    setShowEditModal(true);
  }, [circle, canManage]);

  const pickEditImage = useCallback(async (kind) => {
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
      if (kind === "banner") setEditBannerFile(file);
      else setEditAvatarFile(file);
    } catch (e) {
      Alert.alert(t("common.error"), e?.message || t("alerts.mediaSelectError"));
    }
  }, [t]);

  const handleSaveEdit = useCallback(async () => {
    if (!circle?.$id || savingEdit) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert(t("circles.createNameRequired"));
      return;
    }
    const tags = editTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    if (editLocal && !tags.some((tag) => /local/i.test(tag))) {
      tags.push("Local");
    }
    const filterKeys = ["all", "interests"];
    if (editLocal || tags.some((tag) => /local/i.test(tag))) {
      filterKeys.push("local");
    }
    if ((circle.filterKeys || []).includes("popular")) {
      filterKeys.push("popular");
    }

    setSavingEdit(true);
    try {
      const fields = {
        name: trimmed,
        tagline: editTagline,
        description: editDescription,
        tags,
        filterKeys,
        icon: editIcon,
        visibility: editPrivate
          ? CIRCLE_VISIBILITY.PRIVATE
          : CIRCLE_VISIBILITY.PUBLIC,
      };
      if (editAvatarFile?.uri) {
        fields.avatar = (await uploadFile(editAvatarFile, "image")) || "";
      }
      if (editBannerFile?.uri) {
        fields.banner = (await uploadFile(editBannerFile, "image")) || "";
      }
      const updated = await updateCircle(circle.$id, fields);
      if (updated) setCircle(updated);
      setShowEditModal(false);
    } catch (e) {
      Alert.alert(
        t("circles.editFailedTitle"),
        e?.message || t("circles.editFailedMessage")
      );
    } finally {
      setSavingEdit(false);
    }
  }, [
    circle,
    savingEdit,
    editName,
    editTags,
    editLocal,
    editPrivate,
    editTagline,
    editDescription,
    editIcon,
    editAvatarFile,
    editBannerFile,
    t,
  ]);

  const openCreateEvent = useCallback(() => {
    if (!user?.$id) {
      Alert.alert(t("alerts.loginRequired"));
      return;
    }
    if (isPrivateLocked || (!joined && !canManage)) {
      Alert.alert(t("circles.joinToPostTitle"), t("circles.joinToPostMessage"));
      return;
    }
    setEventTitle("");
    setEventPlace("");
    setEventNote("");
    setEventStartsAt(defaultCircleEventDate());
    setShowEventModal(true);
  }, [user?.$id, t, isPrivateLocked, joined, canManage]);

  const handleCreateEvent = useCallback(async () => {
    if (!circleId || savingEvent) return;
    const trimmed = eventTitle.trim();
    if (!trimmed) {
      Alert.alert(t("circles.eventTitleRequired"));
      return;
    }
    setSavingEvent(true);
    try {
      const created = await createCircleEvent({
        user,
        circleId,
        title: trimmed,
        placeLabel: eventPlace,
        note: eventNote,
        startsAt: eventStartsAt,
      });
      if (created) {
        setEvents((prev) => {
          const next = [created, ...prev.filter((e) => e.$id !== created.$id)];
          return next.sort(
            (a, b) =>
              new Date(a.startsAt || a.createdAt || 0).getTime() -
              new Date(b.startsAt || b.createdAt || 0).getTime()
          );
        });
      }
      setShowEventModal(false);
    } catch (e) {
      Alert.alert(
        t("circles.eventCreateFailedTitle"),
        e?.message || t("circles.eventCreateFailedMessage")
      );
    } finally {
      setSavingEvent(false);
    }
  }, [
    circleId,
    savingEvent,
    eventTitle,
    eventPlace,
    eventNote,
    eventStartsAt,
    user,
    t,
  ]);

  const handleToggleRsvp = useCallback(
    async (event) => {
      if (!user?.$id) {
        Alert.alert(t("alerts.loginRequired"));
        return;
      }
      if (!event?.$id || rsvpBusyId) return;
      setRsvpBusyId(event.$id);
      try {
        const next = await toggleCircleEventRsvp({ event, user });
        if (next) {
          setEvents((prev) =>
            prev.map((item) => (item.$id === next.$id ? next : item))
          );
        }
      } catch (e) {
        Alert.alert(t("circles.rsvpFailedTitle"), e?.message || t("circles.rsvpFailedMessage"));
      } finally {
        setRsvpBusyId(null);
      }
    },
    [user, rsvpBusyId, t]
  );

  const handleDeleteEvent = useCallback(
    (event) => {
      if (!user?.$id || String(event.creatorId) !== String(user.$id)) return;
      Alert.alert(t("circles.deleteEventTitle"), t("circles.deleteEventMessage"), [
        { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
        {
          text: t("common.delete", { defaultValue: "Delete" }),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteCircleEvent({ event, user });
              setEvents((prev) => prev.filter((item) => item.$id !== event.$id));
            } catch (e) {
              Alert.alert(
                t("circles.deleteEventFailedTitle"),
                e?.message || t("circles.deleteEventFailedMessage")
              );
            }
          },
        },
      ]);
    },
    [user, t]
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleToggleJoin = useCallback(async () => {
    if (!user?.$id) {
      Alert.alert(t("alerts.loginRequired"));
      return;
    }
    if (!circle || joining) return;

    const wasJoined = joined;
    setJoining(true);
    setJoined(!wasJoined);
    setCircle((prev) => {
      if (!prev) return prev;
      const memberCount = Math.max(
        0,
        (Number(prev.memberCount) || 0) + (wasJoined ? -1 : 1)
      );
      return {
        ...prev,
        memberCount,
        membersLabel: formatMemberCount(memberCount),
      };
    });

    try {
      const result = await toggleJoinCircle({
        circle,
        user,
        isJoined: wasJoined,
      });
      if (result?.circle) setCircle(result.circle);
      setJoined(Boolean(result?.joined));
      const memberList = await listCircleMembers(circleId);
      setMembers(memberList);
      const mine = (memberList || []).find(
        (m) => String(m.userId) === String(user.$id)
      );
      setMyRole(result?.joined ? mine?.role || CIRCLE_ROLES.MEMBER : null);
    } catch (e) {
      setJoined(wasJoined);
      setCircle(circle);
      Alert.alert(
        t("circles.joinFailedTitle"),
        e?.message || t("circles.joinFailedMessage")
      );
    } finally {
      setJoining(false);
    }
  }, [user, circle, joining, joined, circleId, t]);

  const renderMember = useCallback(
    ({ item }) => (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => router.push(`/profile/${item.userId}`)}
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 4,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
        }}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            overflow: "hidden",
            backgroundColor: themedColor("rgba(255,156,1,0.15)", "rgba(255,156,1,0.12)"),
            alignItems: "center",
            justifyContent: "center",
            marginRight: isRTL ? 0 : 12,
            marginLeft: isRTL ? 12 : 0,
          }}
        >
          {item.avatar ? (
            <Image
              source={{ uri: item.avatar }}
              style={{ width: 44, height: 44 }}
              resizeMode="cover"
            />
          ) : (
            <Feather name="user" size={20} color={theme.accent} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.textPrimary,
              fontFamily: "Poppins-SemiBold",
              fontSize: 15,
              textAlign: isRTL ? "right" : "left",
            }}
            numberOfLines={1}
          >
            {item.username || t("circles.anonymousMember")}
          </Text>
          <Text
            style={{
              color: theme.textSecondary,
              fontFamily: "Poppins-Regular",
              fontSize: 12,
              marginTop: 2,
              textAlign: isRTL ? "right" : "left",
              textTransform: "capitalize",
            }}
          >
            {t(`circles.roles.${item.role || "member"}`, {
              defaultValue: item.role || "member",
            })}
          </Text>
        </View>
        <Feather
          name={isRTL ? "chevron-left" : "chevron-right"}
          size={18}
          color={theme.textMuted || theme.textSecondary}
        />
      </TouchableOpacity>
    ),
    [isRTL, theme, themedColor, t]
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!circle) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ padding: 20 }}>
          <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 24 }}>
            <Feather name="arrow-left" size={24} color={theme.textPrimary} />
          </TouchableOpacity>
          <Text
            style={{
              color: theme.textPrimary,
              fontFamily: "Poppins-SemiBold",
              fontSize: 18,
              textAlign: "center",
            }}
          >
            {t("circles.notFound")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={["top"]}>
      <LinearGradient
        colors={
          isDarkMode
            ? ["#020617", "#0F172A", "#111827"]
            : ["#F8FAFC", "#EEF2FF", "#F8FAFC"]
        }
        style={{ flex: 1 }}
      >
        <ImageBackground
          source={panelBackgroundImage || images.backgroundImage}
          style={{ flex: 1 }}
          imageStyle={{ opacity: isDarkMode ? 0.4 : 0.8 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.accent}
              />
            }
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            {/* Top bar */}
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 16,
                paddingTop: 8,
                paddingBottom: 12,
              }}
            >
              <TouchableOpacity
                onPress={() => router.back()}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t("circles.back")}
              >
                <Feather
                  name={isRTL ? "arrow-right" : "arrow-left"}
                  size={24}
                  color={theme.textPrimary}
                />
              </TouchableOpacity>
              <View
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                {canManage ? (
                  <TouchableOpacity
                    hitSlop={12}
                    onPress={openEditCircle}
                    accessibilityRole="button"
                    accessibilityLabel={t("circles.editCircle")}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: themedColor(
                          "rgba(15,23,42,0.75)",
                          "#FFFFFF"
                        ),
                      }}
                    >
                      <Feather name="edit-2" size={16} color={theme.textPrimary} />
                    </View>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  hitSlop={12}
                  onPress={openCreateInCircle}
                  disabled={isPrivateLocked || (!joined && !canManage)}
                  style={{
                    opacity:
                      isPrivateLocked || (!joined && !canManage) ? 0.35 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      borderWidth: 1.5,
                      borderColor: theme.accent,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Feather name="plus" size={20} color={theme.accent} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Identity row */}
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                paddingHorizontal: 16,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  overflow: "hidden",
                  backgroundColor: themedColor(
                    "rgba(255,156,1,0.18)",
                    "rgba(255,156,1,0.12)"
                  ),
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: theme.accent,
                }}
              >
                {circle.avatar ? (
                  <Image
                    source={{ uri: circle.avatar }}
                    style={{ width: 72, height: 72 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Feather
                    name={circle.icon || "users"}
                    size={30}
                    color={theme.accent}
                  />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: theme.textPrimary,
                    fontFamily: "Poppins-Bold",
                    fontSize: 20,
                    textAlign: isRTL ? "right" : "left",
                  }}
                  numberOfLines={2}
                >
                    {circle.name}
                  </Text>
                  {circle.visibility === CIRCLE_VISIBILITY.PRIVATE ? (
                    <View
                      style={{
                        flexDirection: isRTL ? "row-reverse" : "row",
                        alignItems: "center",
                        gap: 4,
                        marginTop: 4,
                      }}
                    >
                      <Feather name="lock" size={12} color={theme.textSecondary} />
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontFamily: "Poppins-Regular",
                          fontSize: 12,
                        }}
                      >
                        {t("circles.privateBadge")}
                      </Text>
                    </View>
                  ) : null}
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 4,
                    }}
                  >
                  <Feather name="users" size={14} color={theme.textSecondary} />
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 13,
                    }}
                  >
                    {formatMembersLabel(circle.memberCount, t)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleToggleJoin}
                disabled={joining}
                activeOpacity={0.85}
                style={{
                  backgroundColor: joined
                    ? themedColor("#1E3A5F", "#DBEAFE")
                    : theme.accent,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 999,
                  minWidth: 88,
                  alignItems: "center",
                  opacity: joining ? 0.7 : 1,
                }}
              >
                {joining ? (
                  <ActivityIndicator
                    size="small"
                    color={joined ? themedColor("#93C5FD", "#1D4ED8") : "#0B0B0B"}
                  />
                ) : (
                  <Text
                    style={{
                      color: joined
                        ? themedColor("#93C5FD", "#1D4ED8")
                        : "#0B0B0B",
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 13,
                    }}
                  >
                    {joined ? t("circles.joined") : t("circles.join")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Tags */}
            {(circle.tags || []).length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingTop: 14,
                }}
              >
                {circle.tags.map((tag) => (
                  <View
                    key={tag}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: themedColor(
                        "rgba(30,41,59,0.9)",
                        "#E2E8F0"
                      ),
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontFamily: "Poppins-Medium",
                        fontSize: 12,
                      }}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            {/* Banner */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 16,
                height: 140,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: themedColor("#1E293B", "#CBD5E1"),
              }}
            >
              {circle.banner ? (
                <Image
                  source={{ uri: circle.banner }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={["#0F172A", "#1E3A5F", "#FF9C01"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={{
                    flex: 1,
                    justifyContent: "flex-end",
                    paddingHorizontal: 16,
                    paddingVertical: 18,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 16,
                      lineHeight: 22,
                    }}
                    numberOfLines={2}
                  >
                    {circle.tagline || t("circles.defaultTagline")}
                  </Text>
                </LinearGradient>
              )}
              {circle.banner && circle.tagline ? (
                <View
                  style={{
                    position: "absolute",
                    left: 16,
                    bottom: 16,
                    right: 16,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 15,
                      textShadowColor: "rgba(0,0,0,0.6)",
                      textShadowOffset: { width: 0, height: 1 },
                      textShadowRadius: 3,
                    }}
                  >
                    {circle.tagline}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Tabs */}
            <View
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                marginTop: 18,
                marginHorizontal: 16,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              {TABS.map((tab) => {
                const selected = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      alignItems: "center",
                      borderBottomWidth: selected ? 2 : 0,
                      borderBottomColor: theme.accent,
                      marginBottom: selected ? -1 : 0,
                    }}
                  >
                    <Text
                      style={{
                        color: selected ? theme.accent : theme.textSecondary,
                        fontFamily: selected
                          ? "Poppins-SemiBold"
                          : "Poppins-Regular",
                        fontSize: 13,
                      }}
                    >
                      {t(`circles.tabs.${tab}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Tab content */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              {isPrivateLocked ? (
                <View style={{ alignItems: "center", paddingVertical: 48 }}>
                  <Feather
                    name="lock"
                    size={36}
                    color={theme.textMuted || theme.textSecondary}
                  />
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 16,
                      marginTop: 12,
                      textAlign: "center",
                    }}
                  >
                    {t("circles.privateLockedTitle")}
                  </Text>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 13,
                      marginTop: 6,
                      textAlign: "center",
                      lineHeight: 20,
                      paddingHorizontal: 24,
                      marginBottom: 16,
                    }}
                  >
                    {t("circles.privateLockedSubtitle")}
                  </Text>
                  <TouchableOpacity
                    onPress={handleToggleJoin}
                    disabled={joining}
                    style={{
                      backgroundColor: theme.accent,
                      paddingHorizontal: 20,
                      paddingVertical: 10,
                      borderRadius: 999,
                    }}
                  >
                    <Text
                      style={{
                        color: "#0B0B0B",
                        fontFamily: "Poppins-SemiBold",
                        fontSize: 14,
                      }}
                    >
                      {t("circles.join")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {!isPrivateLocked && activeTab === "feed" ? (
                <View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={openCreateInCircle}
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderRadius: 14,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      marginBottom: 16,
                    }}
                  >
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        overflow: "hidden",
                        backgroundColor: themedColor(
                          "rgba(255,156,1,0.15)",
                          "rgba(255,156,1,0.12)"
                        ),
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {user?.avatar ? (
                        <Image
                          source={{ uri: user.avatar }}
                          style={{ width: 32, height: 32 }}
                        />
                      ) : (
                        <Feather name="user" size={15} color={theme.accent} />
                      )}
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: theme.textSecondary,
                        fontFamily: "Poppins-Regular",
                        fontSize: 14,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t("circles.createPostPlaceholder")}
                    </Text>
                    <Feather name="edit-3" size={16} color={theme.accent} />
                  </TouchableOpacity>

                  {posts.length === 0 ? (
                    <View
                      style={{
                        alignItems: "center",
                        paddingVertical: 36,
                        paddingHorizontal: 16,
                        borderRadius: 16,
                        backgroundColor: themedColor(
                          "rgba(15,23,42,0.72)",
                          "rgba(255,255,255,0.78)"
                        ),
                        borderWidth: 1,
                        borderColor: theme.border,
                      }}
                    >
                      <Feather
                        name="message-square"
                        size={36}
                        color={theme.textMuted || theme.textSecondary}
                      />
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 16,
                          marginTop: 12,
                          textAlign: "center",
                        }}
                      >
                        {t("circles.feedEmptyTitle")}
                      </Text>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontFamily: "Poppins-Regular",
                          fontSize: 13,
                          marginTop: 6,
                          textAlign: "center",
                          lineHeight: 20,
                          paddingHorizontal: 24,
                        }}
                      >
                        {t("circles.feedEmptySubtitle")}
                      </Text>
                    </View>
                  ) : (
                    posts.map((post) => {
                      const creator = resolveCreator(post);
                      const thumb = resolvePostThumb(post);
                      const title =
                        post.title ||
                        post.caption ||
                        post.prompt ||
                        t("circles.untitledPost");
                      return (
                        <View
                          key={`${post.postType}-${post.$id}`}
                          style={{
                            marginBottom: 16,
                            borderRadius: 16,
                            overflow: "hidden",
                            backgroundColor: theme.surface,
                            borderWidth: 1,
                            borderColor: theme.border,
                          }}
                        >
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => setViewerPost(post)}
                          >
                            <View
                              style={{
                                flexDirection: isRTL ? "row-reverse" : "row",
                                alignItems: "center",
                                padding: 12,
                                gap: 10,
                              }}
                            >
                              <View
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 18,
                                  overflow: "hidden",
                                  backgroundColor: themedColor(
                                    "rgba(255,156,1,0.15)",
                                    "rgba(255,156,1,0.12)"
                                  ),
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {creator.avatar ? (
                                  <Image
                                    source={{ uri: creator.avatar }}
                                    style={{ width: 36, height: 36 }}
                                  />
                                ) : (
                                  <Feather
                                    name="user"
                                    size={16}
                                    color={theme.accent}
                                  />
                                )}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{
                                    color: theme.textPrimary,
                                    fontFamily: "Poppins-SemiBold",
                                    fontSize: 14,
                                    textAlign: isRTL ? "right" : "left",
                                  }}
                                  numberOfLines={1}
                                >
                                  {creator.username}
                                </Text>
                                <Text
                                  style={{
                                    color: theme.textSecondary,
                                    fontFamily: "Poppins-Regular",
                                    fontSize: 11,
                                    textAlign: isRTL ? "right" : "left",
                                  }}
                                >
                                  {t(postTypeLabelKey(post.postType))}
                                </Text>
                              </View>
                            </View>
                            {post.postType === "text" ? (
                              <View
                                style={{
                                  paddingHorizontal: 14,
                                  paddingBottom: 10,
                                  paddingTop: 2,
                                }}
                              >
                                {post.title ? (
                                  <Text
                                    style={{
                                      color: theme.textPrimary,
                                      fontFamily: "Poppins-SemiBold",
                                      fontSize: 15,
                                      marginBottom: 6,
                                      textAlign: isRTL ? "right" : "left",
                                    }}
                                  >
                                    {post.title}
                                  </Text>
                                ) : null}
                                <Text
                                  style={{
                                    color: theme.textPrimary,
                                    fontFamily: "Poppins-Regular",
                                    fontSize: 14,
                                    lineHeight: 22,
                                    textAlign: isRTL ? "right" : "left",
                                  }}
                                >
                                  {post.body ||
                                    post.caption ||
                                    post.prompt ||
                                    t("circles.untitledPost")}
                                </Text>
                              </View>
                            ) : thumb ? (
                              <Image
                                source={{ uri: thumb }}
                                style={{ width: "100%", height: 200 }}
                                resizeMode="cover"
                              />
                            ) : (
                              <View
                                style={{
                                  height: 140,
                                  alignItems: "center",
                                  justifyContent: "center",
                                  backgroundColor: themedColor(
                                    "#1E293B",
                                    "#E2E8F0"
                                  ),
                                }}
                              >
                                <Feather
                                  name={
                                    post.postType === "photo" ? "image" : "play"
                                  }
                                  size={28}
                                  color={theme.textSecondary}
                                />
                              </View>
                            )}
                            {post.postType !== "text" ? (
                              <Text
                                style={{
                                  color: theme.textPrimary,
                                  fontFamily: "Poppins-Regular",
                                  fontSize: 14,
                                  paddingHorizontal: 12,
                                  paddingTop: 12,
                                  paddingBottom: 4,
                                  textAlign: isRTL ? "right" : "left",
                                }}
                                numberOfLines={3}
                              >
                                {title}
                              </Text>
                            ) : null}
                          </TouchableOpacity>
                          {renderEngagementBar(post)}
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}

              {!isPrivateLocked && activeTab === "events" ? (
                <View>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={openCreateEvent}
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      paddingVertical: 12,
                      borderRadius: 14,
                      backgroundColor: theme.accent,
                      marginBottom: 16,
                    }}
                  >
                    <Feather name="plus" size={18} color="#0B0B0B" />
                    <Text
                      style={{
                        color: "#0B0B0B",
                        fontFamily: "Poppins-SemiBold",
                        fontSize: 14,
                      }}
                    >
                      {t("circles.createEvent")}
                    </Text>
                  </TouchableOpacity>

                  {!areCircleEventsConfigured() ? (
                    <Text
                      style={{
                        color: theme.textMuted || theme.textSecondary,
                        fontFamily: "Poppins-Regular",
                        fontSize: 11,
                        marginBottom: 12,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t("circles.eventsLocalHint")}
                    </Text>
                  ) : null}

                  {events.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 40 }}>
                      <Feather
                        name="calendar"
                        size={36}
                        color={theme.textMuted || theme.textSecondary}
                      />
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 16,
                          marginTop: 12,
                        }}
                      >
                        {t("circles.eventsEmptyTitle")}
                      </Text>
                      <Text
                        style={{
                          color: theme.textSecondary,
                          fontFamily: "Poppins-Regular",
                          fontSize: 13,
                          marginTop: 6,
                          textAlign: "center",
                          lineHeight: 20,
                          paddingHorizontal: 24,
                        }}
                      >
                        {t("circles.eventsEmptySubtitle")}
                      </Text>
                    </View>
                  ) : (
                    events.map((event) => {
                      const going = (event.rsvpUserIds || []).includes(
                        String(user?.$id || "")
                      );
                      const busy = rsvpBusyId === event.$id;
                      const isOwner =
                        user?.$id &&
                        String(event.creatorId) === String(user.$id);
                      return (
                        <View
                          key={event.$id}
                          style={{
                            marginBottom: 14,
                            padding: 14,
                            borderRadius: 16,
                            backgroundColor: theme.surface,
                            borderWidth: 1,
                            borderColor: theme.border,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: isRTL ? "row-reverse" : "row",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  color: theme.textPrimary,
                                  fontFamily: "Poppins-SemiBold",
                                  fontSize: 16,
                                  textAlign: isRTL ? "right" : "left",
                                }}
                              >
                                {event.title}
                              </Text>
                              {event.whenLabel ? (
                                <View
                                  style={{
                                    flexDirection: isRTL
                                      ? "row-reverse"
                                      : "row",
                                    alignItems: "center",
                                    gap: 6,
                                    marginTop: 8,
                                  }}
                                >
                                  <Feather
                                    name="clock"
                                    size={14}
                                    color={theme.accent}
                                  />
                                  <Text
                                    style={{
                                      color: theme.textSecondary,
                                      fontFamily: "Poppins-Regular",
                                      fontSize: 13,
                                    }}
                                  >
                                    {event.whenLabel}
                                  </Text>
                                </View>
                              ) : null}
                              {event.placeLabel ? (
                                <View
                                  style={{
                                    flexDirection: isRTL
                                      ? "row-reverse"
                                      : "row",
                                    alignItems: "center",
                                    gap: 6,
                                    marginTop: 6,
                                  }}
                                >
                                  <Feather
                                    name="map-pin"
                                    size={14}
                                    color={theme.textSecondary}
                                  />
                                  <Text
                                    style={{
                                      color: theme.textSecondary,
                                      fontFamily: "Poppins-Regular",
                                      fontSize: 13,
                                      flex: 1,
                                      textAlign: isRTL ? "right" : "left",
                                    }}
                                  >
                                    {event.placeLabel}
                                  </Text>
                                </View>
                              ) : null}
                              {event.note ? (
                                <Text
                                  style={{
                                    color: theme.textSecondary,
                                    fontFamily: "Poppins-Regular",
                                    fontSize: 13,
                                    marginTop: 8,
                                    lineHeight: 20,
                                    textAlign: isRTL ? "right" : "left",
                                  }}
                                  numberOfLines={4}
                                >
                                  {event.note}
                                </Text>
                              ) : null}
                              <Text
                                style={{
                                  color: theme.textMuted || theme.textSecondary,
                                  fontFamily: "Poppins-Regular",
                                  fontSize: 12,
                                  marginTop: 10,
                                  textAlign: isRTL ? "right" : "left",
                                }}
                              >
                                {t("circles.rsvpCount", {
                                  count: event.rsvpCount || 0,
                                })}
                                {event.creatorUsername
                                  ? ` · ${t("circles.hostedBy", {
                                      name: event.creatorUsername,
                                    })}`
                                  : ""}
                              </Text>
                            </View>
                            {isOwner ? (
                              <TouchableOpacity
                                onPress={() => handleDeleteEvent(event)}
                                hitSlop={8}
                              >
                                <Feather
                                  name="trash-2"
                                  size={18}
                                  color={theme.textSecondary}
                                />
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          <TouchableOpacity
                            onPress={() => handleToggleRsvp(event)}
                            disabled={busy}
                            activeOpacity={0.85}
                            style={{
                              marginTop: 12,
                              alignSelf: isRTL ? "flex-end" : "flex-start",
                              paddingHorizontal: 16,
                              paddingVertical: 8,
                              borderRadius: 999,
                              backgroundColor: going
                                ? themedColor("#1E3A5F", "#DBEAFE")
                                : theme.accent,
                              opacity: busy ? 0.7 : 1,
                              minWidth: 96,
                              alignItems: "center",
                            }}
                          >
                            {busy ? (
                              <ActivityIndicator
                                size="small"
                                color={
                                  going
                                    ? themedColor("#93C5FD", "#1D4ED8")
                                    : "#0B0B0B"
                                }
                              />
                            ) : (
                              <Text
                                style={{
                                  color: going
                                    ? themedColor("#93C5FD", "#1D4ED8")
                                    : "#0B0B0B",
                                  fontFamily: "Poppins-SemiBold",
                                  fontSize: 13,
                                }}
                              >
                                {going
                                  ? t("circles.going")
                                  : t("circles.rsvp")}
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      );
                    })
                  )}
                </View>
              ) : null}

              {!isPrivateLocked && activeTab === "members" ? (
                members.length === 0 ? (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <Feather
                      name="users"
                      size={36}
                      color={theme.textMuted || theme.textSecondary}
                    />
                    <Text
                      style={{
                        color: theme.textSecondary,
                        fontFamily: "Poppins-Regular",
                        fontSize: 14,
                        marginTop: 12,
                        textAlign: "center",
                      }}
                    >
                      {t("circles.membersEmpty")}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={members}
                    keyExtractor={(item) => item.$id || `${item.circleId}:${item.userId}`}
                    renderItem={renderMember}
                    scrollEnabled={false}
                  />
                )
              ) : null}

              {!isPrivateLocked && activeTab === "about" ? (
                <View>
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 8,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontFamily: "Poppins-SemiBold",
                        fontSize: 16,
                        textAlign: isRTL ? "right" : "left",
                      }}
                    >
                      {t("circles.aboutHeading")}
                    </Text>
                    {canManage ? (
                      <TouchableOpacity onPress={openEditCircle} hitSlop={8}>
                        <Text
                          style={{
                            color: theme.accent,
                            fontFamily: "Poppins-SemiBold",
                            fontSize: 13,
                          }}
                        >
                          {t("circles.editCircle")}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 14,
                      lineHeight: 22,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {circle.description || t("circles.aboutFallback")}
                  </Text>
                  {(circle.tags || []).length > 0 ? (
                    <View style={{ marginTop: 20 }}>
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 15,
                          marginBottom: 10,
                          textAlign: isRTL ? "right" : "left",
                        }}
                      >
                        {t("circles.topicsHeading")}
                      </Text>
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {circle.tags.map((tag) => (
                          <View
                            key={`about-${tag}`}
                            style={{
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 999,
                              backgroundColor: themedColor(
                                "rgba(255,156,1,0.15)",
                                "rgba(255,156,1,0.12)"
                              ),
                            }}
                          >
                            <Text
                              style={{
                                color: theme.accent,
                                fontFamily: "Poppins-Medium",
                                fontSize: 12,
                              }}
                            >
                              {tag}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <Modal
            visible={showEventModal}
            animationType="slide"
            transparent
            onRequestClose={() => !savingEvent && setShowEventModal(false)}
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
                    {t("circles.createEvent")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => !savingEvent && setShowEventModal(false)}
                    hitSlop={10}
                  >
                    <Feather name="x" size={22} color={theme.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 36 }}
                  keyboardShouldPersistTaps="handled"
                >
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 13,
                      marginBottom: 6,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.eventTitleLabel")}
                  </Text>
                  <TextInput
                    value={eventTitle}
                    onChangeText={setEventTitle}
                    placeholder={t("circles.eventTitlePlaceholder")}
                    placeholderTextColor={theme.textSecondary}
                    style={{
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.textPrimary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 15,
                      marginBottom: 14,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 13,
                      marginBottom: 6,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.eventPlaceLabel")}
                  </Text>
                  <TextInput
                    value={eventPlace}
                    onChangeText={setEventPlace}
                    placeholder={t("circles.eventPlacePlaceholder")}
                    placeholderTextColor={theme.textSecondary}
                    style={{
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      color: theme.textPrimary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 15,
                      marginBottom: 14,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 13,
                      marginBottom: 6,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.eventNoteLabel")}
                  </Text>
                  <TextInput
                    value={eventNote}
                    onChangeText={setEventNote}
                    placeholder={t("circles.eventNotePlaceholder")}
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
                      fontFamily: "Poppins-Regular",
                      fontSize: 15,
                      marginBottom: 14,
                      minHeight: 44,
                      textAlignVertical: "top",
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />

                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 13,
                      marginBottom: 8,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  >
                    {t("circles.eventWhenLabel")}
                  </Text>
                  <MapDateTimePicker
                    value={eventStartsAt}
                    onChange={setEventStartsAt}
                    theme={theme}
                  />

                  <TouchableOpacity
                    onPress={handleCreateEvent}
                    disabled={savingEvent}
                    activeOpacity={0.85}
                    style={{
                      marginTop: 18,
                      marginBottom: 8,
                      backgroundColor: theme.accent,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      opacity: savingEvent ? 0.7 : 1,
                    }}
                  >
                    {savingEvent ? (
                      <ActivityIndicator color="#0B0B0B" />
                    ) : (
                      <Text
                        style={{
                          color: "#0B0B0B",
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 15,
                        }}
                      >
                        {t("circles.publishEvent")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <Modal
            visible={showEditModal}
            animationType="slide"
            transparent
            onRequestClose={() => !savingEdit && setShowEditModal(false)}
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
                    {t("circles.editCircle")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => !savingEdit && setShowEditModal(false)}
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
                    value={editName}
                    onChangeText={setEditName}
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
                    value={editTagline}
                    onChangeText={setEditTagline}
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
                    value={editDescription}
                    onChangeText={setEditDescription}
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
                    value={editTags}
                    onChangeText={setEditTags}
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
                    onPress={() => setEditLocal((v) => !v)}
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
                        backgroundColor: editLocal ? theme.accent : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {editLocal ? (
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
                    onPress={() => setEditPrivate((v) => !v)}
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
                        backgroundColor: editPrivate
                          ? theme.accent
                          : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {editPrivate ? (
                        <Feather name="check" size={14} color="#0B0B0B" />
                      ) : null}
                    </View>
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontFamily: "Poppins-Regular",
                        fontSize: 14,
                        flex: 1,
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
                      onPress={() => pickEditImage("avatar")}
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
                      {editAvatarFile?.uri || circle?.avatar ? (
                        <Image
                          source={{
                            uri: editAvatarFile?.uri || circle.avatar,
                          }}
                          style={{ width: 72, height: 72 }}
                        />
                      ) : (
                        <Feather name="camera" size={20} color={theme.accent} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => pickEditImage("banner")}
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
                      {editBannerFile?.uri || circle?.banner ? (
                        <Image
                          source={{
                            uri: editBannerFile?.uri || circle.banner,
                          }}
                          style={{ width: "100%", height: 72 }}
                          resizeMode="cover"
                        />
                      ) : (
                        <Text
                          style={{
                            color: theme.textSecondary,
                            fontSize: 12,
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
                      const selected = editIcon === iconName;
                      return (
                        <TouchableOpacity
                          key={iconName}
                          onPress={() => setEditIcon(iconName)}
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
                    onPress={handleSaveEdit}
                    disabled={savingEdit}
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: theme.accent,
                      borderRadius: 14,
                      paddingVertical: 14,
                      alignItems: "center",
                      opacity: savingEdit ? 0.7 : 1,
                    }}
                  >
                    {savingEdit ? (
                      <ActivityIndicator color="#0B0B0B" />
                    ) : (
                      <Text
                        style={{
                          color: "#0B0B0B",
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 15,
                        }}
                      >
                        {t("circles.saveCircle")}
                      </Text>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>

          <Modal
            visible={Boolean(viewerPost)}
            animationType="fade"
            transparent
            onRequestClose={() => setViewerPost(null)}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,0.94)",
                justifyContent: "center",
              }}
            >
              <TouchableOpacity
                onPress={() => setViewerPost(null)}
                style={{
                  position: "absolute",
                  top: 54,
                  right: 20,
                  zIndex: 2,
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="x" size={22} color="#fff" />
              </TouchableOpacity>

              {viewerPost ? (
                <View style={{ paddingHorizontal: 12 }}>
                  {viewerPost.postType === "text" ? (
                    <View
                      style={{
                        backgroundColor: "rgba(255,255,255,0.08)",
                        borderRadius: 16,
                        padding: 20,
                        minHeight: 200,
                        justifyContent: "center",
                      }}
                    >
                      {viewerPost.title ? (
                        <Text
                          style={{
                            color: "#fff",
                            fontFamily: "Poppins-SemiBold",
                            fontSize: 18,
                            marginBottom: 10,
                            textAlign: "center",
                          }}
                        >
                          {viewerPost.title}
                        </Text>
                      ) : null}
                      <Text
                        style={{
                          color: "#fff",
                          fontFamily: "Poppins-Regular",
                          fontSize: 16,
                          lineHeight: 24,
                          textAlign: "center",
                        }}
                      >
                        {viewerPost.body ||
                          viewerPost.caption ||
                          viewerPost.prompt ||
                          t("circles.untitledPost")}
                      </Text>
                    </View>
                  ) : viewerPost.postType === "photo" ? (
                    <Image
                      source={{
                        uri:
                          resolvePostThumb(viewerPost) ||
                          viewerPost.photo ||
                          "",
                      }}
                      style={{
                        width: "100%",
                        height: 420,
                        borderRadius: 12,
                      }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Video
                      source={{
                        uri:
                          getPlaybackUriForPost(viewerPost) ||
                          (!isMuxPlaceholderVideo(viewerPost.video)
                            ? getVideoPlaybackUrls(viewerPost.video)?.[0] ||
                              viewerPost.video
                            : "") ||
                          "",
                      }}
                      style={{
                        width: "100%",
                        height: 420,
                        borderRadius: 12,
                        backgroundColor: "#000",
                      }}
                      useNativeControls
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay
                    />
                  )}
                  {viewerPost.postType !== "text" ? (
                    <Text
                      style={{
                        color: "#fff",
                        fontFamily: "Poppins-SemiBold",
                        fontSize: 15,
                        marginTop: 14,
                        textAlign: "center",
                      }}
                      numberOfLines={3}
                    >
                      {viewerPost.title ||
                        viewerPost.caption ||
                        viewerPost.prompt ||
                        t("circles.untitledPost")}
                    </Text>
                  ) : null}
                  {resolveCreator(viewerPost).id ? (
                    <TouchableOpacity
                      onPress={() => {
                        const id = resolveCreator(viewerPost).id;
                        setViewerPost(null);
                        router.push(`/profile/${id}`);
                      }}
                      style={{ marginTop: 12, alignItems: "center" }}
                    >
                      <Text
                        style={{
                          color: theme.accent,
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 13,
                        }}
                      >
                        {t("circles.viewCreator", {
                          name: resolveCreator(viewerPost).username,
                        })}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <View style={{ alignItems: "center", marginTop: 4 }}>
                    {renderEngagementBar(viewerPost, { light: true })}
                  </View>
                </View>
              ) : null}
            </View>
          </Modal>

          <Modal
            visible={Boolean(commentPost)}
            animationType="slide"
            transparent
            onRequestClose={() => setCommentPost(null)}
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
                  maxHeight: "78%",
                  backgroundColor: theme.background,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  paddingBottom: Platform.OS === "ios" ? 28 : 16,
                }}
              >
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 16,
                    paddingTop: 16,
                    paddingBottom: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 17,
                    }}
                  >
                    {t("home.commentsTitle")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setCommentPost(null)}
                    hitSlop={10}
                  >
                    <Feather name="x" size={22} color={theme.textPrimary} />
                  </TouchableOpacity>
                </View>

                {commentsLoading ? (
                  <View style={{ paddingVertical: 40, alignItems: "center" }}>
                    <ActivityIndicator color={theme.accent} />
                  </View>
                ) : (
                  <FlatList
                    data={comments}
                    keyExtractor={(item) => item.$id}
                    contentContainerStyle={{
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      flexGrow: 1,
                    }}
                    ListEmptyComponent={() => (
                      <View style={{ paddingVertical: 36, alignItems: "center" }}>
                        <Text
                          style={{
                            color: theme.textSecondary,
                            fontFamily: "Poppins-Regular",
                            fontSize: 14,
                            textAlign: "center",
                          }}
                        >
                          {t("circles.noCommentsYet")}
                        </Text>
                      </View>
                    )}
                    renderItem={({ item }) => (
                      <View
                        style={{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          gap: 10,
                          marginBottom: 14,
                        }}
                      >
                        <View
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            overflow: "hidden",
                            backgroundColor: themedColor(
                              "rgba(255,156,1,0.15)",
                              "rgba(255,156,1,0.12)"
                            ),
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {item.avatar ? (
                            <Image
                              source={{ uri: item.avatar }}
                              style={{ width: 34, height: 34 }}
                            />
                          ) : (
                            <Feather name="user" size={14} color={theme.accent} />
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: theme.textPrimary,
                              fontFamily: "Poppins-SemiBold",
                              fontSize: 13,
                              textAlign: isRTL ? "right" : "left",
                            }}
                          >
                            {item.username || t("circles.anonymousMember")}
                          </Text>
                          <Text
                            style={{
                              color: theme.textPrimary,
                              fontFamily: "Poppins-Regular",
                              fontSize: 14,
                              marginTop: 2,
                              lineHeight: 20,
                              textAlign: isRTL ? "right" : "left",
                            }}
                          >
                            {item.content}
                          </Text>
                        </View>
                      </View>
                    )}
                  />
                )}

                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                  }}
                >
                  <TextInput
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder={t("home.commentPlaceholder")}
                    placeholderTextColor={theme.textSecondary}
                    style={{
                      flex: 1,
                      backgroundColor: theme.surface,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 999,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      color: theme.textPrimary,
                      fontFamily: "Poppins-Regular",
                      fontSize: 14,
                      textAlign: isRTL ? "right" : "left",
                    }}
                  />
                  <TouchableOpacity
                    onPress={handleSendComment}
                    disabled={commentSending || !commentText.trim()}
                    style={{
                      backgroundColor: theme.accent,
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity:
                        commentSending || !commentText.trim() ? 0.5 : 1,
                    }}
                  >
                    {commentSending ? (
                      <ActivityIndicator color="#0B0B0B" size="small" />
                    ) : (
                      <Feather name="send" size={18} color="#0B0B0B" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </ImageBackground>
      </LinearGradient>
    </SafeAreaView>
  );
}

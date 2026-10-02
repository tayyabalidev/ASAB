/**
 * Friends Live Map (Step 5): background sharing + nearby / share-started alerts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import MapView, { PROVIDER_DEFAULT, PROVIDER_GOOGLE } from "react-native-maps";
import { Feather, MaterialIcons } from "@expo/vector-icons";

import { images } from "../../constants";
import { useGlobalContext } from "../../context/GlobalProvider";
import {
  reverseGeocodeLabel,
  watchForegroundLocation,
} from "../../lib/locationPermissions";
import { LOCATION_PRIVACY_MODES } from "../../lib/locationSchema";
import {
  addLocationSharePartner,
  getConnectedUserIds,
  getLocationSharePartnerIds,
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
import { checkAndNotifyNearbyFriends, inviteUserToShareLocation } from "../../lib/locationNotifications";
import {
  callFriend,
  openFriendChat,
  openFriendProfile,
} from "../../lib/liveMapActions";
import * as ImagePicker from "expo-image-picker";
import { FriendLocationMarker, YouLocationMarker, MapMomentMarker, MapPinMarker, DraftPinMarker } from "../../components/LiveMapMarkers";
import FeedVideoPlayer from "../../components/FeedVideoPlayer";
import { databases, appwriteConfig, getPhotoUrl } from "../../lib/appwrite";
import {
  createMapMoment,
  getLikedFriendIds,
  listMapMoments,
  toggleFriendLike,
  toggleMomentLike,
} from "../../lib/mapMoments";
import {
  MAP_PIN_TYPES,
  MAP_PIN_VISIBILITY,
  createMapPin,
  defaultEventDate,
  deleteMapPin,
  formatPinDateTime,
  listMapPins,
  togglePinLike,
  togglePinRsvp,
} from "../../lib/mapPins";
import MapDateTimePicker from "../../components/MapDateTimePicker";

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
  const { partnerId: partnerIdParam } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const watchRef = useRef(null);
  const followingRef = useRef(true);
  const lastCoordsRef = useRef(null);
  const mapRegionRef = useRef(null);
  const draftPinRef = useRef(null);
  const geocodeSeq = useRef(0);
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
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCandidates, setInviteCandidates] = useState([]);
  const [inviteBusyId, setInviteBusyId] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [likedFriendIds, setLikedFriendIds] = useState([]);
  const [mapMoments, setMapMoments] = useState([]);
  const [mapPins, setMapPins] = useState([]);
  const [postingMoment, setPostingMoment] = useState(false);
  const [selectedMoment, setSelectedMoment] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [draftPin, setDraftPin] = useState(null);
  const [pinComposer, setPinComposer] = useState(null);
  const [pinType, setPinType] = useState(MAP_PIN_TYPES.EVENT);
  const [pinVisibility, setPinVisibility] = useState(MAP_PIN_VISIBILITY.FRIENDS);
  const [pinTitle, setPinTitle] = useState("");
  const [pinNote, setPinNote] = useState("");
  const [pinStartsAt, setPinStartsAt] = useState(defaultEventDate);
  const [savingPin, setSavingPin] = useState(false);
  draftPinRef.current = draftPin;

  const mapProvider = Platform.OS === "android" ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;
  const mapStyle = useMemo(() => (isDarkMode ? DARK_MAP_STYLE : []), [isDarkMode]);
  const mutualFriends = useMemo(() => getMutualFriendIds(user), [user]);

  useEffect(() => {
    const partnerId = Array.isArray(partnerIdParam) ? partnerIdParam[0] : partnerIdParam;
    if (!user?.$id || !partnerId) return;
    (async () => {
      await addLocationSharePartner(user.$id, String(partnerId));
      const coords = lastCoordsRef.current;
      if (!sharingRef.current || coords?.latitude == null) return;
      await upsertMyLocation({
        userId: user.$id,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        heading: coords.heading,
        speed: coords.speed,
        altitude: coords.altitude,
        isSharing: true,
        privacyMode: privacyRef.current,
        allowedViewerIds: [...allowedRef.current, String(partnerId)],
        force: true,
      });
    })().catch(() => {});
  }, [user?.$id, partnerIdParam]);

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
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e?.endCoordinates?.height || 0);
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setSearchFocused(false);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

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
      if (!mapRegionRef.current) {
        mapRegionRef.current = {
          ...next,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
      }
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

  const openInviteSheet = useCallback(async () => {
    if (!user?.$id) return;
    setInviteOpen(true);
    setInviteNote("");
    try {
      const mutualSet = new Set(getMutualFriendIds(user));
      const partners = await getLocationSharePartnerIds(user.$id);
      const ids = getConnectedUserIds(user, partners).filter(
        (id) => id && id !== String(user.$id)
      );
      const sharingIds = new Set(friendsOnMap.map((f) => String(f.userId)));
      const rows = await Promise.all(
        ids.slice(0, 80).map(async (id) => {
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
              alreadySharing: sharingIds.has(String(id)),
              isMutual: mutualSet.has(String(id)),
            };
          } catch {
            return {
              $id: id,
              username: id,
              avatar: "",
              alreadySharing: sharingIds.has(String(id)),
              isMutual: mutualSet.has(String(id)),
            };
          }
        })
      );
      rows.sort((a, b) => {
        if (a.isMutual !== b.isMutual) return a.isMutual ? -1 : 1;
        return String(a.username).localeCompare(String(b.username));
      });
      setInviteCandidates(rows);
    } catch (e) {
      setInviteNote(e?.message || "Could not load people to invite");
      setInviteCandidates([]);
    }
  }, [friendsOnMap, user]);

  const sendLocationInvite = useCallback(
    async (target) => {
      if (!user?.$id || !target?.$id) return;
      setInviteBusyId(target.$id);
      setInviteNote("");
      try {
        await inviteUserToShareLocation({ fromUser: user, toUserId: target.$id });
        const coords = lastCoordsRef.current;
        if (sharingRef.current && coords?.latitude != null) {
          await upsertMyLocation({
            userId: user.$id,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            heading: coords.heading,
            speed: coords.speed,
            altitude: coords.altitude,
            isSharing: true,
            privacyMode: privacyRef.current,
            allowedViewerIds: [...allowedRef.current, String(target.$id)],
            force: true,
          });
        }
        setInviteNote(`Invite sent to ${target.username}. They’ll appear when they share too.`);
      } catch (e) {
        setInviteNote(e?.message || "Invite failed");
      } finally {
        setInviteBusyId("");
      }
    },
    [user]
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
        const partners = await getLocationSharePartnerIds(user.$id);
        const { background } = await enableLocationSharingSession({
          user,
          privacyMode: mode,
          allowedViewerIds: partners,
          coords: coordsPayload,
          enableBackground: true,
          notifyFriends: true,
        });
        setIsSharing(true);
        setPrivacyMode(mode);
        setAllowedViewerIds(partners);
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

  const likedFriendSet = useMemo(
    () => new Set(likedFriendIds.map(String)),
    [likedFriendIds]
  );

  const refreshMapSocial = useCallback(async () => {
    if (!user?.$id) return;
    try {
      const [likes, moments, pins] = await Promise.all([
        getLikedFriendIds(user.$id),
        listMapMoments({
          viewerId: user.$id,
          friendIds: friendsOnMap.map((f) => f.userId),
        }),
        listMapPins({
          viewerId: user.$id,
          friendIds: friendsOnMap.map((f) => f.userId),
        }),
      ]);
      setLikedFriendIds(likes);
      setMapMoments(moments);
      setMapPins(pins);
    } catch (_) {
      /* ignore */
    }
  }, [user?.$id, friendsOnMap]);

  useEffect(() => {
    refreshMapSocial();
  }, [refreshMapSocial]);

  const handleToggleFriendLike = useCallback(
    async (friend) => {
      if (!user?.$id || !friend?.userId) return;
      const result = await toggleFriendLike(user.$id, friend.userId);
      setLikedFriendIds(result.ids);
    },
    [user?.$id]
  );

  const captureMapMedia = useCallback(
    async (kind) => {
      if (!user?.$id) return;
      const location = lastCoordsRef.current || coords;
      if (!location) {
        Alert.alert("Location needed", "Wait for GPS, then share a photo or short on the map.");
        return;
      }

      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        Alert.alert(
          "Camera permission",
          "Allow camera access so you can post a photo or video short on the Friends Live Map."
        );
        return;
      }

      const isVideo = kind === "video";
      if (isVideo) {
        try {
          const { Audio } = await import("expo-av");
          const mic = await Audio.requestPermissionsAsync();
          if (!mic.granted) {
            Alert.alert(
              "Microphone permission",
              "Allow microphone access to record a video short on the map."
            );
            return;
          }
        } catch (_) {
          /* camera may still prompt for mic on some devices */
        }
      }
      const result = await ImagePicker.launchCameraAsync(
        isVideo
          ? {
              mediaTypes: ImagePicker.MediaTypeOptions.Videos,
              videoMaxDuration: 30,
              quality: 0.6,
              allowsEditing: false,
            }
          : {
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: true,
              aspect: [1, 1],
            }
      );
      if (result.canceled || !result.assets?.[0]) return;

      setPostingMoment(true);
      try {
        const moment = await createMapMoment({
          user,
          photoAsset: isVideo ? undefined : result.assets[0],
          videoAsset: isVideo ? result.assets[0] : undefined,
          latitude: location.latitude,
          longitude: location.longitude,
          placeLabel,
        });
        setMapMoments((prev) => [moment, ...prev.filter((m) => m.$id !== moment.$id)]);
        setSelectedMoment(moment);
      } catch (e) {
        Alert.alert(
          isVideo ? "Could not post short" : "Could not post photo",
          e?.message || "Try again."
        );
      } finally {
        setPostingMoment(false);
      }
    },
    [coords, placeLabel, user]
  );

  const handleTakeMapPic = useCallback(() => {
    Alert.alert("Share on the map", "Post at your current location for friends to tap.", [
      { text: "Photo", onPress: () => captureMapMedia("photo") },
      { text: "Video short", onPress: () => captureMapMedia("video") },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [captureMapMedia]);

  const resetPinForm = useCallback(() => {
    setPinType(MAP_PIN_TYPES.EVENT);
    setPinVisibility(MAP_PIN_VISIBILITY.FRIENDS);
    setPinTitle("");
    setPinNote("");
    setPinStartsAt(defaultEventDate());
  }, []);

  const placeDraftPin = useCallback(
    async (coordinate, source = "map", { resetForm = false } = {}) => {
      if (!user?.$id) {
        Alert.alert("Sign in", "Sign in to drop a pin for friends.");
        return;
      }
      if (
        !coordinate ||
        !Number.isFinite(coordinate.latitude) ||
        !Number.isFinite(coordinate.longitude)
      ) {
        Alert.alert("Pick a place", "Tap anywhere on the map to place a pin.");
        return;
      }
      setFollowing(false);
      setSelectedPin(null);
      setSelectedMoment(null);
      if (source !== "drag") setPinComposer(null);
      if (resetForm) resetPinForm();
      const next = {
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        placeLabel: "",
        source,
      };
      setDraftPin(next);
      const seq = ++geocodeSeq.current;
      try {
        const label =
          (await reverseGeocodeLabel(coordinate.latitude, coordinate.longitude)) || "";
        if (seq !== geocodeSeq.current) return;
        setDraftPin((prev) =>
          prev &&
          prev.latitude === coordinate.latitude &&
          prev.longitude === coordinate.longitude
            ? { ...prev, placeLabel: label }
            : prev
        );
      } catch (_) {}
    },
    [resetPinForm, user?.$id]
  );

  const startPinPlacement = useCallback(() => {
    const region = mapRegionRef.current || lastCoordsRef.current || coords || DEFAULT_REGION;
    placeDraftPin(
      { latitude: region.latitude, longitude: region.longitude },
      "center",
      { resetForm: true }
    );
  }, [coords, placeDraftPin]);

  const confirmDraftLocation = useCallback(() => {
    if (!draftPin) return;
    setPinComposer({ ...draftPin });
  }, [draftPin]);

  const cancelPinPlacement = useCallback(() => {
    setDraftPin(null);
    setPinComposer(null);
  }, []);

  const handleSavePin = useCallback(async () => {
    if (!pinComposer || !user) return;
    setSavingPin(true);
    try {
      const pin = await createMapPin({
        user,
        pinType,
        visibility: pinVisibility,
        title: pinTitle,
        note: pinNote,
        startsAt: pinType === MAP_PIN_TYPES.EVENT ? pinStartsAt.toISOString() : "",
        whenLabel:
          pinType === MAP_PIN_TYPES.EVENT ? formatPinDateTime(pinStartsAt) : "",
        latitude: Number(draftPin?.latitude ?? pinComposer.latitude),
        longitude: Number(draftPin?.longitude ?? pinComposer.longitude),
        placeLabel: draftPin?.placeLabel || pinComposer.placeLabel || placeLabel,
      });
      setMapPins((prev) => [pin, ...prev.filter((item) => item.$id !== pin.$id)]);
      setPinComposer(null);
      setDraftPin(null);
      setSelectedPin(pin);
      mapRef.current?.animateToRegion?.(
        {
          latitude: pin.latitude,
          longitude: pin.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        400
      );
    } catch (e) {
      Alert.alert("Could not drop pin", e?.message || "Try again.");
    } finally {
      setSavingPin(false);
    }
  }, [draftPin, pinComposer, pinNote, pinStartsAt, pinTitle, pinType, pinVisibility, placeLabel, user]);

  const handleToggleMomentLike = useCallback(async () => {
    if (!selectedMoment || !user?.$id) return;
    const next = await toggleMomentLike({ moment: selectedMoment, userId: user.$id });
    setSelectedMoment(next);
    setMapMoments((prev) => prev.map((m) => (m.$id === next.$id ? next : m)));
  }, [selectedMoment, user?.$id]);

  const handleTogglePinLike = useCallback(async () => {
    if (!selectedPin || !user?.$id) return;
    const next = await togglePinLike({ pin: selectedPin, userId: user.$id });
    setSelectedPin(next);
    setMapPins((prev) => prev.map((item) => (item.$id === next.$id ? next : item)));
  }, [selectedPin, user?.$id]);

  const handleTogglePinRsvp = useCallback(async () => {
    if (!selectedPin || !user?.$id) return;
    const next = await togglePinRsvp({ pin: selectedPin, user });
    setSelectedPin(next);
    setMapPins((prev) => prev.map((item) => (item.$id === next.$id ? next : item)));
  }, [selectedPin, user]);

  const handleDeletePin = useCallback(async () => {
    if (!selectedPin || !user?.$id) return;
    try {
      await deleteMapPin({ pin: selectedPin, userId: user.$id });
      setMapPins((prev) => prev.filter((item) => item.$id !== selectedPin.$id));
      setSelectedPin(null);
    } catch (e) {
      Alert.alert("Could not remove pin", e?.message || "Try again.");
    }
  }, [selectedPin, user?.$id]);

  const resolveMomentAvatar = useCallback(
    (moment) => {
      if (!moment) return "";
      const raw =
        moment.avatar ||
        (String(moment.userId) === String(user?.$id) ? user?.avatar : "") ||
        friendsOnMap.find((f) => String(f.userId) === String(moment.userId))
          ?.avatar ||
        "";
      if (!raw || typeof raw !== "string") return "";
      const trimmed = raw.trim();
      if (!trimmed) return "";
      if (/^(https?:|file:|data:|content:)/i.test(trimmed)) return trimmed;
      return getPhotoUrl(trimmed) || trimmed;
    },
    [user?.$id, user?.avatar, friendsOnMap]
  );

  const resolveMomentName = useCallback(
    (moment) => {
      const existing = String(moment?.username || "").trim();
      if (existing && existing !== "User") return existing;
      if (String(moment?.userId) === String(user?.$id)) {
        return user?.username || "You";
      }
      return (
        friendsOnMap.find((f) => String(f.userId) === String(moment?.userId))
          ?.username || "Friend"
      );
    },
    [user?.$id, user?.username, friendsOnMap]
  );

  const momentsWithAvatars = useMemo(
    () =>
      mapMoments.map((moment) => ({
        ...moment,
        avatar: resolveMomentAvatar(moment),
        username: resolveMomentName(moment),
      })),
    [mapMoments, resolveMomentAvatar, resolveMomentName]
  );

  const pinsWithNames = useMemo(
    () =>
      mapPins.map((pin) => ({
        ...pin,
        username:
          String(pin.username || "").trim() && pin.username !== "User"
            ? pin.username
            : String(pin.userId) === String(user?.$id)
              ? user?.username || "You"
              : friendsOnMap.find((f) => String(f.userId) === String(pin.userId))
                  ?.username || pin.username || "Friend",
      })),
    [mapPins, user?.$id, user?.username, friendsOnMap]
  );

  const toggleAllowed = useCallback((friendId) => {
    setAllowedViewerIds((prev) => {
      const id = String(friendId);
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <MapView
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
        moveOnMarkerPress={false}
        onPanDrag={() => setFollowing(false)}
        onRegionChangeComplete={(region) => {
          if (region?.latitude != null) mapRegionRef.current = region;
        }}
        onPress={(event) => {
          const action = event?.nativeEvent?.action;
          if (action && action !== "press") return;
          const coordinate = event?.nativeEvent?.coordinate;
          if (!coordinate) return;
          placeDraftPin(coordinate, "map", { resetForm: !draftPinRef.current });
        }}
        onLongPress={(event) => {
          const coordinate = event?.nativeEvent?.coordinate;
          if (!coordinate) return;
          placeDraftPin(coordinate, "map", { resetForm: !draftPinRef.current });
        }}
        onPoiClick={(event) => {
          const coordinate = event?.nativeEvent?.coordinate;
          if (!coordinate) return;
          placeDraftPin(coordinate, "map", { resetForm: !draftPinRef.current });
        }}
      >
        {friendsOnMap.map((friend) => (
          <FriendLocationMarker
            key={friend.$id || friend.userId}
            friend={friend}
            borderColor={theme.border}
            labelColor="#0F172A"
            liked={likedFriendSet.has(String(friend.userId))}
            onPress={() => openFriendActions(friend)}
          />
        ))}

        {momentsWithAvatars.map((moment) => (
          <MapMomentMarker
            key={moment.$id}
            moment={moment}
            onPress={() => setSelectedMoment(moment)}
          />
        ))}

        {pinsWithNames.map((pin) => (
          <MapPinMarker
            key={pin.$id}
            pin={pin}
            onPress={() => setSelectedPin(pin)}
          />
        ))}

        <YouLocationMarker
          coordinate={coords}
          avatar={user?.avatar}
          labelColor="#0F172A"
        />

        <DraftPinMarker
          coordinate={draftPin}
          placeLabel={draftPin?.placeLabel}
          onDragEnd={(event) => {
            const coordinate = event?.nativeEvent?.coordinate;
            if (!coordinate) return;
            placeDraftPin(coordinate, "drag");
          }}
        />
      </MapView>

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
          <TouchableOpacity
            onPress={handleTakeMapPic}
            disabled={postingMoment || !coords}
            style={[
              styles.roundBtn,
              {
                backgroundColor: theme.accent,
                opacity: postingMoment || !coords ? 0.55 : 1,
              },
            ]}
            accessibilityLabel="Share a photo or video short on the map"
          >
            {postingMoment ? (
              <ActivityIndicator color="#111" size="small" />
            ) : (
              <Feather name="camera" size={22} color="#111" />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={startPinPlacement}
            style={[
              styles.roundBtn,
              {
                backgroundColor: draftPin ? "#F97316" : theme.surface,
              },
            ]}
            accessibilityLabel="Drop a pin anywhere on the map"
          >
            <Feather name="map-pin" size={22} color={draftPin ? "#fff" : theme.accent} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          pointerEvents="box-none"
          style={styles.bottomArea}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? Math.max(insets.bottom, 8) : 0}
        >
          <View
            pointerEvents="box-none"
            style={{
              paddingBottom:
                Platform.OS === "android"
                  ? Math.max(keyboardHeight - insets.bottom, 0)
                  : keyboardHeight > 0
                    ? 8
                    : 0,
            }}
          >
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

          {draftPin && !pinComposer ? (
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: isDarkMode ? "#0F172A" : "#FFFFFF",
                  borderColor: "#F97316",
                  borderWidth: 1,
                },
              ]}
            >
              <Text style={[styles.youTitle, { color: theme.textPrimary }]}>
                Confirm pin location
              </Text>
              <Text style={[styles.sheetText, { color: theme.textSecondary }]}>
                {draftPin.placeLabel ||
                  `${draftPin.latitude.toFixed(5)}, ${draftPin.longitude.toFixed(5)}`}
              </Text>
              <Text style={[styles.sheetHint, { color: theme.textMuted }]}>
                Tap another spot or drag the orange pin to move it.
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: theme.surfaceMuted }]}
                  onPress={cancelPinPlacement}
                >
                  <Text style={{ color: theme.textPrimary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: "#F97316" }]}
                  onPress={confirmDraftLocation}
                >
                  <Text style={{ color: "#fff", fontFamily: "Poppins-SemiBold" }}>
                    Confirm Location
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {!loading && !error && !(draftPin && !pinComposer) ? (
            <View
              style={[
                styles.sheet,
                {
                  backgroundColor: isDarkMode ? "#0F172A" : "#FFFFFF",
                  borderColor: theme.border,
                  borderWidth: 1,
                  maxHeight: searchFocused || keyboardHeight > 0 ? 280 : undefined,
                },
              ]}
            >
              {!(searchFocused || keyboardHeight > 0) ? (
                <>
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
                  <Text style={[styles.sheetHint, { color: theme.textMuted }]}>
                    Tap anywhere on the map to drop a pin, then drag it before you confirm.
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

              <View style={styles.inviteRow}>
                <TouchableOpacity
                  onPress={openInviteSheet}
                  style={[
                    styles.inviteBtn,
                    {
                      backgroundColor: theme.accentSoft || "rgba(255,156,1,0.18)",
                      borderColor: theme.accent,
                    },
                  ]}
                >
                  <Feather name="user-plus" size={16} color={theme.accent} />
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontFamily: "Poppins-SemiBold",
                      fontSize: 13,
                    }}
                  >
                    Invite to share
                  </Text>
                </TouchableOpacity>
              </View>
                </>
              ) : null}

              <View
                style={[
                  styles.searchRow,
                  {
                    backgroundColor: isDarkMode ? "#1E293B" : "#F1F5F9",
                    borderColor: theme.border,
                  },
                ]}
              >
                <Feather name="search" size={16} color={theme.textMuted} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search friends on map..."
                  placeholderTextColor={theme.inputPlaceholder || theme.textMuted}
                  style={[styles.searchInput, { color: theme.textPrimary }]}
                  autoCorrect={false}
                  autoCapitalize="none"
                  blurOnSubmit
                  returnKeyType="search"
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <Feather name="x" size={16} color={theme.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>
                Friends on map ({filteredFriends.length}
                {searchQuery.trim() ? ` / ${friendsOnMap.length}` : ""})
              </Text>

              {friendsOnMap.length === 0 ? (
                <Text style={[styles.sheetHint, { color: theme.textMuted }]}>
                  No one is sharing yet. Invite them (or follow each other) and
                  both turn Sharing on — Friends is enough; you don’t need Everyone.
                </Text>
              ) : filteredFriends.length === 0 ? (
                <Text style={[styles.sheetHint, { color: theme.textMuted }]}>
                  No friends match “{searchQuery.trim()}”.
                </Text>
              ) : (
                <ScrollView
                  style={{ maxHeight: searchFocused || keyboardHeight > 0 ? 120 : 180 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {filteredFriends.map((friend) => (
                    <TouchableOpacity
                      key={friend.userId}
                      style={styles.friendRow}
                      onPress={() => {
                        Keyboard.dismiss();
                        openFriendActions(friend);
                      }}
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
                      <TouchableOpacity
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          handleToggleFriendLike(friend);
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={styles.likeHit}
                        accessibilityLabel={
                          likedFriendSet.has(String(friend.userId))
                            ? "Unlike friend"
                            : "Like friend"
                        }
                      >
                        <MaterialIcons
                          name={
                            likedFriendSet.has(String(friend.userId))
                              ? "favorite"
                              : "favorite-border"
                          }
                          size={22}
                          color={
                            likedFriendSet.has(String(friend.userId))
                              ? "#FF4D6D"
                              : theme.textMuted
                          }
                        />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}
          </View>
        </KeyboardAvoidingView>
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

      <Modal
        visible={inviteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setInviteOpen(false)}
      >
        <View style={styles.inviteModalRoot}>
          <TouchableOpacity
            style={styles.inviteModalDismiss}
            activeOpacity={1}
            onPress={() => setInviteOpen(false)}
          />
          <View
            style={[
              styles.inviteSheet,
              { backgroundColor: isDarkMode ? "#0F172A" : "#FFFFFF" },
            ]}
          >
            <View style={styles.inviteHeader}>
              <Text
                style={[
                  styles.modalTitle,
                  { color: theme.textPrimary, flex: 1, marginBottom: 0 },
                ]}
              >
                Invite to share location
              </Text>
              <TouchableOpacity
                onPress={() => setInviteOpen(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={[
                  styles.roundBtn,
                  {
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: theme.surfaceMuted,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Close invite"
              >
                <Feather name="x" size={18} color={theme.textPrimary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sheetHint, { color: theme.textMuted, marginBottom: 8 }]}>
              Sends a notification asking them to open Live Map and turn Sharing
              on. Best results when you follow each other.
            </Text>
            {inviteNote ? (
              <Text style={{ color: theme.accent, marginBottom: 8 }}>{inviteNote}</Text>
            ) : null}

            <FlatList
              data={inviteCandidates}
              keyExtractor={(item) => String(item.$id)}
              style={styles.inviteList}
              contentContainerStyle={styles.inviteListContent}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              bounces
              ListEmptyComponent={
                <Text style={{ color: theme.textSecondary, paddingVertical: 20 }}>
                  Follow people from Discover / Friends first, then invite them
                  here.
                </Text>
              }
              renderItem={({ item: person }) => (
                <View style={styles.friendRow}>
                  <Image
                    source={
                      person.avatar ? { uri: person.avatar } : images.profile
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
                      {person.username}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {person.alreadySharing
                        ? "Already on map"
                        : person.isMutual
                          ? "Mutual friend"
                          : "Following / follower"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => sendLocationInvite(person)}
                    disabled={!!inviteBusyId || person.alreadySharing}
                    style={[
                      styles.inviteChip,
                      {
                        backgroundColor: person.alreadySharing
                          ? theme.surfaceMuted
                          : theme.accent,
                        opacity: inviteBusyId === person.$id ? 0.6 : 1,
                      },
                    ]}
                  >
                    {inviteBusyId === person.$id ? (
                      <ActivityIndicator color="#111" size="small" />
                    ) : (
                      <Text
                        style={{
                          color: person.alreadySharing ? theme.textMuted : "#111",
                          fontFamily: "Poppins-SemiBold",
                          fontSize: 12,
                        }}
                      >
                        {person.alreadySharing ? "Sharing" : "Invite"}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!selectedMoment}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMoment(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedMoment(null)}>
          <Pressable
            style={[styles.momentCard, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            {selectedMoment?.videoUrl ? (
              <View style={styles.momentPreviewWrap}>
                <FeedVideoPlayer
                  videoUrl={selectedMoment.videoUrl}
                  posterUri={selectedMoment.photoUrl || undefined}
                  shouldPlay
                  isLooping
                  isMuted={false}
                />
                <View style={styles.momentPhotoAvatarWrap}>
                  <Image
                    source={
                      resolveMomentAvatar(selectedMoment)
                        ? { uri: resolveMomentAvatar(selectedMoment) }
                        : images.profile
                    }
                    style={styles.momentPhotoAvatar}
                    resizeMode="cover"
                  />
                </View>
              </View>
            ) : selectedMoment?.photoUrl ? (
              <View style={styles.momentPreviewWrap}>
                <Image
                  source={{ uri: selectedMoment.photoUrl }}
                  style={styles.momentPreview}
                  resizeMode="cover"
                />
                <View style={styles.momentPhotoAvatarWrap}>
                  <Image
                    source={
                      resolveMomentAvatar(selectedMoment)
                        ? { uri: resolveMomentAvatar(selectedMoment) }
                        : images.profile
                    }
                    style={styles.momentPhotoAvatar}
                    resizeMode="cover"
                  />
                </View>
              </View>
            ) : null}
            <View style={styles.momentMeta}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>
                  {selectedMoment?.username || (selectedMoment?.videoUrl ? "Short" : "Photo")}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {selectedMoment?.placeLabel || "On the map"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleToggleMomentLike}
                style={styles.momentLikeBtn}
                accessibilityLabel="Like photo"
              >
                <MaterialIcons
                  name={
                    selectedMoment?.likedBy?.includes(String(user?.$id))
                      ? "favorite"
                      : "favorite-border"
                  }
                  size={26}
                  color={
                    selectedMoment?.likedBy?.includes(String(user?.$id))
                      ? "#FF4D6D"
                      : theme.textMuted
                  }
                />
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {selectedMoment?.likeCount || 0}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.surfaceMuted }]}
              onPress={() => setSelectedMoment(null)}
            >
              <Text style={{ color: theme.textPrimary }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!selectedPin}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPin(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelectedPin(null)}>
          <Pressable
            style={[styles.momentCard, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.pinDetailHeader}>
              <View
                style={[
                  styles.pinDetailIcon,
                  {
                    backgroundColor:
                      selectedPin?.pinType === MAP_PIN_TYPES.FAVORITE ? "#8B5CF6" : "#F97316",
                  },
                ]}
              >
                <Feather
                  name={selectedPin?.pinType === MAP_PIN_TYPES.FAVORITE ? "star" : "calendar"}
                  size={20}
                  color="#fff"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: "Poppins-SemiBold" }}>
                  {selectedPin?.pinType === MAP_PIN_TYPES.FAVORITE ? "Favorite spot" : "Upcoming event"}
                </Text>
                <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold", fontSize: 18 }}>
                  {selectedPin?.title}
                </Text>
              </View>
            </View>
            <View style={styles.pinBadgeRow}>
              <View style={[styles.pinInfoBadge, { backgroundColor: theme.surfaceMuted }]}>
                <Feather
                  name={selectedPin?.visibility === MAP_PIN_VISIBILITY.EVERYONE ? "globe" : "users"}
                  size={12}
                  color={theme.textSecondary}
                />
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {selectedPin?.visibility === MAP_PIN_VISIBILITY.EVERYONE ? "Public" : "Friends"}
                </Text>
              </View>
              {selectedPin?.pinType === MAP_PIN_TYPES.EVENT ? (
                <View style={[styles.pinInfoBadge, { backgroundColor: "rgba(249,115,22,0.16)" }]}>
                  <Feather name="user-check" size={12} color="#F97316" />
                  <Text style={{ color: theme.textPrimary, fontSize: 12 }}>
                    {selectedPin?.rsvpCount || 0} going
                  </Text>
                </View>
              ) : null}
            </View>
            {selectedPin?.startsAt || selectedPin?.whenLabel ? (
              <Text style={{ color: theme.textPrimary, fontSize: 14 }}>
                {formatPinDateTime(selectedPin?.startsAt) || selectedPin?.whenLabel}
              </Text>
            ) : null}
            {selectedPin?.note ? (
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                {selectedPin.note}
              </Text>
            ) : null}
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {selectedPin?.placeLabel || "Dropped on the map"} · {selectedPin?.username || "Friend"}
            </Text>
            {selectedPin?.pinType === MAP_PIN_TYPES.EVENT && selectedPin?.rsvpUsernames?.length ? (
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                {selectedPin.rsvpUsernames.slice(0, 3).join(", ")}
                {selectedPin.rsvpUsernames.length > 3
                  ? ` +${selectedPin.rsvpUsernames.length - 3} more`
                  : ""}
              </Text>
            ) : null}
            <View style={styles.momentMeta}>
              {selectedPin?.pinType === MAP_PIN_TYPES.EVENT ? (
                <TouchableOpacity
                  onPress={handleTogglePinRsvp}
                  style={[
                    styles.rsvpBtn,
                    {
                      backgroundColor: selectedPin?.rsvpUserIds?.includes(String(user?.$id))
                        ? "rgba(34,197,94,0.18)"
                        : theme.accent,
                    },
                  ]}
                >
                  <Feather
                    name={
                      selectedPin?.rsvpUserIds?.includes(String(user?.$id))
                        ? "check"
                        : "plus"
                    }
                    size={16}
                    color={
                      selectedPin?.rsvpUserIds?.includes(String(user?.$id))
                        ? "#16A34A"
                        : "#111"
                    }
                  />
                  <Text
                    style={{
                      color: selectedPin?.rsvpUserIds?.includes(String(user?.$id))
                        ? "#16A34A"
                        : "#111",
                      fontFamily: "Poppins-SemiBold",
                    }}
                  >
                    {selectedPin?.rsvpUserIds?.includes(String(user?.$id))
                      ? "Going"
                      : "RSVP"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={handleTogglePinLike}
                style={styles.momentLikeBtn}
                accessibilityLabel="Like pin"
              >
                <MaterialIcons
                  name={
                    selectedPin?.likedBy?.includes(String(user?.$id))
                      ? "favorite"
                      : "favorite-border"
                  }
                  size={26}
                  color={
                    selectedPin?.likedBy?.includes(String(user?.$id))
                      ? "#FF4D6D"
                      : theme.textMuted
                  }
                />
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {selectedPin?.likeCount || 0}
                </Text>
              </TouchableOpacity>
              {String(selectedPin?.userId) === String(user?.$id) ? (
                <TouchableOpacity
                  onPress={handleDeletePin}
                  style={[styles.modalBtn, { backgroundColor: theme.surfaceMuted, flex: 0, paddingHorizontal: 16 }]}
                >
                  <Text style={{ color: theme.danger || "#EF4444" }}>Remove</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.surfaceMuted }]}
              onPress={() => setSelectedPin(null)}
            >
              <Text style={{ color: theme.textPrimary }}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!pinComposer}
        transparent
        animationType="slide"
        onRequestClose={() => setPinComposer(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable style={styles.inviteModalDismiss} onPress={() => setPinComposer(null)} />
          <View style={[styles.inviteSheet, { backgroundColor: theme.surface }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Drop a pin</Text>
            <Text style={{ color: theme.textSecondary, fontSize: 13, marginBottom: 8 }}>
              {pinComposer?.placeLabel ||
                (pinComposer
                  ? `${Number(pinComposer.latitude).toFixed(5)}, ${Number(pinComposer.longitude).toFixed(5)}`
                  : "")}
            </Text>
            <View style={styles.pinTypeRow}>
              <TouchableOpacity
                onPress={() => setPinType(MAP_PIN_TYPES.EVENT)}
                style={[
                  styles.pinTypeChip,
                  {
                    borderColor: theme.border,
                    backgroundColor:
                      pinType === MAP_PIN_TYPES.EVENT ? "rgba(249,115,22,0.16)" : theme.surfaceMuted,
                  },
                ]}
              >
                <Feather name="calendar" size={16} color="#F97316" />
                <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>Event</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPinType(MAP_PIN_TYPES.FAVORITE)}
                style={[
                  styles.pinTypeChip,
                  {
                    borderColor: theme.border,
                    backgroundColor:
                      pinType === MAP_PIN_TYPES.FAVORITE ? "rgba(139,92,246,0.16)" : theme.surfaceMuted,
                  },
                ]}
              >
                <Feather name="star" size={16} color="#8B5CF6" />
                <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>Favorite</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.pinTypeRow}>
              <TouchableOpacity
                onPress={() => setPinVisibility(MAP_PIN_VISIBILITY.FRIENDS)}
                style={[
                  styles.pinTypeChip,
                  {
                    borderColor: theme.border,
                    backgroundColor:
                      pinVisibility === MAP_PIN_VISIBILITY.FRIENDS
                        ? theme.accentSoft || "rgba(255,156,1,0.16)"
                        : theme.surfaceMuted,
                  },
                ]}
              >
                <Feather name="users" size={16} color={theme.accent} />
                <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>Friends</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPinVisibility(MAP_PIN_VISIBILITY.EVERYONE)}
                style={[
                  styles.pinTypeChip,
                  {
                    borderColor: theme.border,
                    backgroundColor:
                      pinVisibility === MAP_PIN_VISIBILITY.EVERYONE
                        ? "rgba(34,197,94,0.16)"
                        : theme.surfaceMuted,
                  },
                ]}
              >
                <Feather name="globe" size={16} color="#16A34A" />
                <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold" }}>Public</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              value={pinTitle}
              onChangeText={setPinTitle}
              placeholder={pinType === MAP_PIN_TYPES.FAVORITE ? "Spot name" : "Event name"}
              placeholderTextColor={theme.inputPlaceholder || theme.textMuted}
              style={[
                styles.pinInput,
                { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceMuted },
              ]}
              maxLength={80}
            />
            {pinType === MAP_PIN_TYPES.EVENT ? (
              <MapDateTimePicker
                value={pinStartsAt}
                onChange={setPinStartsAt}
                theme={theme}
              />
            ) : null}
            <TextInput
              value={pinNote}
              onChangeText={setPinNote}
              placeholder="What should friends know?"
              placeholderTextColor={theme.inputPlaceholder || theme.textMuted}
              style={[
                styles.pinInput,
                styles.pinNoteInput,
                { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surfaceMuted },
              ]}
              maxLength={280}
              multiline
            />
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.surfaceMuted }]}
                onPress={() => setPinComposer(null)}
              >
                <Text style={{ color: theme.textPrimary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { backgroundColor: theme.accent, opacity: savingPin || !pinTitle.trim() ? 0.55 : 1 },
                ]}
                disabled={savingPin || !pinTitle.trim()}
                onPress={handleSavePin}
              >
                {savingPin ? (
                  <ActivityIndicator color="#111" size="small" />
                ) : (
                  <Text style={{ color: "#111", fontFamily: "Poppins-SemiBold" }}>Drop pin</Text>
                )}
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
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
  inviteRow: {
    marginTop: 4,
    marginBottom: 4,
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inviteChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: "center",
  },
  inviteHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  inviteModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  inviteModalDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  inviteSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: "78%",
    zIndex: 2,
    elevation: 8,
  },
  inviteList: {
    height: 360,
  },
  inviteListContent: {
    paddingBottom: 24,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  friendAvatar: { width: 36, height: 36, borderRadius: 18 },
  likeHit: {
    padding: 6,
  },
  momentCard: {
    width: "100%",
    borderRadius: 18,
    padding: 12,
    gap: 10,
    marginBottom: 24,
  },
  momentPreviewWrap: {
    width: "100%",
    height: 280,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#111",
  },
  momentPreview: {
    width: "100%",
    height: "100%",
  },
  momentPhotoAvatarWrap: {
    position: "absolute",
    left: 10,
    bottom: 10,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: "#fff",
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  momentPhotoAvatar: {
    width: "100%",
    height: "100%",
  },
  momentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  momentLikeBtn: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 40,
  },
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
  pinTypeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  pinTypeChip: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
  },
  pinInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  pinNoteInput: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  pinDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pinDetailIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pinBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pinInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  rsvpBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
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

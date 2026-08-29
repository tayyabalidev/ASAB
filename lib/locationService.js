/**
 * Friends Live Location — Appwrite publish / subscribe (Step 3).
 * Foreground only; privacy filtered client-side until document security is enabled.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Query } from "react-native-appwrite";

import { appwriteConfig, databases } from "./appwrite";
import {
  LOCATION_LIVE_THRESHOLD_MS,
  LOCATION_PRIVACY_MODES,
  LOCATION_UPDATE_DISTANCE_M,
  LOCATION_UPDATE_INTERVAL_MS,
} from "./locationSchema";
import { reverseGeocodeLabel } from "./locationPermissions";
import {
  isAppwriteRealtimeEnabled,
  refreshAppwriteRealtimeConnection,
  registerAppwriteRealtimeChannel,
} from "./appwriteRealtime";

const collectionId = () => appwriteConfig.userLocationsCollectionId;
const LOCATION_PARTNERS_KEY = (userId) => `asab_location_share_partners_${userId}`;

/** Normalize Appwrite ID arrays (string or `{ $id }`). */
export function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => {
          if (!item) return "";
          if (typeof item === "string") return item.trim();
          if (typeof item === "object") return String(item.$id || item.userId || "").trim();
          return String(item).trim();
        })
        .filter((id) => id && id !== "[object Object]")
    ),
  ];
}

export async function getLocationSharePartnerIds(userId) {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(LOCATION_PARTNERS_KEY(userId));
    return normalizeIdList(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export async function addLocationSharePartner(userId, partnerId) {
  const me = String(userId || "").trim();
  const them = String(partnerId || "").trim();
  if (!me || !them || me === them) return getLocationSharePartnerIds(me);
  const prev = await getLocationSharePartnerIds(me);
  if (prev.includes(them)) return prev;
  const next = [them, ...prev].slice(0, 200);
  await AsyncStorage.setItem(LOCATION_PARTNERS_KEY(me), JSON.stringify(next));
  try {
    const doc = await getMyLocationDocument(me);
    if (doc?.isSharing) {
      const allowed = [
        ...new Set([...normalizeIdList(doc.allowedViewerIds), them]),
      ];
      await databases.updateDocument(
        appwriteConfig.databaseId,
        collectionId(),
        doc.$id,
        { allowedViewerIds: allowed }
      );
    }
  } catch (_) {
    /* invite still counts locally */
  }
  return next;
}

/** @type {{ at: number, lat: number|null, lng: number|null }} */
let publishThrottle = { at: 0, lat: null, lng: null };

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function resetLocationPublishThrottle() {
  publishThrottle = { at: 0, lat: null, lng: null };
}

export function shouldPublishLocation(latitude, longitude, force = false) {
  if (force) return true;
  const now = Date.now();
  const { at, lat, lng } = publishThrottle;
  if (!at) return true;
  const elapsed = now - at;
  if (elapsed >= LOCATION_UPDATE_INTERVAL_MS) return true;
  if (lat == null || lng == null) return true;
  return (
    haversineMeters(lat, lng, latitude, longitude) >= LOCATION_UPDATE_DISTANCE_M
  );
}

function markPublished(latitude, longitude) {
  publishThrottle = { at: Date.now(), lat: latitude, lng: longitude };
}

/** Mutual follow: in my following AND in my followers. */
export function getMutualFriendIds(user) {
  const following = normalizeIdList(user?.following);
  const followerSet = new Set(normalizeIdList(user?.followers));
  const me = String(user?.$id || "");
  return following.filter((id) => followerSet.has(id) && id !== me);
}

/** People you follow, who follow you, plus location-invite partners. */
export function getConnectedUserIds(user, extraIds = []) {
  const me = String(user?.$id || "");
  return [
    ...new Set([
      ...normalizeIdList(user?.following),
      ...normalizeIdList(user?.followers),
      ...normalizeIdList(extraIds),
    ]),
  ].filter((id) => id && id !== me);
}

export function canViewerSeeLocationDoc(doc, viewerId, connectedIds = []) {
  if (!doc || !viewerId) return false;
  const ownerId = String(doc.userId || doc.$id || "");
  const viewer = String(viewerId);
  if (!ownerId || ownerId === viewer) return false;
  if (!doc.isSharing) return false;

  const mode = String(doc.privacyMode || LOCATION_PRIVACY_MODES.GHOST).toLowerCase();
  const allowed = normalizeIdList(doc.allowedViewerIds);
  if (mode === LOCATION_PRIVACY_MODES.GHOST) return false;
  if (mode === LOCATION_PRIVACY_MODES.EVERYONE) return true;
  if (mode === LOCATION_PRIVACY_MODES.FRIENDS) {
    // Follow / follower / invite partner, they listed you, or you invited them.
    return connectedIds.map(String).includes(ownerId) || allowed.includes(viewer);
  }
  if (mode === LOCATION_PRIVACY_MODES.SELECTED) {
    return allowed.includes(viewer);
  }
  return false;
}

export function getLocationFreshness(doc, nowMs = Date.now()) {
  const raw = doc?.lastSeenAt || doc?.updatedAtClient || doc?.$updatedAt;
  const ts = raw ? new Date(raw).getTime() : 0;
  if (!ts) {
    return { isLive: false, label: "Unknown", lastSeenAt: null, ageMs: null };
  }
  const ageMs = Math.max(0, nowMs - ts);
  if (ageMs <= LOCATION_LIVE_THRESHOLD_MS) {
    return { isLive: true, label: "Now", lastSeenAt: raw, ageMs };
  }
  const mins = Math.floor(ageMs / 60000);
  if (mins < 60) {
    return { isLive: false, label: `${Math.max(1, mins)}m`, lastSeenAt: raw, ageMs };
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return { isLive: false, label: `${hours}h`, lastSeenAt: raw, ageMs };
  }
  const days = Math.floor(hours / 24);
  return { isLive: false, label: `${days}d`, lastSeenAt: raw, ageMs };
}

export async function getMyLocationDocument(userId) {
  if (!userId || !collectionId()) return null;
  try {
    return await databases.getDocument(
      appwriteConfig.databaseId,
      collectionId(),
      userId
    );
  } catch {
    try {
      const res = await databases.listDocuments(
        appwriteConfig.databaseId,
        collectionId(),
        [Query.equal("userId", userId), Query.limit(1)]
      );
      return res.documents?.[0] || null;
    } catch {
      return null;
    }
  }
}

/**
 * Upsert the current user's location document (document ID = userId).
 */
export async function upsertMyLocation({
  userId,
  latitude,
  longitude,
  accuracy,
  heading,
  speed,
  altitude,
  placeLabel,
  isSharing,
  privacyMode,
  allowedViewerIds,
  force = false,
  skipGeocode = false,
}) {
  if (!userId || !collectionId()) {
    throw new Error("Location collection / user not configured");
  }

  const mode = String(privacyMode || LOCATION_PRIVACY_MODES.FRIENDS).toLowerCase();
  const sharing =
    Boolean(isSharing) && mode !== LOCATION_PRIVACY_MODES.GHOST;

  if (sharing && (latitude == null || longitude == null)) {
    throw new Error("Coordinates required while sharing");
  }

  if (
    sharing &&
    !shouldPublishLocation(latitude, longitude, force)
  ) {
    return { skipped: true, reason: "throttled" };
  }

  let label = placeLabel || "";
  if (sharing && !skipGeocode && !label && latitude != null && longitude != null) {
    label = await reverseGeocodeLabel(latitude, longitude);
  }

  const nowIso = new Date().toISOString();
  const data = {
    userId: String(userId),
    isSharing: sharing,
    privacyMode: sharing ? mode : LOCATION_PRIVACY_MODES.GHOST,
    allowedViewerIds: Array.isArray(allowedViewerIds)
      ? normalizeIdList(allowedViewerIds)
      : [],
    updatedAtClient: nowIso,
  };

  if (sharing && mode === LOCATION_PRIVACY_MODES.FRIENDS) {
    data.allowedViewerIds = await resolveFriendsAllowedIds(
      userId,
      data.allowedViewerIds
    );
  }

  if (sharing) {
    data.latitude = Number(latitude);
    data.longitude = Number(longitude);
    if (accuracy != null && Number.isFinite(Number(accuracy))) {
      data.accuracy = Number(accuracy);
    }
    if (heading != null && Number.isFinite(Number(heading))) {
      data.heading = Number(heading);
    }
    if (speed != null && Number.isFinite(Number(speed))) {
      data.speed = Number(speed);
    }
    if (altitude != null && Number.isFinite(Number(altitude))) {
      data.altitude = Number(altitude);
    }
    if (label) data.placeLabel = String(label).slice(0, 255);
    data.lastSeenAt = nowIso;
  } else {
    data.placeLabel = "";
  }

  try {
    const updated = await databases.updateDocument(
      appwriteConfig.databaseId,
      collectionId(),
      userId,
      data
    );
    if (sharing) markPublished(latitude, longitude);
    return { skipped: false, document: updated };
  } catch (updateError) {
    const msg = String(updateError?.message || updateError || "");
    const missing =
      msg.includes("could not be found") ||
      msg.includes("Document with the requested ID could not be found") ||
      updateError?.code === 404;

    if (!missing) throw updateError;

    const created = await databases.createDocument(
      appwriteConfig.databaseId,
      collectionId(),
      userId,
      data
    );
    if (sharing) markPublished(latitude, longitude);
    return { skipped: false, document: created };
  }
}

export async function setLocationSharingEnabled({
  userId,
  enabled,
  privacyMode = LOCATION_PRIVACY_MODES.FRIENDS,
  allowedViewerIds = [],
  coords = null,
}) {
  if (!enabled) {
    resetLocationPublishThrottle();
    return upsertMyLocation({
      userId,
      isSharing: false,
      privacyMode: LOCATION_PRIVACY_MODES.GHOST,
      allowedViewerIds: [],
      force: true,
      skipGeocode: true,
    });
  }

  if (!coords?.latitude || !coords?.longitude) {
    throw new Error("Turn on location to start sharing");
  }

  return upsertMyLocation({
    userId,
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    heading: coords.heading,
    speed: coords.speed,
    altitude: coords.altitude,
    isSharing: true,
    privacyMode:
      privacyMode === LOCATION_PRIVACY_MODES.GHOST
        ? LOCATION_PRIVACY_MODES.FRIENDS
        : privacyMode,
    allowedViewerIds,
    force: true,
  });
}

async function fetchUserSocialGraph(userId) {
  try {
    const u = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId
    );
    return {
      $id: u.$id,
      following: normalizeIdList(u.following),
      followers: normalizeIdList(u.followers),
    };
  } catch {
    return { $id: userId, following: [], followers: [] };
  }
}

async function resolveFriendsAllowedIds(userId, extraIds = []) {
  const [graph, partners] = await Promise.all([
    fetchUserSocialGraph(userId),
    getLocationSharePartnerIds(userId),
  ]);
  return getConnectedUserIds(graph, [...partners, ...normalizeIdList(extraIds)]);
}

async function fetchUserProfiles(userIds) {
  const unique = [...new Set((userIds || []).map(String).filter(Boolean))];
  const out = {};
  await Promise.all(
    unique.map(async (id) => {
      try {
        const u = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userCollectionId,
          id
        );
        out[id] = {
          $id: u.$id,
          username: u.username || "Friend",
          avatar: u.avatar || "",
        };
      } catch {
        out[id] = { $id: id, username: "Friend", avatar: "" };
      }
    })
  );
  return out;
}

/**
 * Load locations visible to the viewer (friends / everyone / selected).
 */
export async function fetchVisibleFriendLocations(viewerUser) {
  const viewerId = viewerUser?.$id;
  if (!viewerId || !collectionId()) return [];

  const [graph, partners, myDoc] = await Promise.all([
    fetchUserSocialGraph(viewerId),
    getLocationSharePartnerIds(viewerId),
    getMyLocationDocument(viewerId),
  ]);
  const invitedByMe = normalizeIdList(myDoc?.allowedViewerIds);
  const connectedIds = getConnectedUserIds(
    {
      $id: viewerId,
      following: graph.following.length ? graph.following : viewerUser.following,
      followers: graph.followers.length ? graph.followers : viewerUser.followers,
    },
    [...partners, ...invitedByMe]
  );

  let documents = [];
  try {
    const res = await databases.listDocuments(
      appwriteConfig.databaseId,
      collectionId(),
      [Query.equal("isSharing", true), Query.limit(100)]
    );
    documents = res.documents || [];
  } catch (e) {
    if (__DEV__) console.warn("[location] listDocuments failed", e?.message || e);
    return [];
  }

  const visible = documents.filter((doc) =>
    canViewerSeeLocationDoc(doc, viewerId, connectedIds)
  );

  const profiles = await fetchUserProfiles(visible.map((d) => d.userId));
  const now = Date.now();

  return visible
    .map((doc) => {
      const lat = Number(doc.latitude);
      const lng = Number(doc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const profile = profiles[String(doc.userId)] || {
        $id: doc.userId,
        username: "Friend",
        avatar: "",
      };
      const freshness = getLocationFreshness(doc, now);
      return {
        ...doc,
        latitude: lat,
        longitude: lng,
        username: profile.username,
        avatar: profile.avatar,
        freshness,
      };
    })
    .filter(Boolean);
}

export function getUserLocationsRealtimeChannel() {
  if (!collectionId()) return "";
  return `databases.${appwriteConfig.databaseId}.collections.${collectionId()}.documents`;
}

/**
 * Subscribe to friend location updates (realtime + polling fallback).
 * @returns {() => void} unsubscribe
 */
export function subscribeVisibleFriendLocations(viewerUser, onUpdate, options = {}) {
  const pollMs = options.pollMs ?? 8000;
  let disposed = false;
  let pollTimer = null;
  let realtimeUnsub = null;

  const emit = async (reason) => {
    if (disposed || !viewerUser?.$id) return;
    try {
      const rows = await fetchVisibleFriendLocations(viewerUser);
      if (!disposed) onUpdate(rows, reason);
    } catch (e) {
      if (__DEV__) console.warn("[location] subscribe fetch failed", e?.message || e);
    }
  };

  emit("initial");
  pollTimer = setInterval(() => emit("poll"), pollMs);

  const channel = getUserLocationsRealtimeChannel();
  if (channel && isAppwriteRealtimeEnabled()) {
    realtimeUnsub = registerAppwriteRealtimeChannel(channel, () => {
      emit("realtime");
    });
  }

  return () => {
    disposed = true;
    if (pollTimer) clearInterval(pollTimer);
    if (realtimeUnsub) {
      try {
        realtimeUnsub();
      } catch (_) {}
    }
  };
}

export function refreshLocationRealtime() {
  refreshAppwriteRealtimeConnection();
}

export { LOCATION_PRIVACY_MODES };

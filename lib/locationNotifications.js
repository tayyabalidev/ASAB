/**
 * Location share-started + nearby notifications (Step 5).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import { appwriteConfig } from "./appwrite";
import {
  LOCATION_NEARBY_COOLDOWN_MS,
  LOCATION_NEARBY_NOTIFIED_KEY,
  LOCATION_NEARBY_RADIUS_M,
  LOCATION_PRIVACY_MODES,
} from "./locationSchema";
import {
  fetchVisibleFriendLocations,
  getMutualFriendIds,
} from "./locationService";
import { relayPushNotification } from "./pushRelayClient";

const LOCATION_CHANNEL_ID = "location";

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

async function ensureLocationChannel() {
  try {
    await Notifications.setNotificationChannelAsync(LOCATION_CHANNEL_ID, {
      name: "Live Location",
      description: "Friends nearby and location sharing alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 200, 200],
      lightColor: "#22C55E",
      sound: "default",
    });
  } catch (_) {}
}

async function loadNearbyNotifiedMap() {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_NEARBY_NOTIFIED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function markNearbyNotified(friendId) {
  const map = await loadNearbyNotifiedMap();
  map[String(friendId)] = Date.now();
  await AsyncStorage.setItem(LOCATION_NEARBY_NOTIFIED_KEY, JSON.stringify(map));
}

function recipientsForShareStarted(user, privacyMode, allowedViewerIds) {
  const mode = String(privacyMode || LOCATION_PRIVACY_MODES.FRIENDS).toLowerCase();
  if (mode === LOCATION_PRIVACY_MODES.GHOST) return [];
  if (mode === LOCATION_PRIVACY_MODES.SELECTED) {
    return (allowedViewerIds || []).map(String).filter(Boolean);
  }
  // Friends + Everyone: notify mutual friends only (avoid mass spam).
  return getMutualFriendIds(user);
}

/**
 * Notify eligible friends that the user started sharing location.
 */
export async function notifyFriendsLocationShareStarted({
  user,
  privacyMode,
  allowedViewerIds = [],
}) {
  if (!user?.$id) return;
  const recipients = recipientsForShareStarted(user, privacyMode, allowedViewerIds).filter(
    (id) => id !== String(user.$id)
  );
  if (!recipients.length) return;

  const title = user.username || "A friend";
  const body = "started sharing their live location";
  const deepLink = `${appwriteConfig.platform}://live-map`;

  await relayPushNotification({
    toUserIds: recipients,
    title,
    body,
    channelId: LOCATION_CHANNEL_ID,
    data: {
      type: "location_share",
      fromUserId: user.$id,
      url: deepLink,
    },
  });
}

/**
 * If a visible friend is within nearby radius, show a local notification (cooldown per friend).
 */
export async function checkAndNotifyNearbyFriends({
  viewerUser,
  latitude,
  longitude,
  radiusM = LOCATION_NEARBY_RADIUS_M,
}) {
  if (!viewerUser?.$id || latitude == null || longitude == null) return [];

  let friends = [];
  try {
    friends = await fetchVisibleFriendLocations(viewerUser);
  } catch {
    return [];
  }

  const notifiedMap = await loadNearbyNotifiedMap();
  const now = Date.now();
  const triggered = [];

  for (const friend of friends) {
    const dist = haversineMeters(
      latitude,
      longitude,
      friend.latitude,
      friend.longitude
    );
    if (dist > radiusM) continue;

    const lastAt = Number(notifiedMap[String(friend.userId)] || 0);
    if (lastAt && now - lastAt < LOCATION_NEARBY_COOLDOWN_MS) continue;

    triggered.push({ friend, distanceM: Math.round(dist) });
    await markNearbyNotified(friend.userId);

    try {
      await ensureLocationChannel();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: friend.username || "Friend nearby",
          body: `Is about ${Math.round(dist)}m away`,
          data: {
            type: "location_nearby",
            fromUserId: friend.userId,
            url: `${appwriteConfig.platform}://live-map`,
          },
          sound: "default",
        },
        trigger: null,
      });
    } catch (e) {
      if (__DEV__) console.warn("[location] nearby notify failed", e?.message || e);
    }
  }

  return triggered;
}

/**
 * Notify a user to open Live Map and share their location.
 */
export async function inviteUserToShareLocation({ fromUser, toUserId }) {
  if (!fromUser?.$id || !toUserId || fromUser.$id === toUserId) {
    throw new Error("Invalid invite");
  }

  const title = fromUser.username || "A friend";
  const body = "invited you to share live location on ASAB";
  const deepLink = `${appwriteConfig.platform}://live-map`;

  await relayPushNotification({
    toUserIds: [String(toUserId)],
    title,
    body,
    channelId: LOCATION_CHANNEL_ID,
    data: {
      type: "location_invite",
      fromUserId: fromUser.$id,
      url: deepLink,
    },
  });

  try {
    const { createNotification } = await import("./appwrite");
    await createNotification("location_invite", fromUser.$id, String(toUserId));
  } catch (_) {
    /* in-app notification optional if type/schema rejects */
  }

  return true;
}

/** Used by background task when full user doc isn't loaded. */
export async function buildViewerStubFromPrefs(prefs) {
  if (!prefs?.userId) return null;
  return {
    $id: prefs.userId,
    username: prefs.username || "",
    following: prefs.following || [],
    followers: prefs.followers || [],
  };
}

export { haversineMeters, LOCATION_CHANNEL_ID };

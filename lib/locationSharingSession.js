/**
 * Orchestrates sharing on/off: Appwrite + prefs + background GPS + notify (Step 5).
 */
import { LOCATION_PRIVACY_MODES } from "./locationSchema";
import {
  setLocationSharingEnabled,
} from "./locationService";
import {
  clearLocationSharingPrefs,
  saveLocationSharingPrefs,
} from "./locationSharingPrefs";
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from "./locationBackground";
import {
  checkAndNotifyNearbyFriends,
  notifyFriendsLocationShareStarted,
} from "./locationNotifications";

/**
 * Turn sharing on (optionally start background updates).
 */
export async function enableLocationSharingSession({
  user,
  privacyMode = LOCATION_PRIVACY_MODES.FRIENDS,
  allowedViewerIds = [],
  coords,
  enableBackground = true,
  notifyFriends = true,
}) {
  if (!user?.$id) throw new Error("Not signed in");

  const mode =
    privacyMode === LOCATION_PRIVACY_MODES.GHOST
      ? LOCATION_PRIVACY_MODES.FRIENDS
      : privacyMode;

  const result = await setLocationSharingEnabled({
    userId: user.$id,
    enabled: true,
    privacyMode: mode,
    allowedViewerIds,
    coords,
  });

  await saveLocationSharingPrefs({
    userId: user.$id,
    username: user.username || "",
    isSharing: true,
    privacyMode: mode,
    allowedViewerIds,
    following: user.following || [],
    followers: user.followers || [],
  });

  let background = { ok: false, skipped: true };
  if (enableBackground) {
    background = await startBackgroundLocationUpdates();
  }

  if (notifyFriends) {
    try {
      await notifyFriendsLocationShareStarted({
        user,
        privacyMode: mode,
        allowedViewerIds,
      });
    } catch (_) {}
  }

  if (coords?.latitude != null && coords?.longitude != null) {
    try {
      await checkAndNotifyNearbyFriends({
        viewerUser: user,
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
    } catch (_) {}
  }

  return { result, background };
}

/**
 * Ghost / stop sharing + stop background GPS.
 */
export async function disableLocationSharingSession({ user }) {
  const userId = user?.$id;
  if (!userId) throw new Error("Not signed in");

  const result = await setLocationSharingEnabled({
    userId,
    enabled: false,
  });

  await saveLocationSharingPrefs({
    userId,
    username: user.username || "",
    isSharing: false,
    privacyMode: LOCATION_PRIVACY_MODES.GHOST,
    allowedViewerIds: [],
    following: user.following || [],
    followers: user.followers || [],
  });

  await stopBackgroundLocationUpdates();

  return { result };
}

/**
 * Keep prefs in sync while already sharing (privacy change).
 */
export async function syncLocationSharingPrefsFromUser(user, overrides = {}) {
  if (!user?.$id) return;
  await saveLocationSharingPrefs({
    userId: user.$id,
    username: user.username || "",
    isSharing: overrides.isSharing ?? true,
    privacyMode: overrides.privacyMode || LOCATION_PRIVACY_MODES.FRIENDS,
    allowedViewerIds: overrides.allowedViewerIds || [],
    following: user.following || [],
    followers: user.followers || [],
  });
}

export async function teardownLocationSharingSession() {
  await stopBackgroundLocationUpdates();
  await clearLocationSharingPrefs();
}

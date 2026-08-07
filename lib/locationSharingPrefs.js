/**
 * Persist live-location sharing prefs for background task (Step 5).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  LOCATION_PRIVACY_MODES,
  LOCATION_SHARING_PREFS_KEY,
} from "./locationSchema";

export async function loadLocationSharingPrefs() {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_SHARING_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveLocationSharingPrefs(prefs) {
  const payload = {
    userId: String(prefs.userId || ""),
    username: prefs.username || "",
    isSharing: Boolean(prefs.isSharing),
    privacyMode: prefs.privacyMode || LOCATION_PRIVACY_MODES.GHOST,
    allowedViewerIds: Array.isArray(prefs.allowedViewerIds)
      ? prefs.allowedViewerIds.map(String)
      : [],
    following: Array.isArray(prefs.following) ? prefs.following.map(String) : [],
    followers: Array.isArray(prefs.followers) ? prefs.followers.map(String) : [],
    updatedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(LOCATION_SHARING_PREFS_KEY, JSON.stringify(payload));
  return payload;
}

export async function clearLocationSharingPrefs() {
  try {
    await AsyncStorage.removeItem(LOCATION_SHARING_PREFS_KEY);
  } catch (_) {}
}

/**
 * Background location updates for Friends Live Map (Step 5).
 * Task must be defined at module load — import this file from app/_layout.jsx.
 */
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";

import {
  LOCATION_BG_DISTANCE_INTERVAL_M,
  LOCATION_BG_TASK_NAME,
  LOCATION_BG_TIME_INTERVAL_MS,
  LOCATION_PRIVACY_MODES,
} from "./locationSchema";
import { loadLocationSharingPrefs } from "./locationSharingPrefs";
import { upsertMyLocation } from "./locationService";
import {
  buildViewerStubFromPrefs,
  checkAndNotifyNearbyFriends,
} from "./locationNotifications";

let taskDefined = false;

function defineBackgroundTaskOnce() {
  if (taskDefined) return;
  try {
    if (TaskManager.isTaskDefined(LOCATION_BG_TASK_NAME)) {
      taskDefined = true;
      return;
    }
  } catch (_) {}

  TaskManager.defineTask(LOCATION_BG_TASK_NAME, async ({ data, error }) => {
    if (error) {
      if (__DEV__) console.warn("[location-bg] task error", error.message || error);
      return;
    }

    try {
      const prefs = await loadLocationSharingPrefs();
      if (!prefs?.isSharing || !prefs.userId) return;
      if (prefs.privacyMode === LOCATION_PRIVACY_MODES.GHOST) return;

      const locations = data?.locations || [];
      const latest = locations[locations.length - 1];
      if (!latest?.coords) return;

      const { latitude, longitude, accuracy, heading, speed, altitude } = latest.coords;

      await upsertMyLocation({
        userId: prefs.userId,
        latitude,
        longitude,
        accuracy,
        heading,
        speed,
        altitude,
        isSharing: true,
        privacyMode: prefs.privacyMode,
        allowedViewerIds: prefs.allowedViewerIds || [],
        skipGeocode: true,
      });

      const viewer = await buildViewerStubFromPrefs(prefs);
      if (viewer) {
        await checkAndNotifyNearbyFriends({
          viewerUser: viewer,
          latitude,
          longitude,
        });
      }
    } catch (e) {
      if (__DEV__) console.warn("[location-bg] handler failed", e?.message || e);
    }
  });

  taskDefined = true;
}

defineBackgroundTaskOnce();

export async function getBackgroundLocationPermissionStatus() {
  return Location.getBackgroundPermissionsAsync();
}

export async function requestBackgroundLocationPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    return { ok: false, reason: "foreground", status: fg.status };
  }
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== "granted") {
    return { ok: false, reason: "background", status: bg.status };
  }
  return { ok: true, status: bg.status };
}

export async function isBackgroundLocationRunning() {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_BG_TASK_NAME);
  } catch {
    return false;
  }
}

export async function startBackgroundLocationUpdates() {
  defineBackgroundTaskOnce();

  const perm = await requestBackgroundLocationPermissions();
  if (!perm.ok) return perm;

  const running = await isBackgroundLocationRunning();
  if (running) return { ok: true, alreadyRunning: true };

  await Location.startLocationUpdatesAsync(LOCATION_BG_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: LOCATION_BG_TIME_INTERVAL_MS,
    distanceInterval: LOCATION_BG_DISTANCE_INTERVAL_M,
    deferredUpdatesInterval: LOCATION_BG_TIME_INTERVAL_MS,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.OtherNavigation,
    foregroundService:
      Platform.OS === "android"
        ? {
            notificationTitle: "ASAB Live Location",
            notificationBody: "Sharing your location with people you chose.",
            notificationColor: "#FF9C01",
          }
        : undefined,
  });

  return { ok: true, alreadyRunning: false };
}

export async function stopBackgroundLocationUpdates() {
  try {
    const running = await isBackgroundLocationRunning();
    if (running) {
      await Location.stopLocationUpdatesAsync(LOCATION_BG_TASK_NAME);
    }
  } catch (e) {
    if (__DEV__) console.warn("[location-bg] stop failed", e?.message || e);
  }
}

export { LOCATION_BG_TASK_NAME };

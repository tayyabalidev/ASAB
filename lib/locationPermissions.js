/**
 * Foreground location helpers for Friends Live Map (Step 2).
 * Background tracking comes in a later phase.
 */
import * as Location from "expo-location";

export async function getForegroundLocationPermission() {
  return Location.getForegroundPermissionsAsync();
}

export async function requestForegroundLocationPermission() {
  return Location.requestForegroundPermissionsAsync();
}

/**
 * Request permission if needed, then return a high-accuracy position.
 * @returns {{ coords: Location.LocationObjectCoords, granted: boolean, status: string }}
 */
export async function getCurrentLocationOrRequest() {
  let permission = await getForegroundLocationPermission();
  if (permission.status !== "granted") {
    permission = await requestForegroundLocationPermission();
  }

  if (permission.status !== "granted") {
    return {
      granted: false,
      status: permission.status,
      coords: null,
      location: null,
    };
  }

  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  return {
    granted: true,
    status: permission.status,
    coords: location.coords,
    location,
  };
}

/**
 * Watch position while the live-map screen is open.
 * @returns {Promise<Location.LocationSubscription>}
 */
export async function watchForegroundLocation(onUpdate, options = {}) {
  const permission = await requestForegroundLocationPermission();
  if (permission.status !== "granted") {
    throw new Error("Location permission not granted");
  }

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: options.timeInterval ?? 5000,
      distanceInterval: options.distanceInterval ?? 15,
      mayShowUserSettingsDialog: true,
    },
    onUpdate
  );
}

export async function reverseGeocodeLabel(latitude, longitude) {
  try {
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const first = results?.[0];
    if (!first) return "";
    const parts = [first.name || first.street, first.city, first.region].filter(
      Boolean
    );
    return parts.join(", ");
  } catch {
    return "";
  }
}

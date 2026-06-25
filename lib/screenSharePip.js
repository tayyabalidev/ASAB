import { NativeModules, Platform, DeviceEventEmitter } from 'react-native';

const ScreenSharePipNative = NativeModules.ScreenSharePip;
const HostCameraPipNative = NativeModules.HostCameraPip;

export const SCREEN_SHARE_PIP_MODE_EVENT = 'ScreenSharePipModeChanged';
export const HOST_CAMERA_PIP_MODE_EVENT = 'HostCameraPipModeChanged';

function hasAndroidPipModule() {
  return Platform.OS === 'android' && ScreenSharePipNative != null;
}

function hasIosHostCameraPipModule() {
  return Platform.OS === 'ios' && HostCameraPipNative != null;
}

export function isScreenSharePipSupported() {
  if (hasAndroidPipModule()) {
    return true;
  }
  if (hasIosHostCameraPipModule()) {
    return true;
  }
  return false;
}

export async function checkScreenSharePipSupported() {
  try {
    if (hasAndroidPipModule() && ScreenSharePipNative.isPictureInPictureSupported) {
      return Boolean(await ScreenSharePipNative.isPictureInPictureSupported());
    }
    if (hasIosHostCameraPipModule() && HostCameraPipNative.isPictureInPictureSupported) {
      return Boolean(await HostCameraPipNative.isPictureInPictureSupported());
    }
  } catch (_) {
    return false;
  }
  return false;
}

export function setScreenSharePipEnabled(enabled) {
  const active = Boolean(enabled);
  try {
    if (hasAndroidPipModule()) {
      ScreenSharePipNative.setScreenSharePipEnabled(active);
    }
    if (hasIosHostCameraPipModule()) {
      HostCameraPipNative.setHostCameraPipEnabled(active);
      if (!active) {
        HostCameraPipNative.stopHostCameraPip?.();
      }
    }
  } catch (_) {
    /* native module unavailable in Expo Go */
  }
}

/** Block PiP while Android MediaProjection consent UI (single app / entire screen) is open. */
export function setMediaProjectionConsentInProgress(inProgress) {
  if (Platform.OS !== 'android' || !hasAndroidPipModule()) {
    return;
  }
  try {
    ScreenSharePipNative.setMediaProjectionConsentInProgress?.(Boolean(inProgress));
  } catch (_) {
    /* ignore */
  }
}

/** iOS: bind WebRTC camera to PiP controller while app is still foreground. */
export async function prepareHostCameraPip({ streamURL, mirror = true }) {
  if (!hasIosHostCameraPipModule() || !streamURL) {
    return false;
  }
  try {
    if (!HostCameraPipNative.startHostCameraPip) {
      return false;
    }
    return Boolean(await HostCameraPipNative.startHostCameraPip(streamURL, mirror));
  } catch (_) {
    return false;
  }
}

/** iOS: keep PiP renderer bound while app is backgrounded (avoids frozen frame). */
export async function refreshHostCameraPip({ streamURL, mirror = true }) {
  if (!hasIosHostCameraPipModule() || !streamURL) {
    return false;
  }
  try {
    if (HostCameraPipNative.refreshHostCameraPip) {
      return Boolean(await HostCameraPipNative.refreshHostCameraPip(streamURL, mirror));
    }
    return prepareHostCameraPip({ streamURL, mirror });
  } catch (_) {
    return false;
  }
}

export async function enterScreenSharePip(options = {}) {
  const { streamURL, mirror = true } = options;
  try {
    if (hasAndroidPipModule() && ScreenSharePipNative.enterPip) {
      return Boolean(await ScreenSharePipNative.enterPip());
    }
    if (hasIosHostCameraPipModule()) {
      if (streamURL && HostCameraPipNative.startHostCameraPip) {
        const started = Boolean(
          await HostCameraPipNative.startHostCameraPip(streamURL, mirror)
        );
        if (!started) {
          return false;
        }
      }
      if (HostCameraPipNative.enterHostCameraPip) {
        return Boolean(await HostCameraPipNative.enterHostCameraPip());
      }
    }
  } catch (_) {
    return false;
  }
  return false;
}

export function stopHostCameraPip() {
  try {
    if (hasIosHostCameraPipModule()) {
      HostCameraPipNative.stopHostCameraPip?.();
    }
  } catch (_) {
    /* ignore */
  }
}

export function addScreenSharePipModeListener(callback) {
  const subscriptions = [];
  const handler = (event) => {
    callback?.({
      isInPipMode: Boolean(event?.isInPipMode),
      platform: Platform.OS,
    });
  };

  subscriptions.push(
    DeviceEventEmitter.addListener(SCREEN_SHARE_PIP_MODE_EVENT, handler)
  );
  subscriptions.push(
    DeviceEventEmitter.addListener(HOST_CAMERA_PIP_MODE_EVENT, handler)
  );

  return () => {
    subscriptions.forEach((subscription) => subscription.remove());
  };
}

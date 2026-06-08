import { Platform } from 'react-native';
import { ScreenShareManager } from '@videosdk.live/react-native-webrtc';

/** VideoSDK screen-share options — captures game/video/device audio on Android (API 29+). */
export const SCREEN_SHARE_ENABLE_OPTIONS = Object.freeze({
  enableAudio: true,
});

/**
 * VideoSDK RN SDK only calls ScreenShareManager.enableSystemAudio when E2EE is on.
 * Call this after every successful screen-share start on Android.
 */
export function ensureAndroidSystemAudioCapture() {
  if (Platform.OS !== 'android') return;
  try {
    ScreenShareManager?.enableSystemAudio?.();
  } catch (_) {
    /* native module may be unavailable in Expo Go */
  }
}

export function stopAndroidSystemAudioCapture() {
  if (Platform.OS !== 'android') return;
  try {
    ScreenShareManager?.disableSystemAudio?.();
  } catch (_) {}
}

/**
 * @param {((opts?: { enableAudio?: boolean }) => unknown) | undefined} fn enableScreenShare from useMeeting
 */
export async function invokeScreenShareEnable(fn) {
  if (typeof fn !== 'function') return false;
  try {
    await Promise.resolve(fn(SCREEN_SHARE_ENABLE_OPTIONS));
    ensureAndroidSystemAudioCapture();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * @param {((opts?: { enableAudio?: boolean }) => unknown) | undefined} fn toggleScreenShare from useMeeting
 */
export async function invokeScreenShareToggle(fn) {
  if (typeof fn !== 'function') return false;
  try {
    await Promise.resolve(fn(SCREEN_SHARE_ENABLE_OPTIONS));
    ensureAndroidSystemAudioCapture();
    return true;
  } catch (_) {
    return false;
  }
}

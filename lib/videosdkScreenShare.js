import { InteractionManager, Platform } from 'react-native';
import { ScreenShareManager } from '@videosdk.live/react-native-webrtc';

/** VideoSDK screen-share options — captures game/video/device audio on Android (API 29+). */
export const SCREEN_SHARE_ENABLE_OPTIONS = Object.freeze({
  enableAudio: true,
});

function waitForUiSettled() {
  return new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
}

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
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {((opts?: { enableAudio?: boolean }) => unknown) | undefined} fn enableScreenShare from useMeeting
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function invokeScreenShareEnable(fn) {
  if (typeof fn !== 'function') {
    return { ok: false, error: 'enableScreenShare unavailable' };
  }
  try {
    await waitForUiSettled();
    if (Platform.OS === 'android') {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await Promise.resolve(fn(SCREEN_SHARE_ENABLE_OPTIONS));
    ensureAndroidSystemAudioCapture();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * @param {((opts?: { enableAudio?: boolean }) => unknown) | undefined} fn toggleScreenShare from useMeeting
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function invokeScreenShareToggle(fn) {
  if (typeof fn !== 'function') {
    return { ok: false, error: 'toggleScreenShare unavailable' };
  }
  try {
    await waitForUiSettled();
    if (Platform.OS === 'android') {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    await Promise.resolve(fn(SCREEN_SHARE_ENABLE_OPTIONS));
    ensureAndroidSystemAudioCapture();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Never require VideoSDK packages unless canLoadVideoSdkNative() — prevents Expo Go crashes.
 */

import { canLoadVideoSdkNative } from './videosdkNativeGate';

export function safeRequireMeetingSdk() {
  if (!canLoadVideoSdkNative()) return null;
  try {
    return require('@videosdk.live/react-native-sdk');
  } catch (e) {
    console.warn('[VideoSDK] safeRequireMeetingSdk failed', e?.message || e);
    return null;
  }
}

export function safeRequireVideoSDKCallComponent() {
  if (!canLoadVideoSdkNative()) return null;
  try {
    const mod = require('../components/VideoSDKCall');
    return mod?.default || null;
  } catch (e) {
    console.warn('[VideoSDK] safeRequireVideoSDKCallComponent failed', e?.message || e);
    return null;
  }
}

export function safeRequireLiveStreamBroadcasterImpl() {
  if (!canLoadVideoSdkNative()) return null;
  try {
    const mod = require('../components/LiveStreamBroadcasterImpl');
    return mod?.default || null;
  } catch (e) {
    console.warn('[VideoSDK] safeRequireLiveStreamBroadcasterImpl failed', e?.message || e);
    return null;
  }
}

export function safeRequireLiveStreamPlayerImpl() {
  if (!canLoadVideoSdkNative()) return null;
  try {
    const mod = require('../components/LiveStreamPlayerImpl');
    return mod?.default || null;
  } catch (e) {
    console.warn('[VideoSDK] safeRequireLiveStreamPlayerImpl failed', e?.message || e);
    return null;
  }
}

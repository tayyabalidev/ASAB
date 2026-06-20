/**
 * Gate: never statically import VideoSDK (Expo Go / Metro HMR-safe).
 * SDK implementation: LiveStreamChatOverlay.sdk.jsx
 */
import React, { useMemo } from 'react';
import { canLoadVideoSdkNative } from '../lib/videosdkNativeGate';

function LiveStreamChatOverlayStub() {
  return null;
}

export default function LiveStreamChatOverlay(props) {
  const Impl = useMemo(() => {
    if (!canLoadVideoSdkNative()) return LiveStreamChatOverlayStub;
    try {
      return require('./LiveStreamChatOverlay.sdk').default;
    } catch (err) {
      if (__DEV__) {
        console.warn('[LiveStreamChatOverlay] SDK module unavailable:', err?.message || err);
      }
      return LiveStreamChatOverlayStub;
    }
  }, []);

  return <Impl {...props} />;
}

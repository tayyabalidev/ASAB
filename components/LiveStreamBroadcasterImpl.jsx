/**
 * Gate: never statically import VideoSDK (Expo Go / Metro HMR-safe).
 * SDK implementation: LiveStreamBroadcasterImpl.sdk.jsx
 */
import React, { useMemo } from 'react';
import { canLoadVideoSdkNative } from '../lib/videosdkNativeGate';

function LiveStreamBroadcasterImplStub() {
  return null;
}

export default function LiveStreamBroadcasterImpl(props) {
  const Impl = useMemo(() => {
    if (!canLoadVideoSdkNative()) return LiveStreamBroadcasterImplStub;
    try {
      return require('./LiveStreamBroadcasterImpl.sdk').default;
    } catch (err) {
      if (__DEV__) {
        console.warn('[LiveStreamBroadcasterImpl] SDK module unavailable:', err?.message || err);
      }
      return LiveStreamBroadcasterImplStub;
    }
  }, []);

  return <Impl {...props} />;
}

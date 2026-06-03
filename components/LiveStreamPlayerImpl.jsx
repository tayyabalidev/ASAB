/**
 * Gate: never statically import VideoSDK (Expo Go / Metro HMR-safe).
 * SDK implementation: LiveStreamPlayerImpl.sdk.jsx
 */
import React, { useMemo } from 'react';
import { canLoadVideoSdkNative } from '../lib/videosdkNativeGate';

function LiveStreamPlayerImplStub() {
  return null;
}

export default function LiveStreamPlayerImpl(props) {
  const Impl = useMemo(() => {
    if (!canLoadVideoSdkNative()) return LiveStreamPlayerImplStub;
    try {
      return require('./LiveStreamPlayerImpl.sdk').default;
    } catch (err) {
      if (__DEV__) {
        console.warn('[LiveStreamPlayerImpl] SDK module unavailable:', err?.message || err);
      }
      return LiveStreamPlayerImplStub;
    }
  }, []);

  return <Impl {...props} />;
}

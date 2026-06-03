import { NativeModules } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True only in dev/production binaries with WebRTC linked — never in Expo Go.
 */
export function canLoadVideoSdkNative() {
  const env = Constants.executionEnvironment;
  if (
    env !== ExecutionEnvironment.Bare &&
    env !== ExecutionEnvironment.Standalone
  ) {
    return false;
  }
  return NativeModules.WebRTCModule != null;
}

/**
 * When true, do not load @videosdk.live/react-native-sdk (avoids native module crashes in Expo Go).
 */
export function isExpoGoOrStoreClient() {
  return !canLoadVideoSdkNative();
}

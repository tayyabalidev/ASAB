import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True only in EAS / TestFlight / `expo run:ios` binaries — never in Expo Go.
 * Defaults to false when executionEnvironment is missing (HMR / early init).
 */
export function canLoadVideoSdkNative() {
  const env = Constants.executionEnvironment;
  return (
    env === ExecutionEnvironment.Bare || env === ExecutionEnvironment.Standalone
  );
}

/**
 * When true, do not load @videosdk.live/react-native-sdk (avoids native module crashes in Expo Go).
 */
export function isExpoGoOrStoreClient() {
  return !canLoadVideoSdkNative();
}

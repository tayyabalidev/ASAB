import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * When true, do not load @videosdk.live/react-native-sdk (avoids native module crashes in Expo Go).
 */
export function isExpoGoOrStoreClient() {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
    Constants.appOwnership === 'expo'
  );
}

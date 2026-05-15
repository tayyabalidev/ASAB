/**
 * React Native config.
 * Excludes react-native-webrtc from autolinking to avoid duplicate WebRTCModulePackage.
 * The app uses @videosdk.live/react-native-sdk, which ships its own
 * @videosdk.live/react-native-webrtc. A separate react-native-webrtc
 * (com.oney) would expose a duplicate WebRTCModulePackage and cause a Java
 * "ambiguous reference" error. We keep VideoSDK's WebRTC only.
 */
module.exports = {
  dependencies: {
    'react-native-webrtc': { platforms: { android: null, ios: null } },
  },
};

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { VideosdkRPK } = NativeModules;

if (Platform.OS === 'ios' && !VideosdkRPK && __DEV__) {
  console.warn('[videosdkIosScreenShare] Native module VideosdkRPK is not loaded — rebuild with @videosdk.live/expo-ios-screen-share');
}

const emitter =
  Platform.OS === 'ios' && VideosdkRPK ? new NativeEventEmitter(VideosdkRPK) : null;

const VideosdkIosScreenShare = {
  isAvailable: Platform.OS === 'ios' && Boolean(VideosdkRPK?.startBroadcast),

  startBroadcast() {
    if (Platform.OS !== 'ios' || typeof VideosdkRPK?.startBroadcast !== 'function') {
      return Promise.reject(new Error('iOS screen broadcast is not available. Rebuild with expo-ios-screen-share.'));
    }
    return Promise.resolve(VideosdkRPK.startBroadcast());
  },

  addListener(callback) {
    if (!emitter || typeof callback !== 'function') {
      return { remove: () => {} };
    }
    return emitter.addListener('onScreenShare', callback);
  },

  removeListener(subscription) {
    subscription?.remove?.();
  },
};

export default VideosdkIosScreenShare;

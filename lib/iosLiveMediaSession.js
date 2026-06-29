import { Platform } from 'react-native';

let InCallManager = null;
try {
  InCallManager = require('@videosdk.live/react-native-incallmanager').default;
} catch (_) {
  InCallManager = null;
}

/**
 * Reset iOS AVAudioSession for WebRTC live (camera + screen share).
 * Feed expo-video PiP and expo-camera preview can leave playback category active.
 */
export async function prepareIosLiveMediaSession() {
  if (Platform.OS !== 'ios') {
    return;
  }
  try {
    if (InCallManager && typeof InCallManager.start === 'function') {
      InCallManager.start({ media: 'video' });
    }
  } catch (_) {}
}

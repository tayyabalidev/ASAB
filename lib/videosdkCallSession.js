/**
 * In-call audio session (speaker route, playAndRecord) for VideoSDK calls.
 */

import { Platform } from 'react-native';
import { Audio, InterruptionModeIOS } from 'expo-av';

let InCallManager = null;
try {
  InCallManager = require('@videosdk.live/react-native-incallmanager').default;
} catch (_) {
  InCallManager = null;
}

export async function configureCallAudioMode() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (e) {
    if (__DEV__) console.warn('[CallAudio] setAudioModeAsync', e);
  }
}

/**
 * @param {'audio' | 'video'} callType
 */
export function startCallAudioSession(callType) {
  configureCallAudioMode().catch(() => {});
  try {
    if (InCallManager && typeof InCallManager.start === 'function') {
      InCallManager.start({ media: callType === 'video' ? 'video' : 'audio' });
      if (callType === 'audio' && typeof InCallManager.setForceSpeakerphoneOn === 'function') {
        InCallManager.setForceSpeakerphoneOn(true);
      }
    }
  } catch (e) {
    if (__DEV__) console.warn('[CallAudio] InCallManager.start', e);
  }
}

export function stopCallAudioSession() {
  try {
    if (InCallManager && typeof InCallManager.stop === 'function') {
      InCallManager.stop();
    }
  } catch (e) {
    if (__DEV__) console.warn('[CallAudio] InCallManager.stop', e);
  }
}

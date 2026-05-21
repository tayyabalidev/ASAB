/**
 * Camera / mic permissions for VideoSDK (calls + live).
 */

import { Platform, PermissionsAndroid } from 'react-native';
import { Audio, InterruptionModeIOS } from 'expo-av';
import { Camera } from 'expo-camera';

/**
 * @param {'video' | 'audio'} callType
 * @returns {Promise<boolean>}
 */
export async function ensureCallMediaPermissions(callType) {
  if (Platform.OS === 'android') {
    const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (callType === 'video') {
      permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    }
    const granted = await PermissionsAndroid.requestMultiple(permissions);
    const audioGranted =
      granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED;
    const cameraGranted =
      callType === 'video'
        ? granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED
        : true;
    return audioGranted && cameraGranted;
  }

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    });
  } catch (e) {
    console.warn('VideoSDK: setAudioModeAsync', e);
  }

  const mic = await Audio.requestPermissionsAsync();
  if (!mic.granted) {
    return false;
  }
  if (callType !== 'video') {
    return true;
  }
  const cam = await Camera.requestCameraPermissionsAsync();
  return Boolean(cam.granted);
}

/**
 * Read-only permission snapshot (does not request). For VideoSDK join tracing.
 * @param {'video' | 'audio'} callType
 */
export async function getCallMediaPermissionSnapshot(callType) {
  if (Platform.OS === 'android') {
    const micGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    const cameraGranted =
      callType === 'video'
        ? await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA)
        : true;
    return {
      platform: 'android',
      callType,
      micGranted: Boolean(micGranted),
      cameraGranted: Boolean(cameraGranted),
    };
  }

  const mic = await Audio.getPermissionsAsync();
  if (callType !== 'video') {
    return {
      platform: 'ios',
      callType,
      micStatus: mic.status,
      micGranted: Boolean(mic.granted),
      cameraStatus: 'n/a',
      cameraGranted: true,
    };
  }
  const cam = await Camera.getCameraPermissionsAsync();
  return {
    platform: 'ios',
    callType,
    micStatus: mic.status,
    micGranted: Boolean(mic.granted),
    cameraStatus: cam.status,
    cameraGranted: Boolean(cam.granted),
  };
}

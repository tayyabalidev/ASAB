import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  useMeeting,
  useParticipant,
  usePubSub,
  RTCView,
  MediaStream,
} from '@videosdk.live/react-native-sdk';

const NOOP_TOPIC = 'CHANGE_MODE___asab_noop__';

/**
 * Viewer co-host: accept host invite, publish mic/cam when SEND_AND_RECV.
 * Must render inside MeetingProvider.
 */
export default function LiveCoHostGuest() {
  const {
    localParticipant,
    changeMode,
    enableMic,
    enableWebcam,
    toggleMic,
    localMicOn,
  } = useMeeting();

  const participantId = localParticipant?.id || '';
  const mode = String(localParticipant?.mode || '').toUpperCase();
  const isSpeaker =
    mode === 'SEND_AND_RECV' || mode === 'SEND_RECV' || mode === 'CONFERENCE';
  const mediaStartedRef = useRef(false);

  const changeModeTopic = participantId ? `CHANGE_MODE_${participantId}` : NOOP_TOPIC;

  usePubSub(changeModeTopic, {
    onMessageReceived: (data) => {
      if (!participantId) return;
      const nextMode = data?.message?.mode || data?.mode;
      if (nextMode === 'RECV_ONLY') {
        changeMode?.('RECV_ONLY');
        return;
      }
      if (nextMode === 'SEND_AND_RECV') {
        Alert.alert(
          'Join as guest',
          'The host invited you to speak on camera. Join as a guest speaker?',
          [
            { text: 'Not now', style: 'cancel' },
            { text: 'Join', onPress: () => changeMode?.('SEND_AND_RECV') },
          ]
        );
      }
    },
  });

  const { webcamStream, webcamOn } = useParticipant(participantId || NOOP_TOPIC);

  const startGuestMedia = useCallback(async () => {
    if (mediaStartedRef.current || !isSpeaker) return;
    mediaStartedRef.current = true;
    try {
      await new Promise((r) => setTimeout(r, 400));
      await Promise.resolve(enableMic?.());
      await new Promise((r) => setTimeout(r, 300));
      if (!localMicOn) await Promise.resolve(toggleMic?.());
      await new Promise((r) => setTimeout(r, 400));
      await Promise.resolve(enableWebcam?.());
    } catch (_) {
      mediaStartedRef.current = false;
    }
  }, [isSpeaker, enableMic, enableWebcam, toggleMic, localMicOn]);

  useEffect(() => {
    if (isSpeaker) {
      startGuestMedia();
    } else {
      mediaStartedRef.current = false;
    }
  }, [isSpeaker, startGuestMedia]);

  if (!isSpeaker) return null;

  let previewUrl = null;
  try {
    if (webcamOn && webcamStream?.track) {
      previewUrl = new MediaStream([webcamStream.track]).toURL();
    }
  } catch (_) {
    previewUrl = null;
  }

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.pill}>
        <Text style={styles.pillText}>You're on stage</Text>
        {!localMicOn ? (
          <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />
        ) : null}
      </View>
      {previewUrl ? (
        <View style={styles.preview}>
          <RTCView
            streamURL={previewUrl}
            style={styles.previewVideo}
            objectFit="cover"
            mirror={false}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 56,
    right: 12,
    zIndex: 15,
    alignItems: 'flex-end',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(46, 125, 50, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  preview: {
    marginTop: 8,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#a77df8',
  },
  previewVideo: {
    width: '100%',
    height: '100%',
  },
});

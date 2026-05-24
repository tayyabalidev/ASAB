import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {
  useMeeting,
  useParticipant,
  usePubSub,
  RTCView,
  MediaStream,
} from '@videosdk.live/react-native-sdk';

function CoHostInviteListenerInner({ participantId, changeMode }) {
  usePubSub(`CHANGE_MODE_${participantId}`, {
    onMessageReceived: (data) => {
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
  return null;
}

/** Listens for host invite — no mic/cam (safe for all viewers). */
export function LiveCoHostInviteListener() {
  const { localParticipant, changeMode } = useMeeting();
  const participantId = localParticipant?.id;
  if (!participantId) return null;
  return (
    <CoHostInviteListenerInner participantId={participantId} changeMode={changeMode} />
  );
}

function GuestPreview({ participantId }) {
  const { webcamStream, webcamOn } = useParticipant(participantId);
  let previewUrl = null;
  try {
    if (webcamOn && webcamStream?.track) {
      previewUrl = new MediaStream([webcamStream.track]).toURL();
    } else if (webcamStream && typeof webcamStream.toURL === 'function') {
      previewUrl = webcamStream.toURL();
    }
  } catch (_) {
    previewUrl = null;
  }
  if (!previewUrl) return null;
  return (
    <View style={styles.preview}>
      <RTCView
        streamURL={previewUrl}
        style={styles.previewVideo}
        objectFit="cover"
        mirror={true}
        zOrder={1}
      />
    </View>
  );
}

/**
 * Guest on-stage media — only mount when local mode is SEND_AND_RECV.
 */
export function LiveCoHostGuestMedia() {
  const { localParticipant, enableWebcam, muteMic, unmuteMic, localMicOn } = useMeeting();

  const participantId = localParticipant?.id || '';
  const mediaStartedRef = useRef(false);

  useEffect(() => {
    if (!participantId) return undefined;
    let cancelled = false;
    mediaStartedRef.current = true;

    (async () => {
      try {
        await new Promise((r) => setTimeout(r, Platform.OS === 'android' ? 500 : 400));
        if (cancelled) return;
        await Promise.resolve(unmuteMic?.());
        await new Promise((r) => setTimeout(r, Platform.OS === 'android' ? 500 : 400));
        if (cancelled) return;
        await Promise.resolve(enableWebcam?.());
      } catch (_) {
        mediaStartedRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
      mediaStartedRef.current = false;
      try {
        muteMic?.();
      } catch (_) {}
    };
  }, [participantId, unmuteMic, enableWebcam, muteMic]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.pill}>
        <Text style={styles.pillText}>You're on stage</Text>
        {!localMicOn ? (
          <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />
        ) : null}
      </View>
      {participantId ? <GuestPreview participantId={participantId} /> : null}
    </View>
  );
}

/** @deprecated Use LiveCoHostInviteListener + LiveCoHostGuestMedia */
export default function LiveCoHostGuest() {
  const { localParticipant } = useMeeting();
  const mode = String(localParticipant?.mode || '').toUpperCase();
  const isSpeaker =
    mode === 'SEND_AND_RECV' || mode === 'SEND_RECV' || mode === 'CONFERENCE';

  return (
    <>
      <LiveCoHostInviteListener />
      {isSpeaker ? <LiveCoHostGuestMedia /> : null}
    </>
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

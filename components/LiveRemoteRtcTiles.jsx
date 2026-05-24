import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import {
  useMeeting,
  useParticipant,
  RTCView,
  MediaStream,
} from '@videosdk.live/react-native-sdk';

function isPublisherMode(mode) {
  const m = String(mode || '').trim().toUpperCase();
  return m === 'SEND_AND_RECV' || m === 'SEND_RECV' || m === 'CONFERENCE' || !m;
}

function RemoteTile({ participantId }) {
  const { webcamOn, webcamStream, displayName, micOn } = useParticipant(participantId);

  let streamURL = null;
  try {
    if (webcamOn && webcamStream?.track) {
      streamURL = new MediaStream([webcamStream.track]).toURL();
    } else if (webcamStream && typeof webcamStream.toURL === 'function') {
      streamURL = webcamStream.toURL();
    }
  } catch (_) {
    streamURL = null;
  }

  const canRenderRtc =
    webcamOn &&
    typeof streamURL === 'string' &&
    streamURL.length > 0;

  if (!canRenderRtc) {
    return (
      <View style={styles.tile}>
        <Text style={styles.tileName} numberOfLines={1}>
          {displayName || 'Guest'}
        </Text>
        <View style={styles.tilePlaceholder}>
          <Text style={styles.tilePlaceholderText}>{micOn ? '🎤' : '…'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tile}>
      <Text style={styles.tileName} numberOfLines={1}>
        {displayName || 'Guest'}
      </Text>
      <RTCView
        streamURL={streamURL}
        style={styles.tileVideo}
        objectFit="cover"
        mirror={false}
        zOrder={Platform.OS === 'android' ? 1 : 0}
      />
    </View>
  );
}

/**
 * WebRTC tiles for remote publishers (host + on-stage guests). Inside MeetingProvider.
 */
export default function LiveRemoteRtcTiles({
  excludeParticipantId = null,
  maxTiles = 4,
  /** When true (viewer), hide tiles if only the host is publishing — HLS already shows host. */
  hideWhenSinglePublisher = false,
}) {
  const { participants, localParticipant } = useMeeting();

  const remotePublisherIds = useMemo(() => {
    const localId = localParticipant?.id;
    const skip = new Set([excludeParticipantId, localId].filter(Boolean));
    const ids = [];
    if (participants instanceof Map) {
      participants.forEach((p, id) => {
        if (!id || skip.has(id)) return;
        if (isPublisherMode(p?.mode)) ids.push(id);
      });
    }
    return ids.slice(0, maxTiles);
  }, [participants, localParticipant?.id, excludeParticipantId, maxTiles]);

  const localMode = String(localParticipant?.mode || '').toUpperCase();
  const localIsSpeaker =
    localMode === 'SEND_AND_RECV' || localMode === 'SEND_RECV' || localMode === 'CONFERENCE';

  if (hideWhenSinglePublisher && remotePublisherIds.length <= 1 && !localIsSpeaker) {
    return null;
  }

  if (remotePublisherIds.length === 0) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {remotePublisherIds.map((id) => (
        <RemoteTile key={id} participantId={id} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 56,
    left: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    maxWidth: '70%',
    zIndex: 14,
  },
  tile: {
    width: 96,
    marginBottom: 4,
  },
  tileName: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  tileVideo: {
    width: 96,
    height: 128,
    borderRadius: 10,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: 'rgba(167,125,248,0.6)',
  },
  tilePlaceholder: {
    width: 96,
    height: 128,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tilePlaceholderText: {
    fontSize: 28,
  },
});

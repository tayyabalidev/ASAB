import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useMeeting, useParticipant, usePubSub } from '@videosdk.live/react-native-sdk';

function ModePublisher({ participantId, mode, onDone }) {
  const { publish } = usePubSub(`CHANGE_MODE_${participantId}`, {});
  useEffect(() => {
    if (!participantId || !mode) return;
    publish({ mode });
    onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per invite/remove
  }, [participantId, mode]);
  return null;
}

function GuestRow({ participantId }) {
  const { displayName, micOn, webcamOn, mode, isLocal } = useParticipant(participantId);
  const m = String(mode || '').toUpperCase();
  const isRecvOnly = m === 'RECV_ONLY' || m === 'VIEWER';
  const { publish } = usePubSub(`CHANGE_MODE_${participantId}`, {});

  if (isLocal) return null;

  const name = displayName || participantId?.slice(0, 8) || 'Guest';

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <Text style={styles.rowName}>{name}</Text>
        <Text style={styles.rowMeta}>
          {isRecvOnly ? 'Watching' : 'On stage'} · {micOn ? 'mic' : 'muted'} ·{' '}
          {webcamOn ? 'cam' : 'no cam'}
        </Text>
      </View>
      {isRecvOnly ? (
        <TouchableOpacity
          style={styles.allowBtn}
          onPress={() => publish({ mode: 'SEND_AND_RECV' })}
        >
          <Text style={styles.allowText}>Invite</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.denyBtn}
          onPress={() => publish({ mode: 'RECV_ONLY' })}
        >
          <Text style={styles.denyText}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function HostRaiseHandListener({ onInvite }) {
  const seenRef = useRef(new Set());

  usePubSub('RAISE_HAND', {
    onMessageReceived: (data) => {
      const senderName = data?.senderName || 'Viewer';
      const pid = data?.participantId || data?.senderId;
      if (!pid) return;
      const key = String(pid);
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);

      Alert.alert(
        'Raise hand',
        `${senderName} wants to speak.`,
        [
          {
            text: 'Dismiss',
            style: 'cancel',
            onPress: () => seenRef.current.delete(key),
          },
          {
            text: 'Invite to stage',
            onPress: () => {
              seenRef.current.delete(key);
              onInvite(pid);
            },
          },
        ]
      );
    },
  });

  return null;
}

/**
 * Host: raise-hand alerts + guest list to invite/remove. Inside MeetingProvider.
 */
export default function LiveHostGuestControls({ visible, onClose }) {
  const { participants, localParticipant } = useMeeting();
  const [modePublish, setModePublish] = useState(null);

  const remoteIds = useMemo(() => {
    const localId = localParticipant?.id;
    if (!(participants instanceof Map)) return [];
    return [...participants.keys()].filter((id) => id && id !== localId);
  }, [participants, localParticipant?.id]);

  return (
    <>
      <HostRaiseHandListener
        onInvite={(pid) => setModePublish({ participantId: pid, mode: 'SEND_AND_RECV' })}
      />
      {modePublish ? (
        <ModePublisher
          participantId={modePublish.participantId}
          mode={modePublish.mode}
          onDone={() => setModePublish(null)}
        />
      ) : null}
      {!visible ? null : (
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Guests ({remoteIds.length})</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.list}>
            {remoteIds.length === 0 ? (
              <Text style={styles.empty}>No viewers in the room yet.</Text>
            ) : (
              remoteIds.map((id) => <GuestRow key={id} participantId={id} />)
            )}
          </ScrollView>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '45%',
    backgroundColor: 'rgba(10,10,10,0.96)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  title: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  close: {
    color: '#fff',
    fontSize: 22,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 20,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  rowInfo: {
    flex: 1,
    marginRight: 10,
  },
  rowName: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  rowMeta: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
  },
  allowBtn: {
    backgroundColor: '#a77df8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  allowText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  denyBtn: {
    backgroundColor: 'rgba(255,71,87,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
  },
  denyText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
});

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  useMeeting,
  useParticipant,
  usePubSub,
  RTCView,
  MediaStream,
} from '@videosdk.live/react-native-sdk';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { decodePubSubMessage, STAGE_CONTROL_TOPIC } from '../lib/livePubSubPayload';

function applyModeChange(changeMode, mode) {
  if (!changeMode || !mode) return false;
  try {
    const result = changeMode(mode);
    if (result && typeof result.then === 'function') {
      result.catch(() => {});
    }
    return true;
  } catch (_) {
    return false;
  }
}

function CoHostInviteListenerInner({
  participantId,
  changeMode,
  muteMic,
  disableWebcam,
  localParticipant,
}) {
  const { t } = useTranslation();
  const lastIndexModeRef = useRef(0);
  const lastIndexStageRef = useRef(0);
  const handledRef = useRef(new Set());
  const changeModeRef = useRef(changeMode);
  const muteMicRef = useRef(muteMic);
  const disableWebcamRef = useRef(disableWebcam);
  const localParticipantRef = useRef(localParticipant);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [inviterName, setInviterName] = useState('');
  changeModeRef.current = changeMode;
  muteMicRef.current = muteMic;
  disableWebcamRef.current = disableWebcam;
  localParticipantRef.current = localParticipant;

  const showInvite = useCallback(
    (senderName) => {
      setInviterName(senderName || 'Host');
      setInviteVisible(true);
    },
    []
  );

  const handleInviteMessage = useCallback(
    (data, { trustTopic = false } = {}) => {
      // Docs shape: { message: { mode: "SEND_AND_RECV" }, senderName }
      const rawMessage = data?.message;
      const docsMode =
        rawMessage && typeof rawMessage === 'object' && !Array.isArray(rawMessage)
          ? String(rawMessage.mode || '').toUpperCase()
          : '';

      const payload = decodePubSubMessage(data);
      const target =
        payload.targetParticipantId || payload.participantId || null;
      // Per-participant topic is already addressed to us; shared topic must match target.
      if (!trustTopic && target && String(target) !== String(participantId)) return;

      const nextMode = docsMode || String(payload.mode || '').toUpperCase();
      if (!nextMode) return;

      const key = `${nextMode}:${data?.id || data?.timestamp || `${payload.senderId}:${Date.now()}`}`;
      if (handledRef.current.has(key)) return;
      handledRef.current.add(key);

      if (
        nextMode === 'SIGNALLING_ONLY' ||
        nextMode === 'RECV_ONLY' ||
        nextMode === 'VIEWER'
      ) {
        // Demote only via STAGE_CONTROL (shared topic). CHANGE_MODE is invite-only.
        if (trustTopic) return;
        setInviteVisible(false);
        try {
          muteMicRef.current?.();
        } catch (_) {}
        try {
          disableWebcamRef.current?.();
        } catch (_) {}
        applyModeChange(changeModeRef.current, 'SIGNALLING_ONLY');
        return;
      }

      if (nextMode === 'SEND_AND_RECV' || nextMode === 'SEND_RECV') {
        showInvite(data?.senderName || payload.senderName || 'Host');
      }
    },
    [participantId, showInvite]
  );

  const { messages: modeMessages } = usePubSub(`CHANGE_MODE_${participantId}`, {
    onMessageReceived: (data) => handleInviteMessage(data, { trustTopic: true }),
  });

  const { messages: stageMessages } = usePubSub(STAGE_CONTROL_TOPIC, {
    onMessageReceived: (data) => handleInviteMessage(data, { trustTopic: false }),
  });

  useEffect(() => {
    const msgs = modeMessages || [];
    for (let i = lastIndexModeRef.current; i < msgs.length; i += 1) {
      handleInviteMessage(msgs[i], { trustTopic: true });
    }
    lastIndexModeRef.current = msgs.length;
  }, [modeMessages, handleInviteMessage]);

  useEffect(() => {
    const msgs = stageMessages || [];
    for (let i = lastIndexStageRef.current; i < msgs.length; i += 1) {
      handleInviteMessage(msgs[i], { trustTopic: false });
    }
    lastIndexStageRef.current = msgs.length;
  }, [stageMessages, handleInviteMessage]);

  const acceptInvite = () => {
    setInviteVisible(false);
    const ok = applyModeChange(changeModeRef.current, 'SEND_AND_RECV');
    if (!ok) {
      Alert.alert(
        'Could not join',
        'Failed to switch to guest mode. Try again or ask the host to re-invite.'
      );
      return;
    }
    // Fast-path pin; onParticipantModeChanged also pins when mode settles.
    try {
      const lp = localParticipantRef.current;
      if (lp && typeof lp.pin === 'function') lp.pin();
    } catch (_) {
      /* ignore */
    }
  };

  if (!inviteVisible) return null;

  return (
    <View style={styles.inviteOverlay} pointerEvents="box-none">
      <View style={styles.inviteCard}>
        <Text style={styles.inviteTitle}>
          {t('liveBroadcast.groupStage.joinTitle', { defaultValue: 'Join as guest' })}
        </Text>
        <Text style={styles.inviteBody}>
          {t('liveBroadcast.groupStage.joinBodyNamed', {
            defaultValue: '{{name}} invited you to speak on stage.',
            name: inviterName,
          })}
        </Text>
        <View style={styles.inviteActions}>
          <TouchableOpacity
            style={styles.inviteDecline}
            onPress={() => setInviteVisible(false)}
            activeOpacity={0.85}
          >
            <Text style={styles.inviteDeclineText}>
              {t('common.cancel', { defaultValue: 'Not now' })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.inviteAccept} onPress={acceptInvite} activeOpacity={0.85}>
            <Text style={styles.inviteAcceptText}>
              {t('liveBroadcast.groupStage.join', { defaultValue: 'Join' })}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/** Listens for host invite — no mic/cam (safe for all viewers). */
export function LiveCoHostInviteListener() {
  const { localParticipant, changeMode, muteMic, disableWebcam } = useMeeting();
  const participantId = localParticipant?.id;
  if (!participantId) return null;
  return (
    <CoHostInviteListenerInner
      participantId={participantId}
      changeMode={changeMode}
      muteMic={muteMic}
      disableWebcam={disableWebcam}
      localParticipant={localParticipant}
    />
  );
}

function GuestControlListenerInner({
  participantId,
  muteMic,
  unmuteMic,
  disableWebcam,
  changeMode,
}) {
  const lastIndexControlRef = useRef(0);
  const lastIndexStageRef = useRef(0);
  const muteMicRef = useRef(muteMic);
  const unmuteMicRef = useRef(unmuteMic);
  const disableWebcamRef = useRef(disableWebcam);
  const changeModeRef = useRef(changeMode);
  muteMicRef.current = muteMic;
  unmuteMicRef.current = unmuteMic;
  disableWebcamRef.current = disableWebcam;
  changeModeRef.current = changeMode;

  const handleControlMessage = useCallback(
    (data) => {
      const payload = decodePubSubMessage(data);
      const target = payload.targetParticipantId || payload.participantId || null;
      if (target && String(target) !== String(participantId)) return;

      const action = payload.action;
      if (!action) return;

      if (action === 'mute') {
        try {
          muteMicRef.current?.();
        } catch (_) {}
        return;
      }
      if (action === 'unmute') {
        try {
          unmuteMicRef.current?.();
        } catch (_) {}
        return;
      }
      if (action === 'remove') {
        try {
          muteMicRef.current?.();
        } catch (_) {}
        try {
          disableWebcamRef.current?.();
        } catch (_) {}
        applyModeChange(changeModeRef.current, 'SIGNALLING_ONLY');
      }
    },
    [participantId]
  );

  const { messages: controlMessages } = usePubSub(`GUEST_CONTROL_${participantId}`, {
    onMessageReceived: handleControlMessage,
  });

  const { messages: stageMessages } = usePubSub(STAGE_CONTROL_TOPIC, {
    onMessageReceived: handleControlMessage,
  });

  useEffect(() => {
    const msgs = controlMessages || [];
    for (let i = lastIndexControlRef.current; i < msgs.length; i += 1) {
      handleControlMessage(msgs[i]);
    }
    lastIndexControlRef.current = msgs.length;
  }, [controlMessages, handleControlMessage]);

  useEffect(() => {
    const msgs = stageMessages || [];
    for (let i = lastIndexStageRef.current; i < msgs.length; i += 1) {
      handleControlMessage(msgs[i]);
    }
    lastIndexStageRef.current = msgs.length;
  }, [stageMessages, handleControlMessage]);

  return null;
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
 * @param {{ hidePreview?: boolean }} props
 */
export function LiveCoHostGuestMedia({ hidePreview = false }) {
  const { t } = useTranslation();
  const {
    localParticipant,
    enableWebcam,
    disableWebcam,
    muteMic,
    unmuteMic,
    localMicOn,
    localWebcamOn,
    changeMode,
  } = useMeeting();

  const participantId = localParticipant?.id || '';
  const mediaStartedRef = useRef(false);
  const [blurMode, setBlurMode] = useState(false);

  useEffect(() => {
    if (!participantId) return undefined;
    let cancelled = false;
    mediaStartedRef.current = true;

    (async () => {
      try {
        await new Promise((r) => setTimeout(r, Platform.OS === 'android' ? 300 : 200));
        if (cancelled) return;
        await Promise.resolve(unmuteMic?.());
        await new Promise((r) => setTimeout(r, Platform.OS === 'android' ? 300 : 200));
        if (cancelled || blurMode) return;
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
      try {
        disableWebcam?.();
      } catch (_) {}
    };
    // Intentionally omit blurMode — join always starts with cam on unless user toggles blur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participantId, unmuteMic, enableWebcam, muteMic, disableWebcam]);

  const toggleBlur = async () => {
    try {
      if (!blurMode) {
        await Promise.resolve(disableWebcam?.());
        setBlurMode(true);
      } else {
        await Promise.resolve(enableWebcam?.());
        setBlurMode(false);
      }
    } catch (_) {
      /* ignore */
    }
  };

  const toggleSelfMute = async () => {
    try {
      if (localMicOn) await Promise.resolve(muteMic?.());
      else await Promise.resolve(unmuteMic?.());
    } catch (_) {
      /* ignore */
    }
  };

  return (
    <View
      style={[styles.wrap, hidePreview ? styles.wrapOnStage : styles.wrapPreview]}
      pointerEvents="box-none"
    >
      {participantId ? (
        <GuestControlListenerInner
          participantId={participantId}
          muteMic={muteMic}
          unmuteMic={unmuteMic}
          disableWebcam={disableWebcam}
          changeMode={changeMode}
        />
      ) : null}
      <View style={styles.pill}>
        <Text style={styles.pillText}>
          {t('liveBroadcast.groupStage.youreOnStage', { defaultValue: "You're on stage" })}
        </Text>
        {!localMicOn ? (
          <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />
        ) : null}
      </View>
      <View style={styles.controlsRow}>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={toggleSelfMute}
          accessibilityLabel={localMicOn ? 'Mute' : 'Unmute'}
        >
          <Feather name={localMicOn ? 'mic' : 'mic-off'} size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.controlBtn, blurMode && styles.controlBtnActive]}
          onPress={toggleBlur}
          accessibilityLabel={
            blurMode
              ? t('liveBroadcast.groupStage.blurOff', { defaultValue: 'Show camera' })
              : t('liveBroadcast.groupStage.blurOn', { defaultValue: 'Blur mode' })
          }
        >
          <Feather name={blurMode || !localWebcamOn ? 'user' : 'video'} size={16} color="#fff" />
          <Text style={styles.controlBtnText}>
            {blurMode || !localWebcamOn
              ? t('liveBroadcast.groupStage.blurOff', { defaultValue: 'Show camera' })
              : t('liveBroadcast.groupStage.blurOn', { defaultValue: 'Blur' })}
          </Text>
        </TouchableOpacity>
      </View>
      {!hidePreview && participantId ? <GuestPreview participantId={participantId} /> : null}
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
  inviteOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 28,
  },
  inviteCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(20,20,20,0.98)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  inviteTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  inviteBody: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  inviteActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  inviteDecline: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  inviteDeclineText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  inviteAccept: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: '#a77df8',
  },
  inviteAcceptText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  wrap: {
    position: 'absolute',
    zIndex: 15,
    alignItems: 'flex-end',
  },
  wrapPreview: {
    top: 56,
    right: 12,
  },
  wrapOnStage: {
    bottom: 168,
    right: 12,
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
  controlsRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  controlBtnActive: {
    borderColor: '#7dd3fc',
  },
  controlBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
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

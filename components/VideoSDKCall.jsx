/**
 * VideoSDK Call Component
 * 
 * Handles audio and video calls using VideoSDK
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
// VideoSDK React Native SDK imports
// Note: Install @videosdk.live/react-native-sdk package
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  RTCView,
  MediaStream,
  createMicrophoneAudioTrack,
} from '@videosdk.live/react-native-sdk';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { getVideoSDKToken, waitForMeetingJoinFn } from '../lib/videosdkHelper';
import { validateMeetingToken } from '../lib/videosdkTokenValidate';
import { videosdkTrace } from '../lib/videosdkTrace';
import { ensureCallMediaPermissions } from '../lib/videosdkMediaPermissions';
import { startCallAudioSession, stopCallAudioSession } from '../lib/videosdkCallSession';
import { updateCallStatus } from '../lib/calls';
import { CallState } from '../lib/callHelper';
const { width, height } = Dimensions.get('window');

const UI = {
  text: '#f8fafc',
  muted: '#94a3b8',
  danger: '#ef4444',
  surface: 'rgba(255,255,255,0.12)',
  accent: '#34d399',
  accentVoice: '#818cf8',
};

/** How long to wait for the other person after we joined the room (no auto-hangup before this). */
const WAIT_FOR_PEER_MS = 120000;

function participantInitial(name) {
  const n = String(name || '').trim();
  return (n.charAt(0) || '?').toUpperCase();
}

function CallParticipantCard({ title, name, avatarUri, micOn, accent }) {
  const label = String(name || 'Participant').trim() || 'Participant';
  return (
    <View style={styles.audioParticipantCard}>
      <Text style={styles.audioParticipantTitle}>{title}</Text>
      <View style={[styles.audioAvatarRing, { borderColor: accent + '88' }]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.audioAvatarImage} />
        ) : (
          <LinearGradient colors={['#312e81', '#1e1b4b']} style={styles.audioAvatarInner}>
            <Text style={styles.audioAvatarText}>{participantInitial(label)}</Text>
          </LinearGradient>
        )}
        {micOn === false ? (
          <View style={styles.audioMicOffBadge}>
            <Feather name="mic-off" size={14} color="#fff" />
          </View>
        ) : null}
      </View>
      <Text style={styles.audioParticipantName} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Keeps remote mic playback attached (RN WebRTC audio sink). */
function RemoteParticipantCard({ participantId, name, avatarUri, accent }) {
  const { micOn } = useParticipant(participantId);
  return (
    <CallParticipantCard
      title="Contact"
      name={name}
      avatarUri={avatarUri}
      micOn={micOn}
      accent={accent}
    />
  );
}

function RemoteParticipantAudioSink({ participantId }) {
  const { micOn, micStream } = useParticipant(participantId);
  if (!micOn || !micStream?.track) return null;

  let streamURL = null;
  try {
    streamURL = new MediaStream([micStream.track]).toURL();
  } catch (_) {
    return null;
  }
  if (!streamURL) return null;

  return (
    <RTCView
      streamURL={streamURL}
      style={styles.hiddenAudioSink}
      objectFit="cover"
      zOrder={-1}
    />
  );
}

// Inner component that uses VideoSDK hooks
const VideoSDKCallInner = ({
  roomId,
  currentUserId,
  callType = 'video',
  callId = null,
  phase = 'active',
  onCallEnd,
  onError,
  peerDisplayName = 'Participant',
  localDisplayName = 'You',
  localAvatarUri = null,
  peerAvatarUri = null,
}) => {
  const isPrecall = phase === 'precall';
  const insets = useSafeAreaInsets();
  const [callDuration, setCallDuration] = useState(0);
  /** Room joined (VideoSDK) vs peer visible — Appwrite CONNECTED only after peer is in the room */
  const [meetingJoined, setMeetingJoined] = useState(false);
  
  const durationIntervalRef = useRef(null);
  const callIdRef = useRef(callId);
  const participantsRef = useRef(new Map());
  const meetingJoinedRef = useRef(false);
  const connectedReportedRef = useRef(false);
  const endingRef = useRef(false);
  const joinTimeoutRef = useRef(null);
  const waitForPeerTimeoutRef = useRef(null);
  const joinFnRef = useRef(null);
  const leaveFnRef = useRef(null);
  const phaseRef = useRef(phase);
  const joinRequestedRef = useRef(false);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    callIdRef.current = callId;
    connectedReportedRef.current = false;
    joinRequestedRef.current = false;
    meetingJoinedRef.current = false;
    setMeetingJoined(false);
  }, [callId, roomId]);

  const {
    join,
    leave,
    muteMic,
    unmuteMic,
    toggleWebcam,
    enableWebcam,
    localMicOn,
    localWebcamOn,
    participants,
    localParticipant,
  } = useMeeting({
    onMicRequested: ({ accept }) => {
      accept?.();
    },
    onWebcamRequested: ({ accept }) => {
      accept?.();
    },
    onMeetingJoined: () => {
      const parts = participantsRef.current;
      const count = parts instanceof Map ? parts.size : 0;
      videosdkTrace('S3_JOIN', 'MEETING_JOINED', {
        roomId,
        phase: phaseRef.current,
        callId: callIdRef.current,
        participantCount: count,
      });
      console.log('[CALL_MEETING_JOINED]', {
        roomId,
        phase: phaseRef.current,
        callId: callIdRef.current,
        participantCount: count,
      });
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      meetingJoinedRef.current = true;
      setMeetingJoined(true);
      if (!isPrecall) {
        startCallAudioSession(callType);
      }
      setTimeout(async () => {
        try {
          const speechTrack = await createMicrophoneAudioTrack({
            encoderConfig: 'speech_standard',
            noiseConfig: {
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true,
            },
          });
          await Promise.resolve(unmuteMic?.(speechTrack));
        } catch (_) {
          try {
            await Promise.resolve(unmuteMic?.());
          } catch (micErr) {
            videosdkTrace('S3_JOIN', 'UNMUTE_MIC_ERROR', {
              message: micErr?.message || String(micErr),
            });
          }
        }
        videosdkTrace('S3_JOIN', 'UNMUTE_MIC_AFTER_JOIN', { roomId });
        if (callType === 'video') {
          setTimeout(() => {
            try {
              enableWebcam?.();
              videosdkTrace('S3_JOIN', 'ENABLE_WEBCAM_AFTER_JOIN', { roomId });
            } catch (e) {
              videosdkTrace('S3_JOIN', 'ENABLE_WEBCAM_AFTER_JOIN_ERROR', {
                message: e?.message || String(e),
              });
            }
          }, 500);
        }
      }, 400);
    },
    onMeetingLeft: () => {
      console.log('👋 Left VideoSDK meeting');
      const hadJoined = meetingJoinedRef.current;
      meetingJoinedRef.current = false;
      // Precall: stay on ring UI if signaling drops; active call ends when peer leaves.
      if (!endingRef.current && hadJoined && phaseRef.current === 'active') {
        handleCallEnd();
      }
    },
    onError: (error) => {
      console.error('❌ VideoSDK error:', error);
      if (!isPrecall) {
        Alert.alert('Call Error', error?.message || 'An error occurred during the call');
      }
      if (onError) onError(error);
    },
    onParticipantJoined: (participant) => {
      const parts = participantsRef.current;
      const count = parts instanceof Map ? parts.size : 0;
      videosdkTrace('S4_PARTICIPANTS', 'JOINED', {
        roomId,
        id: participant?.id || null,
        count,
      });
      console.log('👤 Participant joined:', participant.id);
    },
    onParticipantLeft: (participant) => {
      console.log('👋 Participant left:', participant.id);
      setTimeout(() => {
        if (endingRef.current || !connectedReportedRef.current) return;
        const parts = participantsRef.current;
        const count = parts instanceof Map ? parts.size : 0;
        if (count <= 1) {
          handleCallEnd();
        }
      }, 400);
    },
  });

  participantsRef.current = participants;
  joinFnRef.current = join;
  leaveFnRef.current = leave;

  // VideoSDK participant ids are not Appwrite user ids — exclude local by SDK localParticipant
  const localId = localParticipant?.id;
  const participantCount = (() => {
    if (!localId) return meetingJoined ? 1 : 0;
    const size = participants instanceof Map ? participants.size : 0;
    return participants.has(localId) ? Math.max(1, size) : size + 1;
  })();

  useEffect(() => {
    if (!meetingJoined && !localId) return;
    const ids = participants instanceof Map ? Array.from(participants.keys()) : [];
    videosdkTrace('S4_PARTICIPANTS', 'SNAPSHOT', {
      roomId,
      localId: localId || null,
      count: participantCount,
      ids,
      phase: phaseRef.current,
    });
  }, [meetingJoined, localId, participantCount, participants, roomId]);

  const remoteParticipants = localId
    ? Array.from(participants.values()).filter((p) => p.id !== localId)
    : [];
  // Do not treat "everyone as remote" before localParticipant exists (avoids false "Connected")
  const remoteConnected = Boolean(localId) && remoteParticipants.length > 0;

  // Mark Appwrite call CONNECTED only once both sides are in the same VideoSDK room
  useEffect(() => {
    if (!remoteConnected || !callIdRef.current || connectedReportedRef.current) return;
    connectedReportedRef.current = true;
    const parts = participants;
    const totalCount = parts instanceof Map ? parts.size : 0;
    videosdkTrace('S4_PARTICIPANTS', 'REMOTE_CONNECTED', {
      callId: callIdRef.current,
      roomId,
      remoteCount: remoteParticipants.length,
      totalCount,
    });
    console.log('[CALL_REMOTE_CONNECTED]', {
      callId: callIdRef.current,
      roomId,
      remoteCount: remoteParticipants.length,
    });
    updateCallStatus(callIdRef.current, CallState.CONNECTED).catch(console.error);
  }, [remoteConnected]);

  useEffect(() => {
    if (!remoteConnected) return;

    setCallDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [remoteConnected]);

  // Wait for peer after we joined — do not hang up after a few seconds (iOS token/permissions often take longer).
  useEffect(() => {
    if (waitForPeerTimeoutRef.current) {
      clearTimeout(waitForPeerTimeoutRef.current);
      waitForPeerTimeoutRef.current = null;
    }
    if (!meetingJoined || remoteConnected) return undefined;

    waitForPeerTimeoutRef.current = setTimeout(() => {
      if (endingRef.current || connectedReportedRef.current) return;
      const parts = participantsRef.current;
      const count = parts instanceof Map ? parts.size : 0;
      if (count > 1) return;
      Alert.alert(
        'Still waiting',
        `${peerDisplayName || 'The other person'} has not joined yet. Keep waiting or end the call.`,
        [
          { text: 'Keep waiting', style: 'cancel' },
          { text: 'End call', style: 'destructive', onPress: () => handleCallEnd() },
        ]
      );
    }, WAIT_FOR_PEER_MS);

    return () => {
      if (waitForPeerTimeoutRef.current) {
        clearTimeout(waitForPeerTimeoutRef.current);
        waitForPeerTimeoutRef.current = null;
      }
    };
  }, [meetingJoined, remoteConnected, peerDisplayName]);

  useEffect(() => {
    if (joinRequestedRef.current) return undefined;

    let cancelled = false;
    const joinMeeting = async () => {
      try {
        videosdkTrace('S3_JOIN', 'START', {
          roomId,
          callType,
          phase: phaseRef.current,
          callId: callIdRef.current,
          userId: currentUserId || null,
        });
        console.log('[CALL_JOIN_START]', {
          roomId,
          callType,
          phase: phaseRef.current,
          callId: callIdRef.current,
          userId: currentUserId || null,
        });
        const allowed = await ensureCallMediaPermissions(callType);
        if (cancelled) return;
        if (!allowed) {
          Alert.alert(
            'Permissions Required',
            callType === 'video'
              ? 'Microphone and camera access are required for video calls. You can enable them in Settings.'
              : 'Microphone access is required for audio calls. You can enable it in Settings.'
          );
          if (onError) onError('PERMISSION_DENIED');
          return;
        }

        const joinFn = await waitForMeetingJoinFn(() => joinFnRef.current, {
          isCancelled: () => cancelled,
        });
        if (cancelled) return;
        if (!joinFn) {
          videosdkTrace('S3_JOIN', 'JOIN_FN_TIMEOUT', { roomId, callId: callIdRef.current });
          throw new Error('VideoSDK join() was not ready');
        }

        videosdkTrace('S3_JOIN', 'JOIN_FN_READY', { roomId });
        joinRequestedRef.current = true;

        joinTimeoutRef.current = setTimeout(() => {
          if (!cancelled && !meetingJoinedRef.current && !endingRef.current) {
            const timeoutError = new Error('Joining room timed out. Check token, roomId, or network.');
            console.warn('[CALL_JOIN_TIMEOUT]', {
              roomId,
              phase: phaseRef.current,
              callId: callIdRef.current,
            });
            if (phaseRef.current !== 'precall' && onError) onError(timeoutError);
          }
        }, 45000);

        await joinFn();
        videosdkTrace('S3_JOIN', 'REQUESTED', {
          roomId,
          callId: callIdRef.current,
          phase: phaseRef.current,
        });
        console.log('[CALL_JOIN_REQUESTED]', {
          roomId,
          callId: callIdRef.current,
          phase: phaseRef.current,
        });
      } catch (error) {
        joinRequestedRef.current = false;
        if (cancelled || endingRef.current) return;
        videosdkTrace('S3_JOIN', 'FAIL', {
          roomId,
          message: error?.message || String(error),
        });
        console.error('[CALL_JOIN_FAILED]', error);
        if (phaseRef.current !== 'precall') {
          Alert.alert('Error', 'Failed to join call. Please try again.');
        }
        if (onError) onError(error);
      }
    };

    joinMeeting();
    return () => {
      cancelled = true;
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
    };
  }, [roomId, callType, currentUserId, callId, onError]);

  const handleCallEnd = async () => {
    if (endingRef.current) return;
    console.log('[CALL_END_START]', {
      roomId,
      callId: callIdRef.current,
      userId: currentUserId || null,
    });
    endingRef.current = true;
    connectedReportedRef.current = false;
    setMeetingJoined(false);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    try {
      await leave();
    } catch (e) {
      console.warn('Error leaving meeting:', e);
    }
    stopCallAudioSession();
    console.log('[CALL_END_DONE]', {
      roomId,
      callId: callIdRef.current,
    });
    try {
      if (onCallEnd) onCallEnd();
    } catch (e) {
      console.warn('Error in onCallEnd:', e);
    }
  };

  useEffect(() => {
    return () => {
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      if (waitForPeerTimeoutRef.current) {
        clearTimeout(waitForPeerTimeoutRef.current);
        waitForPeerTimeoutRef.current = null;
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (!endingRef.current) {
        endingRef.current = true;
        stopCallAudioSession();
        try {
          leaveFnRef.current?.();
        } catch (_) {}
      }
    };
  }, []);

  const toggleMute = async () => {
    try {
      if (localMicOn) {
        await Promise.resolve(muteMic?.());
      } else {
        try {
          const speechTrack = await createMicrophoneAudioTrack({
            encoderConfig: 'speech_standard',
            noiseConfig: {
              noiseSuppression: true,
              echoCancellation: true,
              autoGainControl: true,
            },
          });
          await Promise.resolve(unmuteMic?.(speechTrack));
        } catch (_) {
          await Promise.resolve(unmuteMic?.());
        }
      }
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  const toggleVideo = async () => {
    if (callType !== 'video') return;

    try {
      await toggleWebcam();
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const remoteParticipant = remoteParticipants[0] ?? null;
  const remoteParticipantId =
    remoteParticipant && remoteParticipant.id != null
      ? String(remoteParticipant.id)
      : null;
  const remoteLabel =
    peerDisplayName ||
    remoteParticipant?.displayName ||
    'Participant';
  const remoteInitial = participantInitial(remoteLabel);
  const voiceAccent = callType === 'audio' ? UI.accentVoice : UI.accent;
  const isMuted = !localMicOn;
  const isVideoEnabled = Boolean(localWebcamOn);

  const audioStatusText = !meetingJoined
    ? 'Joining call…'
    : remoteConnected
      ? 'Connected'
      : `Waiting for ${peerDisplayName || 'participant'}…`;

  const controlsBottom = Math.max(insets.bottom, 20) + 16;

  const roomParticipantCount = (() => {
    if (!meetingJoined) return 0;
    if (!localId) return 1;
    const size = participants instanceof Map ? participants.size : 0;
    return participants.has(localId) ? Math.max(1, size) : size + 1;
  })();

  if (isPrecall) {
    return (
      <View style={styles.precallHost} pointerEvents="none">
        {__DEV__ ? (
          <Text style={styles.precallDevBadge}>
            {meetingJoined ? `In room · ${roomParticipantCount}` : 'Joining room…'}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {callType === 'video' && (
        <>
          {remoteConnected ? (
            <View style={styles.remoteVideoContainer}>
              {remoteParticipants.map((participant) => (
                <RemoteParticipantView
                  key={participant.id}
                  participant={participant}
                />
              ))}
            </View>
          ) : (
            <LinearGradient
              colors={['#0c1222', '#1a2238', '#0f172a']}
              style={styles.videoWaitingLayer}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
            >
              <View style={[styles.waitingAvatar, { borderColor: voiceAccent + '88' }]}>
                <Text style={styles.waitingAvatarText}>{remoteInitial}</Text>
              </View>
              <ActivityIndicator size="small" color={voiceAccent} style={{ marginTop: 20 }} />
              <Text style={styles.waitingTitle}>
                {!meetingJoined ? 'Joining call…' : 'Waiting for peer'}
              </Text>
              <Text style={styles.waitingSubtitle} numberOfLines={2}>
                {!meetingJoined
                  ? 'Connecting to the room'
                  : `Waiting for ${peerDisplayName || 'the other person'}`}
              </Text>
            </LinearGradient>
          )}
          {isVideoEnabled && (
            <View style={[styles.localVideoContainer, { top: insets.top + 12 }]}>
              <LocalParticipantView />
            </View>
          )}
        </>
      )}

      {callType === 'audio' && (
        <LinearGradient
          colors={['#0c1222', '#1e1b4b', '#0f172a']}
          style={styles.audioCallContainer}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
        >
          {remoteParticipantId ? (
            <RemoteParticipantAudioSink participantId={remoteParticipantId} />
          ) : null}
          <View style={styles.audioParticipantsRow}>
            <CallParticipantCard
              title="You"
              name={localDisplayName}
              avatarUri={localAvatarUri}
              micOn={localMicOn}
              accent={UI.accentVoice}
            />
            {remoteParticipantId ? (
              <RemoteParticipantCard
                participantId={remoteParticipantId}
                name={remoteLabel}
                avatarUri={peerAvatarUri}
                accent={UI.accentVoice}
              />
            ) : (
              <CallParticipantCard
                title="Contact"
                name={remoteLabel}
                avatarUri={peerAvatarUri}
                micOn={false}
                accent={UI.accentVoice}
              />
            )}
          </View>
          <View style={styles.audioStatusRow}>
            <View style={[styles.statusDot, remoteConnected && styles.statusDotLive]} />
            <Text style={styles.callStatus}>{audioStatusText}</Text>
          </View>
        </LinearGradient>
      )}

      <View style={[styles.infoOverlay, { top: insets.top + 12 }]}>
        <View style={styles.durationPill}>
          <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
        </View>
      </View>

      <View style={[styles.controlsContainer, { paddingBottom: controlsBottom }]}>
        <TouchableOpacity
          style={[styles.controlCircle, isMuted && styles.controlCircleMuted]}
          onPress={toggleMute}
          activeOpacity={0.85}
        >
          <Feather name={isMuted ? 'mic-off' : 'mic'} size={24} color={UI.text} />
        </TouchableOpacity>

        {callType === 'video' && (
          <TouchableOpacity
            style={[styles.controlCircle, !isVideoEnabled && styles.controlCircleMuted]}
            onPress={toggleVideo}
            activeOpacity={0.85}
          >
            <Feather name={isVideoEnabled ? 'video' : 'video-off'} size={24} color={UI.text} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.endCircle}
          onPress={handleCallEnd}
          activeOpacity={0.88}
        >
          <Feather name="phone-off" size={26} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Remote Participant Video Component
const RemoteParticipantView = ({ participant }) => {
  const { webcamStream, webcamOn, displayName } = useParticipant(participant.id);

  if (!webcamOn || !webcamStream) {
    return (
      <View style={styles.remoteVideoPlaceholder}>
        <Text style={styles.placeholderText}>
          {displayName?.charAt(0)?.toUpperCase() || participant.id?.charAt(0)?.toUpperCase() || 'U'}
        </Text>
      </View>
    );
  }

  return (
    <RTCView
      streamURL={webcamStream.toURL()}
      style={styles.remoteVideo}
      objectFit="cover"
      zOrder={0}
    />
  );
};

// Local Participant Video Component
const LocalParticipantView = () => {
  const { localWebcamOn, localWebcamStream } = useMeeting();

  if (!localWebcamOn || !localWebcamStream) {
    return null;
  }

  return (
    <RTCView
      streamURL={localWebcamStream.toURL()}
      style={styles.localVideo}
      objectFit="cover"
      mirror={true}
      zOrder={1}
    />
  );
};

// Main VideoSDK Call Component
const VideoSDKCall = ({
  roomId,
  callerId,
  receiverId,
  currentUserId,
  callType = 'video',
  callId = null,
  phase = 'active',
  initialToken = null,
  peerDisplayName,
  localDisplayName,
  localAvatarUri,
  peerAvatarUri,
  onCallEnd,
  onError,
}) => {
  const [token, setToken] = useState(null);
  const [meetingParticipantId, setMeetingParticipantId] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : '';
  const isPrecall = phase === 'precall';

  useEffect(() => {
    let cancelled = false;
    setTokenError(null);
    setToken(null);
    setMeetingParticipantId(undefined);
    setLoading(true);

    const applyValidatedToken = (meetingToken) => {
      const validation = validateMeetingToken(meetingToken, normalizedRoomId);
      if (!validation.ok) {
        videosdkTrace('S2_SDK', 'TOKEN_FAIL', { roomId: normalizedRoomId, error: validation.error });
        setTokenError(validation.error);
        return false;
      }
      if (validation.participantId) {
        setMeetingParticipantId(validation.participantId);
      }
      setToken(meetingToken);
      videosdkTrace('S2_SDK', 'TOKEN_OK', {
        roomId: normalizedRoomId,
        participantId: validation.participantId || null,
      });
      return true;
    };

    const fetchToken = async () => {
      try {
        if (!normalizedRoomId) {
          throw new Error('Missing VideoSDK roomId for this call.');
        }
        videosdkTrace('S2_SDK', 'TOKEN_FETCH_START', { roomId: normalizedRoomId, userId: currentUserId });

        const prefilled =
          typeof initialToken === 'string' && initialToken.trim() ? initialToken.trim() : '';
        if (prefilled) {
          if (cancelled) return;
          if (applyValidatedToken(prefilled)) {
            console.log('[CALL_TOKEN] using stashed caller token');
            return;
          }
          if (cancelled) return;
          setLoading(false);
          return;
        }

        const meetingToken = await getVideoSDKToken(normalizedRoomId, currentUserId);

        if (cancelled) return;

        if (meetingToken && applyValidatedToken(meetingToken)) {
          return;
        }

        if (!VIDEOSDK_CONFIG.tokenServerUrl) {
          if (__DEV__) {
            console.warn(
              '[VideoSDK] No JWT: tokenServerUrl empty. Using apiKey as token (dev only).'
            );
            setToken(null);
            return;
          }
          setTokenError(VIDEOSDK_TOKEN_SETUP_MESSAGE);
          return;
        }

        setTokenError(
          'Could not get a secure call token. Check that your token server is running and returns JSON { "token": "..." }.'
        );
      } catch (error) {
        if (cancelled) return;
        const msg = error?.message || 'Failed to get call token';
        console.error('Error fetching token:', error);
        setTokenError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (!VIDEOSDK_CONFIG.tokenServerUrl && !initialToken) {
      console.warn('[VideoSDK] tokenServerUrl missing at runtime');
    }

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [normalizedRoomId, currentUserId, initialToken]);

  if (loading) {
    if (isPrecall) {
      return <View style={styles.precallHost} pointerEvents="none" />;
    }
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Connecting...</Text>
        </View>
      </View>
    );
  }

  if (tokenError) {
    if (isPrecall) {
      console.warn('[CALL_PRECALL_TOKEN_ERROR]', tokenError);
      if (onError) onError(tokenError);
      return <View style={styles.precallHost} pointerEvents="none" />;
    }
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: '#FF9800', marginBottom: 12 }]}>
            Could not connect
          </Text>
          <Text style={[styles.loadingText, { fontSize: 14, color: '#999', textAlign: 'center', paddingHorizontal: 24 }]}>
            {tokenError}
          </Text>
          <TouchableOpacity
            style={[styles.endCallButton, { marginTop: 28, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24 }]}
            onPress={() => onCallEnd?.()}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const authToken = token || (__DEV__ && !VIDEOSDK_CONFIG.tokenServerUrl ? VIDEOSDK_CONFIG.apiKey : null);

  if (!authToken) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Missing call token</Text>
          <TouchableOpacity
            style={[styles.endCallButton, { marginTop: 28, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24 }]}
            onPress={() => onCallEnd?.()}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  videosdkTrace('S2_SDK', 'MEETING_PROVIDER_MOUNT', {
    meetingId: normalizedRoomId,
    mode: 'SEND_AND_RECV',
    hasToken: Boolean(authToken),
    phase,
  });

  return (
    <MeetingProvider
      key={normalizedRoomId}
      config={{
        meetingId: normalizedRoomId,
        mode: 'SEND_AND_RECV',
        ...(meetingParticipantId ? { participantId: meetingParticipantId } : {}),
        micEnabled: false,
        webcamEnabled: false,
        name: localDisplayName || currentUserId || 'User',
        debugMode: __DEV__,
        notification: {
          title: 'VideoSDK Call',
          message: 'You are in a call',
        },
      }}
      token={authToken}
    >
      <VideoSDKCallInner
        roomId={normalizedRoomId}
        currentUserId={currentUserId}
        callType={callType}
        callId={callId}
        phase={phase}
        peerDisplayName={peerDisplayName}
        localDisplayName={localDisplayName || 'You'}
        localAvatarUri={localAvatarUri}
        peerAvatarUri={peerAvatarUri}
        onCallEnd={onCallEnd}
        onError={onError}
      />
    </MeetingProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideoContainer: {
    flex: 1,
  },
  videoWaitingLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  waitingAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingAvatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: UI.text,
  },
  waitingTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    color: UI.text,
  },
  waitingSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: UI.muted,
    textAlign: 'center',
  },
  remoteVideo: {
    flex: 1,
    width: width,
    height: height,
  },
  remoteVideoPlaceholder: {
    flex: 1,
    backgroundColor: '#131820',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 56,
    color: '#e2e8f0',
    fontWeight: '700',
  },
  localVideoContainer: {
    position: 'absolute',
    right: 16,
    width: 112,
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: '#000',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  audioCallContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  audioParticipantsRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 400,
    marginBottom: 28,
  },
  audioParticipantCard: {
    alignItems: 'center',
    width: '42%',
    maxWidth: 160,
  },
  audioParticipantTitle: {
    color: UI.muted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  audioAvatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    padding: 3,
    marginBottom: 12,
    overflow: 'hidden',
  },
  audioAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  audioAvatarInner: {
    flex: 1,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioAvatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: UI.text,
  },
  audioMicOffBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0f172a',
  },
  audioParticipantName: {
    fontSize: 16,
    fontWeight: '700',
    color: UI.text,
    textAlign: 'center',
  },
  hiddenAudioSink: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -9999,
  },
  audioStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginRight: 8,
  },
  statusDotLive: {
    backgroundColor: UI.accent,
  },
  callStatus: {
    fontSize: 15,
    color: UI.muted,
    fontWeight: '500',
  },
  infoOverlay: {
    position: 'absolute',
    left: 16,
  },
  durationPill: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  durationText: {
    color: UI.text,
    fontSize: 15,
    fontWeight: '600',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 16,
    gap: 22,
    backgroundColor: 'transparent',
  },
  controlCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: UI.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  controlCircleMuted: {
    backgroundColor: 'rgba(239,68,68,0.35)',
    borderColor: 'rgba(239,68,64,0.4)',
  },
  endCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: UI.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: UI.text,
    fontSize: 16,
  },
  endCallButton: {
    backgroundColor: UI.danger,
  },
  precallHost: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
    overflow: 'hidden',
  },
  precallDevBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 10,
    color: '#22c55e',
    opacity: 0.9,
  },
});

export default VideoSDKCall;

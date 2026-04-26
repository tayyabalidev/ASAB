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
} from '@videosdk.live/react-native-sdk';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { getVideoSDKToken } from '../lib/videosdkHelper';
import { ensureCallMediaPermissions } from '../lib/videosdkMediaPermissions';
import { updateCallStatus, endCall } from '../lib/calls';
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

// Inner component that uses VideoSDK hooks
const VideoSDKCallInner = ({
  roomId,
  currentUserId,
  callType = 'video',
  callId = null,
  onCallEnd,
  onError,
  peerDisplayName = 'Participant',
}) => {
  const insets = useSafeAreaInsets();
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [callDuration, setCallDuration] = useState(0);
  /** Room joined (VideoSDK) vs peer visible — Appwrite CONNECTED only after peer is in the room */
  const [meetingJoined, setMeetingJoined] = useState(false);
  
  const durationIntervalRef = useRef(null);
  const callIdRef = useRef(callId);
  const participantsRef = useRef(new Map());
  const connectedReportedRef = useRef(false);
  const endingRef = useRef(false);
  const joinTimeoutRef = useRef(null);

  useEffect(() => {
    callIdRef.current = callId;
    connectedReportedRef.current = false;
  }, [callId]);

  const { join, leave, toggleMic, toggleWebcam, participants, localParticipant } = useMeeting({
    onMeetingJoined: () => {
      console.log('✅ Joined VideoSDK meeting successfully');
      if (joinTimeoutRef.current) {
        clearTimeout(joinTimeoutRef.current);
        joinTimeoutRef.current = null;
      }
      setMeetingJoined(true);
    },
    onMeetingLeft: () => {
      console.log('👋 Left VideoSDK meeting');
      if (!endingRef.current) {
        handleCallEnd();
      }
    },
    onError: (error) => {
      console.error('❌ VideoSDK error:', error);
      Alert.alert('Call Error', error?.message || 'An error occurred during the call');
      if (onError) onError(error);
    },
    onParticipantJoined: (participant) => {
      console.log('👤 Participant joined:', participant.id);
    },
    onParticipantLeft: (participant) => {
      console.log('👋 Participant left:', participant.id);
      setTimeout(() => {
        if (participantsRef.current.size === 0) {
          handleCallEnd();
        }
      }, 400);
    },
  });

  participantsRef.current = participants;

  // VideoSDK participant ids are not Appwrite user ids — exclude local by SDK localParticipant
  const localId = localParticipant?.id;
  const remoteParticipants = localId
    ? Array.from(participants.values()).filter((p) => p.id !== localId)
    : [];
  // Do not treat "everyone as remote" before localParticipant exists (avoids false "Connected")
  const remoteConnected = Boolean(localId) && remoteParticipants.length > 0;

  // Mark Appwrite call CONNECTED only once both sides are in the same VideoSDK room
  useEffect(() => {
    if (!remoteConnected || !callIdRef.current || connectedReportedRef.current) return;
    connectedReportedRef.current = true;
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

  useEffect(() => {
    if (meetingJoined && remoteConnected) return;
    if (meetingJoined && !remoteConnected) {
      const t = setTimeout(() => {
        if (!endingRef.current && participantsRef.current.size <= 1) {
          handleCallEnd();
        }
      }, 3500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [meetingJoined, remoteConnected]);

  useEffect(() => {
    // Join meeting when component mounts
    let cancelled = false;
    const joinMeeting = async () => {
      try {
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

        joinTimeoutRef.current = setTimeout(() => {
          if (!cancelled && !meetingJoined && !endingRef.current) {
            const timeoutError = new Error('Joining room timed out. Check token, roomId, or network.');
            if (onError) onError(timeoutError);
          }
        }, 45000);

        await join();
      } catch (error) {
        if (cancelled || endingRef.current) return;
        console.error('Error joining VideoSDK meeting:', error);
        Alert.alert('Error', 'Failed to join call. Please try again.');
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
  }, [roomId, join, callType, onError]);

  const handleCallEnd = async () => {
    if (endingRef.current) return;
    endingRef.current = true;
    connectedReportedRef.current = false;
    setMeetingJoined(false);
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    try {
      if (callIdRef.current) {
        await endCall(callIdRef.current, currentUserId);
      }
    } catch (e) {
      console.warn('Error updating call status:', e);
    }
    try {
      await leave();
    } catch (e) {
      console.warn('Error leaving meeting:', e);
    }
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
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      if (!endingRef.current) {
        endingRef.current = true;
        try {
          leave();
        } catch (_) {}
      }
    };
  }, [leave]);

  const toggleMute = async () => {
    try {
      await toggleMic();
      setIsMuted(prev => !prev);
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  const toggleVideo = async () => {
    if (callType !== 'video') return;

    try {
      await toggleWebcam();
      setIsVideoEnabled(prev => !prev);
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const remoteLabel =
    remoteParticipants[0]?.displayName || peerDisplayName || 'Participant';
  const remoteInitial = (remoteLabel.charAt(0) || 'P').toUpperCase();
  const voiceAccent = callType === 'audio' ? UI.accentVoice : UI.accent;

  const audioStatusText = !meetingJoined
    ? 'Joining call…'
    : remoteConnected
      ? 'Connected'
      : `Waiting for ${peerDisplayName || 'participant'}…`;

  const controlsBottom = Math.max(insets.bottom, 20) + 16;

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
          <View style={[styles.audioAvatarRing, { borderColor: UI.accentVoice + '66' }]}>
            <LinearGradient colors={['#312e81', '#1e1b4b']} style={styles.audioAvatarInner}>
              <Text style={styles.audioAvatarText}>{remoteInitial}</Text>
            </LinearGradient>
          </View>
          <Text style={styles.audioName}>{remoteLabel}</Text>
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
  peerDisplayName,
  onCallEnd,
  onError,
}) => {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const normalizedRoomId = typeof roomId === 'string' ? roomId.trim() : '';

  useEffect(() => {
    let cancelled = false;
    setTokenError(null);
    setToken(null);
    setLoading(true);

    const fetchToken = async () => {
      try {
        if (!normalizedRoomId) {
          throw new Error('Missing VideoSDK roomId for this call.');
        }
        const meetingToken = await getVideoSDKToken(normalizedRoomId, currentUserId);

        if (cancelled) return;

        if (meetingToken) {
          setToken(meetingToken);
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
        // Keep user on call UI with inline error; do not replace whole screen via parent onError
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchToken();
    return () => {
      cancelled = true;
    };
  }, [normalizedRoomId, currentUserId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Connecting...</Text>
        </View>
      </View>
    );
  }

  if (tokenError) {
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

  return (
    <MeetingProvider
      config={{
        // VideoSDK SDK expects the key "meetingId", sourced from roomId.
        meetingId: normalizedRoomId,
        participantId: currentUserId || undefined,
        micEnabled: VIDEOSDK_CONFIG.meetingSettings.micEnabled,
        webcamEnabled: callType === 'video' && VIDEOSDK_CONFIG.meetingSettings.webcamEnabled,
        name: currentUserId || 'User',
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
        peerDisplayName={peerDisplayName}
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
    paddingHorizontal: 24,
  },
  audioAvatarRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    padding: 4,
    marginBottom: 28,
  },
  audioAvatarInner: {
    flex: 1,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioAvatarText: {
    fontSize: 52,
    fontWeight: '700',
    color: UI.text,
  },
  audioName: {
    fontSize: 24,
    fontWeight: '700',
    color: UI.text,
    textAlign: 'center',
    marginBottom: 12,
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
});

export default VideoSDKCall;

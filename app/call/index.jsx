/**
 * Call Screen — incoming / outgoing ring UI and VideoSDK handoff
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  StatusBar,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useGlobalContext } from '../../context/GlobalProvider';
import {
  createCall,
  acceptCall,
  rejectCall,
  getCallById,
  subscribeCallUpdates,
} from '../../lib/calls';
import { CallState } from '../../lib/callHelper';
import VideoSDKCallWrapper from '../../components/VideoSDKCallWrapper';

const COLORS = {
  bg0: '#0c1222',
  bg1: '#151b2e',
  bg2: '#1a2238',
  accentVideo: '#34d399',
  accentVoice: '#818cf8',
  danger: '#ef4444',
  success: '#22c55e',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  glass: 'rgba(255,255,255,0.08)',
};

function peerInitial(callData, isIncoming, userId) {
  if (!callData) return '?';
  if (isIncoming) {
    const n = callData.callerUsername || callData.callerId || '';
    return (n.charAt(0) || '?').toUpperCase();
  }
  const other = callData.receiverId === userId ? callData.callerId : callData.receiverId;
  return (other?.charAt(0) || '?').toUpperCase();
}

function peerDisplayName(callData, isIncoming) {
  if (!callData) return 'Contact';
  if (isIncoming) {
    return callData.callerUsername || 'Someone';
  }
  return callData.receiverUsername || callData.receiverName || 'Your contact';
}

const CallScreen = () => {
  const params = useLocalSearchParams();
  const { user } = useGlobalContext();

  const [callState, setCallState] = useState('idle');
  const [callData, setCallData] = useState(null);
  const [callType, setCallType] = useState('video');
  const [isIncoming, setIsIncoming] = useState(false);
  const [error, setError] = useState(null);

  const pulse = useRef(new Animated.Value(1)).current;
  const ringOpacity = useRef(new Animated.Value(0.35)).current;

  const unsubscribeRef = useRef(null);
  const isInitializedRef = useRef(false);
  const paramsRef = useRef(params);

  useEffect(() => {
    const paramsChanged = JSON.stringify(paramsRef.current) !== JSON.stringify(params);
    if (paramsChanged) {
      paramsRef.current = params;
      isInitializedRef.current = false;
    }
  }, [params]);

  useEffect(() => {
    if (callState !== 'calling' || isIncoming) return;
    const scaleLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulse, {
            toValue: 1.08,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.08,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.35,
            duration: 1400,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    scaleLoop.start();
    return () => scaleLoop.stop();
  }, [callState, isIncoming, pulse, ringOpacity]);

  useEffect(() => {
    if (!user || !user.$id) {
      return;
    }
    if (isInitializedRef.current) {
      return;
    }
    isInitializedRef.current = true;
    initializeCall();

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, [user?.$id, params.callId, params.receiverId, params.callType]);

  const initializeCall = async () => {
    try {
      setError(null);

      if (params.callId) {
        const call = await getCallById(params.callId);
        if (call) {
          setCallData(call);
          setIsIncoming(true);
          setCallType(call.callType || 'video');

          if (call.receiverId === user.$id) {
            if (call.status === CallState.CALLING) {
              setCallState('ringing');
            } else if (call.status === CallState.CONNECTING || call.status === CallState.CONNECTED) {
              setCallState('connecting');
            } else {
              setCallState('ended');
              setTimeout(() => router.back(), 500);
              return;
            }

            if (unsubscribeRef.current) unsubscribeRef.current();
            unsubscribeRef.current = subscribeCallUpdates(call.$id, ({ payload }) => {
              if (payload.status === CallState.ENDED || payload.status === CallState.REJECTED) {
                handleCallEnd();
              } else if (payload.status === CallState.CONNECTING || payload.status === CallState.CONNECTED) {
                setCallState('connecting');
              }
            });
          } else {
            if (call.status === CallState.REJECTED || call.status === CallState.ENDED) {
              handleCallEnd();
              return;
            } else if (call.status === CallState.CONNECTING || call.status === CallState.CONNECTED) {
              setCallState('connecting');
            } else {
              setCallState('calling');
            }

            if (unsubscribeRef.current) unsubscribeRef.current();
            unsubscribeRef.current = subscribeCallUpdates(call.$id, ({ payload }) => {
              if (payload.status === CallState.REJECTED) {
                Alert.alert('Call declined', 'The other person declined the call.');
                handleCallEnd();
              } else if (payload.status === CallState.ENDED) {
                handleCallEnd();
              } else if (payload.status === CallState.CONNECTING || payload.status === CallState.CONNECTED) {
                setCallState('connecting');
                setCallData(payload);
              }
            });
          }
        } else {
          setError('Call not found');
        }
      } else if (params.receiverId && params.callType) {
        setIsIncoming(false);
        setCallType(params.callType);
        setCallState('calling');
        await initiateCall(params.receiverId, params.callType);
      } else {
        setError('Invalid call parameters');
      }
    } catch (err) {
      console.error('Error initializing call:', err);
      setError(err.message || 'Failed to initialize call');
    }
  };

  const initiateCall = async (receiverId, type) => {
    try {
      const call = await createCall(user.$id, receiverId, type, user.username);
      setCallData(call);

      if (unsubscribeRef.current) unsubscribeRef.current();
      unsubscribeRef.current = subscribeCallUpdates(call.$id, ({ payload }) => {
        if (payload.status === CallState.REJECTED) {
          Alert.alert('Call declined', 'The other person declined the call.');
          handleCallEnd();
        } else if (payload.status === CallState.ENDED) {
          handleCallEnd();
        } else if (payload.status === CallState.CONNECTING || payload.status === CallState.CONNECTED) {
          setCallState('connecting');
          setCallData(payload);
        }
      });
    } catch (err) {
      console.error('Error initiating call:', err);
      setError(err.message || 'Failed to start call');
      setCallState('idle');
    }
  };

  const handleAcceptCall = async () => {
    try {
      if (!callData) return;
      setCallState('connecting');
      await acceptCall(callData.$id, user.$id);
      const updatedCall = await getCallById(callData.$id);
      setCallData(updatedCall);
      setCallState('connecting');
    } catch (err) {
      console.error('Error accepting call:', err);
      setError('Could not accept the call');
      handleCallEnd();
    }
  };

  const handleRejectCall = async () => {
    try {
      if (!callData) return;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      await rejectCall(callData.$id, user.$id);
      handleCallEnd();
    } catch (err) {
      console.error('Error rejecting call:', err);
      handleCallEnd();
    }
  };

  const handleCallEnd = () => {
    try {
      if (unsubscribeRef.current) {
        try {
          unsubscribeRef.current();
        } catch (e) {
          console.warn('Error unsubscribing:', e);
        }
        unsubscribeRef.current = null;
      }
      setCallState('ended');
      setTimeout(() => {
        try {
          router?.back?.();
        } catch (e) {
          console.warn('Navigate back failed:', e);
        }
      }, 280);
    } catch (e) {
      console.error('handleCallEnd:', e);
      try {
        router?.back?.();
      } catch (_) {}
    }
  };

  const handleCallError = (err) => {
    try {
      let errorMessage = 'Something went wrong with the call';
      if (typeof err === 'string') {
        errorMessage = err.includes('PERMISSION')
          ? 'Microphone or camera access is required. Enable it in Settings.'
          : err;
      } else if (err?.message) {
        errorMessage = err.message;
      }
      setError(errorMessage);
    } catch (_) {
      setError('Call error');
    }
  };

  const accent = callType === 'video' ? COLORS.accentVideo : COLORS.accentVoice;
  const isVideo = callType === 'video';

  const renderShell = (children) => (
    <LinearGradient colors={[COLORS.bg0, COLORS.bg1, COLORS.bg2]} style={styles.gradient} start={{ x: 0.2, y: 0 }} end={{ x: 0.9, y: 1 }}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {children}
      </SafeAreaView>
    </LinearGradient>
  );

  if (error) {
    return renderShell(
      <View style={styles.centerBlock}>
        <View style={styles.errorIconWrap}>
          <Feather name="alert-circle" size={40} color={COLORS.danger} />
        </View>
        <Text style={styles.errorTitle}>Unable to continue</Text>
        <Text style={styles.errorBody}>{error}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Text style={styles.primaryBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (callState === 'calling' || callState === 'ringing') {
    const title =
      callState === 'ringing'
        ? peerDisplayName(callData, true)
        : 'Calling…';
    const subtitle =
      callState === 'ringing'
        ? `Incoming ${isVideo ? 'video' : 'voice'} call`
        : `Outgoing ${isVideo ? 'video' : 'voice'} call`;
    const initial = peerInitial(callData, isIncoming, user?.$id);

    return renderShell(
      <View style={styles.ringRoot}>
        <View style={styles.ringTopBar}>
          <TouchableOpacity onPress={handleCallEnd} hitSlop={12} style={styles.iconHit}>
            <Feather name="chevron-down" size={28} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.ringCenter}>
          <View style={styles.avatarStage}>
            <Animated.View
              style={[
                styles.pulseRing,
                { backgroundColor: accent },
                {
                  opacity: ringOpacity,
                  transform: [{ scale: pulse }],
                },
              ]}
            />
            <View style={[styles.avatarOuter, { borderColor: accent }]}>
              <LinearGradient colors={['#2d3a52', '#1e293b']} style={styles.avatarInner}>
                <Text style={styles.avatarLetter}>{initial}</Text>
              </LinearGradient>
            </View>
          </View>

          <Text style={styles.ringTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.ringSubtitle}>{subtitle}</Text>

          <View style={[styles.modePill, { borderColor: accent + '55' }]}>
            <Feather name={isVideo ? 'video' : 'phone'} size={16} color={accent} />
            <Text style={[styles.modePillText, { color: accent }]}>
              {isVideo ? 'Video' : 'Voice'}
            </Text>
          </View>

          {callState === 'calling' && !isIncoming && (
            <Text style={styles.hintMuted}>Ringing on their device…</Text>
          )}

          {isIncoming && callState === 'ringing' && (
            <View style={styles.incomingActions}>
              <View style={styles.actionCol}>
                <TouchableOpacity
                  style={[styles.roundAction, styles.roundDecline]}
                  onPress={handleRejectCall}
                  activeOpacity={0.88}
                >
                  <Feather name="phone-off" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Decline</Text>
              </View>
              <View style={styles.actionCol}>
                <TouchableOpacity
                  style={[styles.roundAction, styles.roundAccept]}
                  onPress={handleAcceptCall}
                  activeOpacity={0.88}
                >
                  <Feather name="phone" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.actionLabel}>Accept</Text>
              </View>
            </View>
          )}

          {!isIncoming && callState === 'calling' && (
            <TouchableOpacity style={styles.cancelCallBtn} onPress={handleCallEnd} activeOpacity={0.88}>
              <Feather name="phone-off" size={22} color="#fff" />
              <Text style={styles.cancelCallBtnText}>Cancel call</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (callState === 'connected' || callState === 'connecting') {
    if (!callData) {
      return renderShell(
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.connectingTitle}>Connecting</Text>
          <Text style={styles.connectingHint}>Securing your line…</Text>
        </View>
      );
    }

    if (!callData.channelName && !callData.roomName) {
      return renderShell(
        <View style={styles.centerBlock}>
          <Feather name="wifi-off" size={40} color={COLORS.textMuted} />
          <Text style={styles.errorTitle}>Configuration issue</Text>
          <Text style={styles.errorBody}>This call is missing room data. Please try again.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCallEnd}>
            <Text style={styles.primaryBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const roomId = callData.channelName || callData.roomName;
    const receiverId = callData.receiverId === user.$id ? callData.callerId : callData.receiverId;

    if (!roomId) {
      return renderShell(
        <View style={styles.centerBlock}>
          <Text style={styles.errorTitle}>Missing meeting</Text>
          <Text style={styles.errorBody}>Could not join this call. Please try again.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCallEnd}>
            <Text style={styles.primaryBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const peerName = peerDisplayName(callData, isIncoming);

    return (
      <VideoSDKCallWrapper
        roomId={roomId}
        callerId={callData.callerId}
        receiverId={receiverId}
        currentUserId={user.$id}
        callType={callType}
        callId={callData.$id}
        peerDisplayName={peerName}
        onCallEnd={handleCallEnd}
        onError={handleCallError}
      />
    );
  }

  if (!user || !user.$id) {
    return renderShell(
      <View style={styles.centerBlock}>
        <ActivityIndicator size="large" color={accent} />
        <Text style={styles.connectingHint}>Preparing…</Text>
      </View>
    );
  }

  if (callState === 'idle') {
    if (params.receiverId && params.callType) {
      const idleVideo = params.callType === 'video';
      const idleAccent = idleVideo ? COLORS.accentVideo : COLORS.accentVoice;
      return renderShell(
        <View style={styles.ringRoot}>
          <View style={styles.ringCenter}>
            <ActivityIndicator size="large" color={idleAccent} style={{ marginBottom: 24 }} />
            <Text style={styles.ringTitle}>Starting call…</Text>
            <Text style={styles.ringSubtitle}>
              {idleVideo ? 'Video' : 'Voice'} call
            </Text>
            <TouchableOpacity style={styles.cancelCallBtn} onPress={handleCallEnd}>
              <Feather name="x" size={22} color="#fff" />
              <Text style={styles.cancelCallBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    if (params.callId) {
      return renderShell(
        <View style={styles.centerBlock}>
          <ActivityIndicator size="large" color={COLORS.accentVideo} />
          <Text style={styles.connectingHint}>Loading call…</Text>
        </View>
      );
    }
  }

  return renderShell(
    <View style={styles.centerBlock}>
      <ActivityIndicator size="large" color={COLORS.textMuted} />
      <TouchableOpacity style={[styles.primaryBtn, { marginTop: 28 }]} onPress={() => router.back()}>
        <Text style={styles.primaryBtnText}>Go back</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safe: {
    flex: 1,
  },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  ringRoot: {
    flex: 1,
  },
  ringTopBar: {
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  iconHit: {
    padding: 8,
    alignSelf: 'flex-start',
  },
  ringCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  avatarStage: {
    width: 200,
    height: 200,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  pulseRing: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  avatarOuter: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 48,
    fontWeight: '700',
    color: COLORS.text,
  },
  ringTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  ringSubtitle: {
    fontSize: 16,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 20,
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: COLORS.glass,
    marginBottom: 16,
  },
  modePillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  hintMuted: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
  },
  incomingActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 48,
    width: '100%',
    maxWidth: 320,
  },
  actionCol: {
    alignItems: 'center',
    marginHorizontal: 36,
  },
  roundAction: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
    }),
  },
  roundDecline: {
    backgroundColor: COLORS.danger,
  },
  roundAccept: {
    backgroundColor: COLORS.success,
  },
  actionLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  cancelCallBtn: {
    marginTop: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
  },
  cancelCallBtnText: {
    color: '#fecaca',
    fontSize: 16,
    fontWeight: '600',
  },
  connectingTitle: {
    marginTop: 20,
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  connectingHint: {
    marginTop: 8,
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  errorIconWrap: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  errorBody: {
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: COLORS.glass,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  primaryBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '600',
  },
});

export default CallScreen;

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeetingProvider, useMeeting, RTCView } from '@videosdk.live/react-native-sdk';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { ensureCallMediaPermissions } from '../lib/videosdkMediaPermissions';
import { endLiveStream } from '../lib/livestream';

const { width, height } = Dimensions.get('window');
const TOKEN_ENDPOINT_HINT = `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}${
  VIDEOSDK_CONFIG.tokenPath || ''
}`;

function decodeJwtPayload(token) {
  try {
    const payloadPart = String(token || '').split('.')[1] || '';
    if (!payloadPart) return null;
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch (_) {
    return null;
  }
}

function LocalPreview({ liveMode }) {
  const { localWebcamOn, localWebcamStream } = useMeeting();

  if (liveMode === 'screen') {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>Screen sharing live…</Text>
      </View>
    );
  }

  if (!localWebcamOn || !localWebcamStream) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.placeholderText}>Camera starting…</Text>
      </View>
    );
  }

  return (
    <RTCView
      streamURL={localWebcamStream.toURL()}
      style={styles.video}
      objectFit="cover"
      mirror
      zOrder={0}
    />
  );
}

function BroadcasterMeetingInner({
  streamId,
  quality,
  liveMode,
  onStreamEnd,
  hlsStartedRef,
  tokenDebug,
  roomDebug,
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState('joining');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastSdkState, setLastSdkState] = useState('INIT');
  const endedRef = useRef(false);
  const actionsRef = useRef({});
  const hlsStartTriggeredRef = useRef(false);
  const hlsStartTimerRef = useRef(null);
  const joinOnceRef = useRef(false);

  useEffect(() => {
    if (__DEV__) {
      console.log('[LiveBroadcast] init', {
        streamId,
        roomId: roomDebug || null,
        liveMode,
        quality,
      });
    }
  }, [streamId, roomDebug, liveMode, quality]);

  const stopMeeting = useCallback(() => {
    const act = actionsRef.current;
    try {
      if (hlsStartedRef.current) {
        act.stopHls?.();
      }
    } catch (_) {}
    try {
      act.leave?.();
    } catch (_) {}
  }, [hlsStartedRef]);

  const finalizeEnd = useCallback(
    async (notifyUi) => {
      if (endedRef.current) return;
      endedRef.current = true;
      stopMeeting();
      hlsStartedRef.current = false;
      try {
        await endLiveStream(streamId);
      } catch (e) {
        console.warn('endLiveStream', e);
      }
      if (notifyUi) {
        onStreamEnd?.();
      }
    },
    [streamId, stopMeeting, onStreamEnd, hlsStartedRef]
  );

  const {
    join,
    leave,
    startHls,
    stopHls,
    enableWebcam,
    startScreenShare,
    enableScreenShare,
  } = useMeeting({
    onMeetingJoined: () => {
      console.log('✅ JOINED');
    },
    onHlsStarted: () => {
      console.log('🔥 HLS STARTED');
      if (endedRef.current) return;
      hlsStartedRef.current = true;
      setPhase('live');
    },
    onHlsStateChanged: (data) => {
      if (!data || endedRef.current) return;
      const statusText = String(data?.status || '');
      console.log('📡 HLS STATE:', data?.status);
      setLastSdkState(statusText);
      if (statusText === 'HLS_STARTED' || statusText === 'HLS_PLAYABLE') {
        hlsStartedRef.current = true;
        setPhase('live');
      }
      if (statusText.includes('FAILED')) {
        setErrorMessage('HLS failed to start');
        setPhase('error');
      }
    },
    onMeetingStateChanged: (state) => {
      if (!state) return;
      const stateText =
        typeof state === 'string'
          ? state
          : state?.status || state?.state;
      console.log('📡 MEETING STATE:', stateText);
      setLastSdkState(stateText);
      if (stateText === 'CONNECTED' && !hlsStartTriggeredRef.current) {
        hlsStartTriggeredRef.current = true;
        console.log('🎯 NOW SAFE TO START HLS');
        hlsStartTimerRef.current = setTimeout(async () => {
          if (endedRef.current) return;
          try {
            if (liveMode === 'screen') {
              const startScreen =
                (typeof startScreenShare === 'function' && startScreenShare) ||
                (typeof enableScreenShare === 'function' && enableScreenShare);
              if (!startScreen) {
                throw new Error('Screen share is not available in this build');
              }
              await Promise.resolve(startScreen());
            } else {
              enableWebcam();
            }
            await new Promise((r) => setTimeout(r, 1000));
            console.log('🚀 Starting HLS...');
            startHls({
              layout: {
                type: 'SPOTLIGHT',
                priority: 'PIN',
              },
              theme: 'DARK',
              mode: 'video-and-audio',
            });
          } catch (err) {
            console.error('❌ HLS START ERROR:', err);
            setErrorMessage(err?.message || 'HLS start error');
            setPhase('error');
          }
        }, 2000);
      }
      if (stateText === 'CLOSED') {
        if (hlsStartTimerRef.current) {
          clearTimeout(hlsStartTimerRef.current);
          hlsStartTimerRef.current = null;
        }
        setErrorMessage('Meeting closed by SDK');
        setPhase('error');
      }
    },
    onError: (err) => {
      if (hlsStartTimerRef.current) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
      console.error('❌ SDK ERROR:', err);
      setErrorMessage(err?.message || 'Meeting error');
      setPhase('error');
    },
  });

  actionsRef.current.stopHls = stopHls;
  actionsRef.current.leave = leave;
  actionsRef.current.join = join;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (joinOnceRef.current) return;
      joinOnceRef.current = true;
      const ok = await ensureCallMediaPermissions(liveMode === 'screen' ? 'audio' : 'video');
      if (cancelled) return;
      if (!ok) {
        Alert.alert(
          'Permissions required',
          liveMode === 'screen'
            ? 'Microphone permission is required for screen live streaming.'
            : 'Camera and microphone permissions are required for camera live streaming.'
        );
        return;
      }
      try {
        console.log('📞 Joining meeting...');
        await actionsRef.current.join?.();
      } catch (e) {
        if (!cancelled) {
          console.error('❌ JOIN FAILED:', e);
          setErrorMessage('Failed to join meeting');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (hlsStartTimerRef.current) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
      try {
        if (hlsStartedRef.current) stopHls();
        actionsRef.current.leave?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (phase !== 'joining') return undefined;
    const t = setTimeout(() => {
      if (endedRef.current) return;
      setErrorMessage(
        `Stream is taking too long (SDK state: ${lastSdkState}). Confirm VideoSDK interactive HLS is enabled, your JWT token URL works, and the device has a stable connection.`
      );
      setPhase((current) => (current === 'joining' ? 'error' : current));
    }, 75000);
    return () => clearTimeout(t);
  }, [phase, lastSdkState]);

  const handleEndPress = () => {
    finalizeEnd(true);
  };

  if (phase === 'error' && errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{errorMessage}</Text>
        <TouchableOpacity style={styles.endBtn} onPress={handleEndPress}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LocalPreview liveMode={liveMode} />
      {__DEV__ ? (
        <View style={styles.devPanel}>
          <Text style={styles.devPanelText}>phase: {phase}</Text>
          <Text style={styles.devPanelText}>sdk: {lastSdkState || 'n/a'}</Text>
          <Text style={styles.devPanelText}>mode: {liveMode}</Text>
          <Text style={styles.devPanelText}>{tokenDebug}</Text>
        </View>
      ) : null}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.livePill, phase !== 'live' && styles.connectingPill]}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>{phase === 'live' ? 'LIVE' : 'CONNECTING'}</Text>
        </View>
      </View>
      {phase === 'joining' && (
        <View style={styles.banner}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.bannerText}> Starting stream…</Text>
        </View>
      )}
      <View style={styles.statePanel}>
        <Text style={styles.statePanelText}>phase: {phase}</Text>
        <Text style={styles.statePanelText}>sdk: {lastSdkState || 'n/a'}</Text>
        <Text style={styles.statePanelText}>room: {roomDebug || 'n/a'}</Text>
      </View>
      <TouchableOpacity
        style={[styles.endStream, { bottom: Math.max(insets.bottom, 16) + 16 }]}
        onPress={handleEndPress}
      >
        <Text style={styles.endStreamText}>End stream</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LiveStreamBroadcasterImpl({
  streamId,
  roomId,
  initialToken,
  hostUserId,
  hostDisplayName,
  quality = 'auto',
  liveMode = 'camera',
  onStreamEnd,
}) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const [tokenDebug, setTokenDebug] = useState('token: n/a');
  const [tokenParticipantId, setTokenParticipantId] = useState(null);
  const hlsStartedRef = useRef(false);
  // Host must always join using the real VideoSDK room id (not Appwrite stream id).
  const effectiveRoomId = typeof roomId === 'string' ? roomId.trim() : '';
  const effectiveParticipantId =
    (typeof tokenParticipantId === 'string' && tokenParticipantId.trim()) ||
    hostUserId ||
    `${hostUserId || 'host'}-${streamId || Date.now()}`;

  useEffect(() => {
    let cancelled = false;
    setTokenError(null);
    setToken(null);
    setTokenParticipantId(null);
    setLoading(true);
    (async () => {
      try {
        if (!effectiveRoomId) {
          throw new Error(
            `Missing videosdkRoomId for host broadcast. streamId=${streamId || 'n/a'}, roomId=${
              roomId || 'n/a'
            }.`
          );
        }
        const t = typeof initialToken === 'string' ? initialToken.trim() : '';
        if (!t) {
          throw new Error(
            'Missing host token from create-room-and-token response. Ensure backend returns both meetingId and token in one call.'
          );
        }
        if (cancelled) return;
        if (t) {
          try {
            const claims = decodeJwtPayload(t);
            if (claims) {
              console.log('TOKEN ROOM ID:', claims?.roomId);
              console.log('JOINING ROOM ID:', effectiveRoomId);
              if (claims?.participantId) {
                setTokenParticipantId(String(claims.participantId));
              }
              const perms = Array.isArray(claims?.permissions) ? claims.permissions : [];
              const tokenRoomId = claims?.roomId ? String(claims.roomId) : '';
              const expectedRoomId = String(effectiveRoomId || '');

              if (tokenRoomId && expectedRoomId && tokenRoomId !== expectedRoomId) {
                setTokenError(
                  `VideoSDK token room mismatch: token=${tokenRoomId}, expected=${expectedRoomId}.`
                );
                setLoading(false);
                return;
              }
              if (!perms.includes('allow_join')) {
                setTokenError('VideoSDK token missing allow_join permission.');
                setLoading(false);
                return;
              }
              if (!perms.includes('allow_mod')) {
                setTokenError(
                  'VideoSDK host token missing allow_mod permission. Live (HLS) start requires allow_mod.'
                );
                setLoading(false);
                return;
              }

              setTokenDebug(
                `key:${claims?.apikey || 'n/a'} perms:${Array.isArray(perms) ? perms.join('|') : 'n/a'}`
              );
              if (__DEV__) {
                console.log('[LiveBroadcast] token-room check', {
                  streamId: streamId || null,
                  routeRoomId: roomId || null,
                  meetingId: effectiveRoomId || null,
                  tokenRoomId: tokenRoomId || null,
                  apikey: claims?.apikey || null,
                  permissions: perms,
                });
              }
            }
            if (__DEV__ && claims) {
              console.log('[LiveBroadcast] token claims', {
                apikey: claims?.apikey || null,
                roomId: claims?.roomId || null,
                participantId: claims?.participantId || null,
                permissions: claims?.permissions || null,
                roles: claims?.roles || null,
              });
            }
          } catch (decodeError) {
            if (__DEV__) {
              console.warn('[LiveBroadcast] token decode failed', decodeError);
            }
          }
          setToken(t);
          return;
        }
        setTokenError(VIDEOSDK_TOKEN_SETUP_MESSAGE);
        return;
      } catch (e) {
        if (!cancelled) setTokenError(e?.message || 'Token error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, hostUserId, initialToken, roomId, streamId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#a77df8" style={{ flex: 1 }} />
      </View>
    );
  }

  if (tokenError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{tokenError}</Text>
        <Text style={styles.sub}>
          Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL and EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH correctly, then
          rebuild a native dev client.
          VideoSDK does not run in Expo Go.
        </Text>
        <Text style={styles.sub}>{TOKEN_ENDPOINT_HINT}</Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => onStreamEnd?.()}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const authToken = token;

  if (!authToken) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Missing VideoSDK token</Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => onStreamEnd?.()}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!hostUserId || !effectiveRoomId) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Missing host or videosdkRoomId</Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => onStreamEnd?.()}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <MeetingProvider
      config={{
        meetingId: effectiveRoomId,
        participantId: effectiveParticipantId,
        micEnabled: true,
        webcamEnabled: liveMode !== 'screen',
        name: hostDisplayName || hostUserId || 'Host',
        mode: 'CONFERENCE',
        defaultCamera: 'front',
        notification: {
          title: 'ASAB Live',
          message: 'You are broadcasting',
        },
      }}
      token={authToken}
    >
      <BroadcasterMeetingInner
        streamId={streamId}
        quality={quality}
        liveMode={liveMode}
        onStreamEnd={onStreamEnd}
        hlsStartedRef={hlsStartedRef}
        tokenDebug={tokenDebug}
        roomDebug={effectiveRoomId}
      />
    </MeetingProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width,
    height,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  placeholderText: {
    color: '#aaa',
    marginTop: 12,
    fontSize: 15,
  },
  topBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 71, 87, 0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  connectingPill: {
    backgroundColor: 'rgba(80, 80, 90, 0.95)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  liveText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },
  banner: {
    position: 'absolute',
    bottom: 120,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  bannerText: {
    color: '#fff',
    marginLeft: 10,
    fontSize: 15,
  },
  statePanel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 96,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  statePanelText: {
    color: '#b9f6ff',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  devPanel: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 30,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderColor: 'rgba(255,255,255,0.25)',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  devPanelText: {
    color: '#8df2ff',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  endStream: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: '#F44336',
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 28,
  },
  endStreamText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  err: {
    color: '#ff9800',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  sub: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  endBtn: {
    backgroundColor: '#F44336',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  endBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

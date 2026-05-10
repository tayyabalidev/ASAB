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

function buildHealthUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return '';
  const joiner = raw.includes('?') ? '&' : '?';
  return `${raw}${joiner}health=1&debug=1`;
}

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
  tokenParticipantId,
  hostUserId,
  meetingParticipantId,
  roomDebug,
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState('joining');
  const [errorMessage, setErrorMessage] = useState(null);
  const [errorDetail, setErrorDetail] = useState(null);
  const [lastSdkState, setLastSdkState] = useState('INIT');
  const [debugLines, setDebugLines] = useState([]);
  const endedRef = useRef(false);
  const actionsRef = useRef({});
  const hlsStartTriggeredRef = useRef(false);
  const hlsStartTimerRef = useRef(null);
  const joinOnceRef = useRef(false);
  const sessionIdRef = useRef(`LS-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  const hlsStartAttemptRef = useRef(0);
  const cameraReadyRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const connectedOnceRef = useRef(false);

  const stringifyValue = useCallback((value) => {
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }, []);

  const pushDebugLine = useCallback(
    (label, value) => {
      const line = `${new Date().toISOString()} [${sessionIdRef.current}] ${label}: ${stringifyValue(value)}`;
      setDebugLines((prev) => [line, ...prev].slice(0, 40));
    },
    [stringifyValue]
  );

  const logEvent = useCallback(
    (label, value) => {
      const payload = value == null ? '' : stringifyValue(value);
      console.log(`[LiveBroadcast][${sessionIdRef.current}] ${label}`, payload);
      pushDebugLine(label, value == null ? '' : value);
    },
    [pushDebugLine, stringifyValue]
  );

  useEffect(() => {
    logEvent('INIT', {
      streamId,
      roomId: roomDebug || null,
      liveMode,
      quality,
    });
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
    localWebcamOn,
    localWebcamStream,
  } = useMeeting({
    onMeetingJoined: () => {
      logEvent('MEETING_JOINED');
    },
    onHlsStarted: () => {
      logEvent('HLS_STARTED');
      if (endedRef.current) return;
      hlsStartedRef.current = true;
      setPhase('live');
    },
    onHlsStateChanged: (data) => {
      if (!data || endedRef.current) return;
      const statusText = String(data?.status || '');
      logEvent('HLS_STATE', data);
      setLastSdkState(statusText);
      if (statusText === 'HLS_STARTED' || statusText === 'HLS_PLAYABLE') {
        hlsStartedRef.current = true;
        setPhase('live');
      }
      if (statusText.includes('FAILED')) {
        setErrorMessage('HLS failed to start');
        setErrorDetail(
          data?.message || data?.error || data?.reason || JSON.stringify(data || {})
        );
        setPhase('error');
      }
    },
    onMeetingStateChanged: (state) => {
      if (!state) return;
      const stateText =
        typeof state === 'string'
          ? state
          : state?.status || state?.state;
      const stateReason =
        (typeof state === 'object' &&
          (state?.message || state?.reason || state?.error || state?.errorMessage)) ||
        null;
      logEvent('MEETING_STATE', state);
      setLastSdkState(stateText);
      if (stateText === 'CONNECTED' && !hlsStartTriggeredRef.current) {
        connectedOnceRef.current = true;
        reconnectAttemptsRef.current = 0;
        hlsStartTriggeredRef.current = true;
        hlsStartAttemptRef.current += 1;
        logEvent('CONNECTED_READY_FOR_HLS', {
          attempt: hlsStartAttemptRef.current,
          liveMode,
        });
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
              await Promise.resolve(enableWebcam?.());
              const waitStart = Date.now();
              while (Date.now() - waitStart < 8000) {
                if (cameraReadyRef.current || endedRef.current) break;
                await new Promise((resolve) => setTimeout(resolve, 200));
              }
              logEvent('WEBCAM_READY_CHECK', {
                cameraReady: cameraReadyRef.current,
                waitedMs: Date.now() - waitStart,
              });
            }
            logEvent('ACTION_START_HLS', {
              attempt: hlsStartAttemptRef.current,
              liveMode,
            });
            startHls({
              layout: {
                type: 'SPOTLIGHT',
                priority: 'PIN',
              },
              theme: 'DARK',
              mode: 'video-and-audio',
            });
          } catch (err) {
            logEvent('HLS_START_ERROR', err);
            setErrorMessage(err?.message || 'HLS start error');
            setPhase('error');
          }
        }, 250);
      }
      if (stateText === 'DISCONNECTED' && !endedRef.current) {
        const nextAttempt = reconnectAttemptsRef.current + 1;
        if (nextAttempt <= 3) {
          reconnectAttemptsRef.current = nextAttempt;
          const waitMs = nextAttempt * 1200;
          logEvent('DISCONNECTED_RETRY_SCHEDULED', {
            attempt: nextAttempt,
            waitMs,
            connectedOnce: connectedOnceRef.current,
          });
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          reconnectTimerRef.current = setTimeout(() => {
            if (endedRef.current) return;
            (async () => {
              try {
                // Each join() calls initMeeting(); without leave(), retries leave a broken socket/session.
                logEvent('DISCONNECTED_RETRY_LEAVE', { attempt: nextAttempt });
                actionsRef.current.leave?.();
                await new Promise((r) => setTimeout(r, 500));
                if (endedRef.current) return;
                logEvent('DISCONNECTED_RETRY_JOIN', {
                  attempt: nextAttempt,
                  roomId: roomDebug || null,
                });
                actionsRef.current.join?.();
              } catch (retryError) {
                logEvent('DISCONNECTED_RETRY_JOIN_ERROR', retryError);
              }
            })();
          }, waitMs);
        } else {
          logEvent('DISCONNECTED_RETRY_EXHAUSTED', {
            attempts: reconnectAttemptsRef.current,
            connectedOnce: connectedOnceRef.current,
          });
          setErrorMessage('Connection dropped before live started');
          setErrorDetail(
            'Meeting disconnected repeatedly while joining. Please check network stability and VideoSDK iOS release logs.'
          );
          setPhase('error');
        }
      }
      if (stateText === 'CLOSED') {
        if (hlsStartTimerRef.current) {
          clearTimeout(hlsStartTimerRef.current);
          hlsStartTimerRef.current = null;
        }
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        setErrorMessage(stateReason || 'Meeting closed by SDK');
        setErrorDetail(
          typeof state === 'object' ? JSON.stringify(state) : stateText || 'CLOSED'
        );
        setPhase('error');
      }
    },
    onError: (err) => {
      if (hlsStartTimerRef.current) {
        clearTimeout(hlsStartTimerRef.current);
        hlsStartTimerRef.current = null;
      }
      logEvent('SDK_ERROR', err);
      const sdkMessage =
        err?.message || err?.reason || err?.error || err?.errorMessage || 'Meeting error';
      setErrorMessage(sdkMessage);
      setErrorDetail(JSON.stringify(err || {}));
      setPhase('error');
    },
  });

  actionsRef.current.stopHls = stopHls;
  actionsRef.current.leave = leave;
  actionsRef.current.join = join;

  useEffect(() => {
    const cameraReady = Boolean(localWebcamOn && localWebcamStream);
    cameraReadyRef.current = cameraReady;
    if (liveMode !== 'screen') {
      logEvent('WEBCAM_STATE', {
        on: Boolean(localWebcamOn),
        hasStream: Boolean(localWebcamStream),
      });
    }
  }, [localWebcamOn, localWebcamStream, liveMode, logEvent]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (joinOnceRef.current) return;
      joinOnceRef.current = true;
      const ok = await ensureCallMediaPermissions(liveMode === 'screen' ? 'audio' : 'video');
      if (cancelled) return;
      if (!ok) {
        logEvent('PERMISSION_DENIED', { liveMode });
        Alert.alert(
          'Permissions required',
          liveMode === 'screen'
            ? 'Microphone permission is required for screen live streaming.'
            : 'Camera and microphone permissions are required for camera live streaming.'
        );
        return;
      }
      try {
        logEvent('ACTION_JOIN_MEETING', { liveMode, roomId: roomDebug || null });
        actionsRef.current.join?.();
      } catch (e) {
        if (!cancelled) {
          logEvent('JOIN_FAILED', e);
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
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      try {
        if (hlsStartedRef.current) stopHls();
        actionsRef.current.leave?.();
        logEvent('CLEANUP_LEAVE');
      } catch (_) {}
    };
  }, [liveMode, roomDebug, logEvent, hlsStartedRef, stopHls]);

  useEffect(() => {
    if (phase !== 'joining') return undefined;
    const t = setTimeout(() => {
      if (endedRef.current) return;
      setErrorMessage(
        `Stream is taking too long (SDK state: ${lastSdkState}). Confirm VideoSDK interactive HLS is enabled, your JWT token URL works, and the device has a stable connection.`
      );
      logEvent('TIMEOUT_JOINING', { lastSdkState });
      setPhase((current) => (current === 'joining' ? 'error' : current));
    }, 75000);
    return () => clearTimeout(t);
  }, [phase, lastSdkState, logEvent]);

  const handleEndPress = () => {
    finalizeEnd(true);
  };

  if (phase === 'error' && errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{errorMessage}</Text>
        {errorDetail ? <Text style={styles.sub}>{errorDetail}</Text> : null}
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
        <Text style={styles.statePanelText}>token: {tokenDebug || 'n/a'}</Text>
        <Text style={styles.statePanelText}>
          meetingPid: {meetingParticipantId || '(omit)'} host: {hostUserId || 'n/a'}
        </Text>
        <Text style={styles.statePanelText}>session: {sessionIdRef.current}</Text>
        {debugLines.slice(0, 12).map((line, idx) => (
          <Text key={`${idx}-${line}`} style={styles.statePanelText}>
            {line}
          </Text>
        ))}
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

  useEffect(() => {
    let cancelled = false;
    setTokenError(null);
    setToken(null);
    setTokenParticipantId(null);
    setLoading(true);
    (async () => {
      try {
        // Non-blocking backend health probe for TestFlight diagnostics.
        try {
          const healthUrl = buildHealthUrl(VIDEOSDK_CONFIG.tokenServerUrl);
          if (healthUrl) {
            const response = await fetch(healthUrl, { method: 'GET', headers: { Accept: 'application/json' } });
            const raw = await response.text();
            let payload = null;
            try {
              payload = raw ? JSON.parse(raw) : null;
            } catch (_) {
              payload = raw;
            }
            console.log('[LiveBroadcast] token-backend health', {
              url: healthUrl,
              status: response.status,
              ok: response.ok,
              payload,
            });
            if (payload && typeof payload === 'object') {
              const keysPresent =
                payload.videoSdkKeysPresent === true ||
                payload.keysPresent === true ||
                payload.ok === true;
              setTokenDebug((prev) => `${prev} health:${response.status} keys:${keysPresent ? 'yes' : 'no'}`);
            } else {
              setTokenDebug((prev) => `${prev} health:${response.status}`);
            }
          }
        } catch (healthError) {
          console.warn('[LiveBroadcast] token-backend health probe failed', healthError);
          setTokenDebug((prev) => `${prev} health:probe-failed`);
        }

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
              console.log('TOKEN ROOM:', claims?.roomId);
              console.log('MEETING ROOM:', effectiveRoomId);
              console.log('TOKEN PARTICIPANT:', claims?.participantId);
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
  // Only pass participantId when the JWT includes it. Minting without participantId but joining
  // with hostUserId causes CONNECTING -> DISCONNECTED on many VideoSDK deployments.
  const meetingParticipantId =
    typeof tokenParticipantId === 'string' && tokenParticipantId.trim()
      ? tokenParticipantId.trim()
      : undefined;

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
        ...(meetingParticipantId ? { participantId: meetingParticipantId } : {}),
        micEnabled: true,
        // Keep webcam off during initial join; enable it only after CONNECTED.
        webcamEnabled: false,
        name: hostDisplayName || hostUserId || 'Host',
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
        tokenParticipantId={tokenParticipantId}
        hostUserId={hostUserId}
        meetingParticipantId={meetingParticipantId}
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

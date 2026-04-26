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
import { getVideoSDKToken } from '../lib/videosdkHelper';
import { ensureCallMediaPermissions } from '../lib/videosdkMediaPermissions';
import { mapLiveQualityToHls } from '../lib/videosdkLiveQuality';
import { endLiveStream } from '../lib/livestream';

const { width, height } = Dimensions.get('window');

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

function BroadcasterMeetingInner({ streamId, quality, liveMode, onStreamEnd, hlsStartedRef, tokenDebug }) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState('joining');
  const [errorMessage, setErrorMessage] = useState(null);
  const [lastSdkState, setLastSdkState] = useState('INIT');
  const endedRef = useRef(false);
  const actionsRef = useRef({});
  /** HLS start is event-driven; do not rely solely on startHls()'s promise resolving. */
  const hlsStartRequestedRef = useRef(false);

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

  const finalizeEndRef = useRef(finalizeEnd);
  finalizeEndRef.current = finalizeEnd;

  const localParticipantRef = useRef(null);
  const {
    join,
    leave,
    startHls,
    stopHls,
    localParticipant,
    enableWebcam,
    startScreenShare,
    enableScreenShare,
  } = useMeeting({
    onMeetingJoined: async () => {
      if (__DEV__) {
        console.log('[LiveBroadcast] onMeetingJoined');
      }
      try {
        await new Promise((r) => setTimeout(r, 200));
        let pinTarget = 'CAM';
        if (liveMode === 'screen') {
          try {
            const startScreen =
              (typeof startScreenShare === 'function' && startScreenShare) ||
              (typeof enableScreenShare === 'function' && enableScreenShare);
            if (!startScreen) {
              throw new Error('Screen share is not available in this build');
            }
            await Promise.resolve(startScreen());
            pinTarget = 'SHARE';
          } catch (e) {
            console.warn('Live broadcast: screen share unavailable, falling back to camera', e);
            Alert.alert('Screen share', 'Screen sharing is unavailable on this build. Switching to camera.');
            try {
              enableWebcam();
            } catch (webcamError) {
              console.warn('Live broadcast: enableWebcam fallback', webcamError);
            }
          }
        } else {
          try {
            enableWebcam();
          } catch (e) {
            console.warn('Live broadcast: enableWebcam', e);
          }
        }
        await new Promise((r) => setTimeout(r, 150));
        try {
          const lp = localParticipantRef.current;
          lp?.pin?.(pinTarget);
        } catch (_) {}

        const q = mapLiveQualityToHls(quality);
        hlsStartRequestedRef.current = true;
        const hlsPromise = startHls({
          layout: {
            type: 'SPOTLIGHT',
            priority: 'PIN',
            gridSize: 4,
          },
          theme: 'DARK',
          mode: 'video-and-audio',
          quality: q,
        });
        if (hlsPromise && typeof hlsPromise.then === 'function') {
          hlsPromise
            .then(() => {
              if (endedRef.current) return;
              hlsStartedRef.current = true;
              setPhase((p) => (p === 'error' ? p : 'live'));
            })
            .catch((e) => {
              console.error('startHls failed', e);
              hlsStartedRef.current = false;
              hlsStartRequestedRef.current = false;
              setErrorMessage(e?.message || 'Could not start live stream');
              setPhase('error');
              Alert.alert(
                'Live stream',
                'Failed to start HLS. Confirm your VideoSDK project has interactive live streaming enabled and your token server is configured.'
              );
            });
        }
      } catch (e) {
        console.error('onMeetingJoined / startHls setup failed', e);
        hlsStartedRef.current = false;
        hlsStartRequestedRef.current = false;
        setErrorMessage(e?.message || 'Could not start live stream');
        setPhase('error');
        Alert.alert(
          'Live stream',
          'Failed to start HLS. Confirm your VideoSDK project has interactive live streaming enabled and your token server is configured.'
        );
      }
    },
    onHlsStarted: () => {
      if (__DEV__) {
        console.log('[LiveBroadcast] onHlsStarted');
      }
      if (endedRef.current) return;
      hlsStartedRef.current = true;
      setPhase((p) => (p === 'error' ? p : 'live'));
    },
    onHlsStateChanged: (state) => {
      if (!state || endedRef.current) return;
      const statusText = String(state?.status || '');
      setLastSdkState(statusText);
      if (__DEV__) {
        console.log('[LiveBroadcast] onHlsStateChanged', statusText, state);
      }
      if (statusText === 'HLS_STARTED' || statusText === 'HLS_PLAYABLE') {
        hlsStartedRef.current = true;
        setPhase((p) => (p === 'error' ? p : 'live'));
      }
      const failed =
        statusText.includes('FAILED') || statusText.includes('ERROR') || statusText === 'HLS_FAILED';
      if (failed) {
        hlsStartRequestedRef.current = false;
        const reason =
          state?.error ||
          state?.message ||
          state?.reason ||
          state?.details ||
          null;
        setErrorMessage(
          reason
            ? `Live stream failed: ${String(reason)}`
            : 'Live stream could not start. Check VideoSDK HLS / dashboard settings.'
        );
        setPhase('error');
      }
    },
    onError: ({ message }) => {
      if (__DEV__) {
        console.error('[LiveBroadcast] sdk onError', message);
      }
      setErrorMessage(message || 'Meeting error');
      setPhase('error');
    },
    onMeetingStateChanged: (meetingState) => {
      if (!meetingState) return;
      const stateText =
        typeof meetingState === 'string'
          ? meetingState
          : meetingState?.status || meetingState?.state || JSON.stringify(meetingState);
      setLastSdkState(stateText);
      if (__DEV__) {
        console.log('[LiveBroadcast] onMeetingStateChanged', stateText, meetingState);
      }
    },
  });

  localParticipantRef.current = localParticipant;
  actionsRef.current.stopHls = stopHls;
  actionsRef.current.leave = leave;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await ensureCallMediaPermissions(liveMode === 'screen' ? 'audio' : 'video');
      if (cancelled) return;
      if (!ok) {
        const permissionMessage =
          liveMode === 'screen'
            ? 'Microphone permission is required to go live.'
            : 'Camera and microphone are required to go live.';
        Alert.alert('Permissions', permissionMessage);
        await finalizeEndRef.current(true);
        return;
      }
      try {
        if (__DEV__) {
          console.log('[LiveBroadcast] permissions ok, joining room');
        }
        await join();
        if (__DEV__ && !cancelled) {
          console.log('[LiveBroadcast] join() resolved');
        }
      } catch (e) {
        if (!cancelled) {
          console.error('[LiveBroadcast] join failed', e);
          Alert.alert('Error', 'Could not join the live room.');
          await finalizeEndRef.current(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [join, liveMode]);

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

  useEffect(() => {
    return () => {
      if (endedRef.current) return;
      endedRef.current = true;
      const act = actionsRef.current;
      try {
        if (hlsStartedRef.current) act.stopHls?.();
      } catch (_) {}
      try {
        act.leave?.();
      } catch (_) {}
      hlsStartedRef.current = false;
      endLiveStream(streamId).catch(() => {});
    };
  }, [streamId, hlsStartedRef]);

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
  const hlsStartedRef = useRef(false);
  // Backward compatible fallback for older records without videosdkRoomId.
  const effectiveRoomId = roomId || streamId;

  useEffect(() => {
    let cancelled = false;
    setTokenError(null);
    setToken(null);
    setLoading(true);
    (async () => {
      try {
        const t = await getVideoSDKToken(effectiveRoomId, hostUserId);
        if (cancelled) return;
        if (t) {
          if (__DEV__) {
            try {
              const payloadPart = String(t).split('.')[1] || '';
              const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
              const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
              const claims = JSON.parse(atob(padded));
              console.log('[LiveBroadcast] token claims', {
                apikey: claims?.apikey || null,
                roomId: claims?.roomId || null,
                participantId: claims?.participantId || null,
                permissions: claims?.permissions || null,
                roles: claims?.roles || null,
              });
              const perms = Array.isArray(claims?.permissions) ? claims.permissions : [];
              setTokenDebug(
                `key:${claims?.apikey || 'n/a'} perms:${Array.isArray(perms) ? perms.join('|') : 'n/a'}`
              );
              if (!perms.includes('allow_join')) {
                setTokenError('VideoSDK token missing allow_join permission.');
                setLoading(false);
                return;
              }
              if (!perms.includes('allow_mod')) {
                console.warn(
                  '[LiveBroadcast] token does not include allow_mod. HLS/start controls may fail depending on account policy.'
                );
              }
            } catch (decodeError) {
              console.warn('[LiveBroadcast] token decode failed', decodeError);
            }
          }
          setToken(t);
          return;
        }
        if (!VIDEOSDK_CONFIG.tokenServerUrl) {
          if (__DEV__) {
            setToken(null);
            return;
          }
          setTokenError(VIDEOSDK_TOKEN_SETUP_MESSAGE);
          return;
        }
        throw new Error('No token from server');
      } catch (e) {
        if (!cancelled) setTokenError(e?.message || 'Token error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, hostUserId]);

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
          Set EXPO_PUBLIC_VIDEOSDK_TOKEN_URL (or EXPO_PUBLIC_SERVER_URL) and rebuild a native dev client.
          VideoSDK does not run in Expo Go.
        </Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => onStreamEnd?.()}>
          <Text style={styles.endBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const authToken =
    token || (__DEV__ && !VIDEOSDK_CONFIG.tokenServerUrl ? VIDEOSDK_CONFIG.apiKey : null);

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
        <Text style={styles.err}>Missing host or stream</Text>
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
        participantId: hostUserId,
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

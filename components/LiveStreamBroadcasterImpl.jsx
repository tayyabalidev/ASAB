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
import { VIDEOSDK_CONFIG } from '../lib/config';
import { getVideoSDKToken } from '../lib/videosdkHelper';
import { ensureCallMediaPermissions } from '../lib/videosdkMediaPermissions';
import { mapLiveQualityToHls } from '../lib/videosdkLiveQuality';
import { endLiveStream } from '../lib/livestream';

const { width, height } = Dimensions.get('window');

function LocalPreview() {
  const { localWebcamOn, localWebcamStream } = useMeeting();

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

function BroadcasterMeetingInner({ streamId, quality, onStreamEnd, hlsStartedRef }) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState('joining');
  const [errorMessage, setErrorMessage] = useState(null);
  const endedRef = useRef(false);
  const actionsRef = useRef({});

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
  const { join, leave, startHls, stopHls, localParticipant } = useMeeting({
    onMeetingJoined: async () => {
      try {
        await new Promise((r) => setTimeout(r, 200));
        try {
          const lp = localParticipantRef.current;
          lp?.pin?.('CAM');
        } catch (_) {}

        const q = mapLiveQualityToHls(quality);
        await startHls({
          layout: {
            type: 'SPOTLIGHT',
            priority: 'PIN',
            gridSize: 4,
          },
          theme: 'DARK',
          mode: 'video-and-audio',
          quality: q,
        });
        hlsStartedRef.current = true;
        setPhase('live');
      } catch (e) {
        console.error('startHls failed', e);
        hlsStartedRef.current = false;
        setErrorMessage(e?.message || 'Could not start live stream');
        setPhase('error');
        Alert.alert(
          'Live stream',
          'Failed to start HLS. Confirm your VideoSDK project has interactive live streaming enabled and your token server is configured.'
        );
      }
    },
    onError: ({ message }) => {
      setErrorMessage(message || 'Meeting error');
      setPhase('error');
    },
  });

  localParticipantRef.current = localParticipant;
  actionsRef.current.stopHls = stopHls;
  actionsRef.current.leave = leave;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await ensureCallMediaPermissions('video');
      if (cancelled) return;
      if (!ok) {
        Alert.alert('Permissions', 'Camera and microphone are required to go live.');
        await finalizeEndRef.current(true);
        return;
      }
      try {
        await join();
      } catch (e) {
        if (!cancelled) {
          Alert.alert('Error', 'Could not join the live room.');
          await finalizeEndRef.current(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [join]);

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
      <LocalPreview />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.livePill}>
          <View style={styles.dot} />
          <Text style={styles.liveText}>LIVE</Text>
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
  hostUserId,
  hostDisplayName,
  quality = 'auto',
  onStreamEnd,
}) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const hlsStartedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setTokenError(null);
    setToken(null);
    setLoading(true);
    (async () => {
      try {
        const t = await getVideoSDKToken(streamId, hostUserId);
        if (cancelled) return;
        if (t) {
          setToken(t);
          return;
        }
        if (__DEV__ && !VIDEOSDK_CONFIG.tokenServerUrl) {
          setToken(null);
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
  }, [streamId, hostUserId]);

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

  if (!hostUserId || !streamId) {
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
        meetingId: streamId,
        participantId: hostUserId,
        micEnabled: true,
        webcamEnabled: true,
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
        onStreamEnd={onStreamEnd}
        hlsStartedRef={hlsStartedRef}
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

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  RTCView,
  MediaStream,
} from '@videosdk.live/react-native-sdk';
import LiveMeetingChat from './LiveMeetingChat';
import { LiveCoHostInviteListener, LiveCoHostGuestMedia } from './LiveCoHostGuest';
import LiveRemoteRtcTiles from './LiveRemoteRtcTiles';
import { useGlobalContext } from '../context/GlobalProvider';
import {
  subscribeLiveStreamUpdates,
  followStreamer,
  unfollowStreamer,
  isFollowing,
  getFollowerCount,
} from '../lib/livestream';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { getVideoSDKToken, waitForMeetingJoinFn } from '../lib/videosdkHelper';
import { validateMeetingToken } from '../lib/videosdkTokenValidate';
import { images } from '../constants';

const { height } = Dimensions.get('window');
const VIEWER_PRE_JOIN_DELAY_MS = Platform.OS === 'android' ? 500 : 200;
const TOKEN_ENDPOINT_HINT = `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}${
  VIDEOSDK_CONFIG.tokenPath || ''
}`;

function pickHlsUrl(hlsUrls) {
  if (!hlsUrls) return null;
  const u =
    hlsUrls.downstreamUrl ||
    hlsUrls.livestreamUrl ||
    hlsUrls.playbackHlsUrl;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

function isPublisherMode(mode) {
  const m = String(mode || '').trim().toUpperCase();
  return !m || m === 'SEND_AND_RECV' || m === 'SEND_RECV' || m === 'CONFERENCE';
}

function pickPrimaryHostPublisherId(participants, localId) {
  if (!(participants instanceof Map) || !localId) return null;
  let hostId = null;
  participants.forEach((p, id) => {
    if (!id || id === localId || hostId) return;
    if (isPublisherMode(p?.mode)) hostId = String(id);
  });
  return hostId;
}

function streamToUrl(mediaStream) {
  if (!mediaStream) return null;
  try {
    if (typeof mediaStream.toURL === 'function') return mediaStream.toURL();
    if (mediaStream.track) return new MediaStream([mediaStream.track]).toURL();
  } catch (_) {
    return null;
  }
  return null;
}

/** Low-latency WebRTC watch path (replaces delayed HLS when host media is available). */
function HostWebRtcLiveLayer({ participantId, onActiveChange }) {
  const { webcamOn, webcamStream, micOn, micStream, screenShareOn, screenShareStream } =
    useParticipant(participantId);

  const screenUrl =
    screenShareOn && screenShareStream ? streamToUrl(screenShareStream) : null;
  const videoUrl = !screenUrl && webcamOn && webcamStream ? streamToUrl(webcamStream) : null;
  const primaryVideoUrl = screenUrl || videoUrl;
  const audioUrl = micOn && micStream ? streamToUrl(micStream) : null;

  const isActive = Boolean(primaryVideoUrl || audioUrl);

  useEffect(() => {
    onActiveChange?.(isActive);
  }, [isActive, onActiveChange]);

  if (!isActive) return null;

  return (
    <View style={styles.webrtcLiveLayer} pointerEvents="none">
      {primaryVideoUrl ? (
        <RTCView
          streamURL={primaryVideoUrl}
          style={styles.webrtcLiveVideo}
          objectFit="cover"
          mirror={false}
          zOrder={Platform.OS === 'android' ? 1 : 0}
        />
      ) : null}
      {audioUrl ? (
        <RTCView
          streamURL={audioUrl}
          style={styles.webrtcLiveAudioSink}
          objectFit="cover"
          zOrder={0}
        />
      ) : null}
    </View>
  );
}

function LiveHlsViewerInner({ onPlaybackEnded, onMeetingReady }) {
  const [hlsUrl, setHlsUrl] = useState(null);
  const [hlsStateText, setHlsStateText] = useState('CONNECTING');
  const [waitSeconds, setWaitSeconds] = useState(0);
  const joinOnceRef = useRef(false);
  const actionsRef = useRef({});
  const onMeetingReadyRef = useRef(onMeetingReady);

  useEffect(() => {
    onMeetingReadyRef.current = onMeetingReady;
  }, [onMeetingReady]);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  const { join, leave, hlsUrls } = useMeeting({
    onMeetingJoined: () => {
      setHlsStateText('MEETING_JOINED');
      onMeetingReadyRef.current?.();
    },
    onHlsStarted: (payload = {}) => {
      const downstreamUrl = payload?.downstreamUrl;
      setHlsStateText('HLS_STARTED');
      if (downstreamUrl) setHlsUrl(downstreamUrl);
    },
    onHlsStateChanged: (payload = {}) => {
      const status = payload?.status;
      const downstreamUrl = payload?.downstreamUrl;
      const playbackHlsUrl = payload?.playbackHlsUrl;
      if (status) setHlsStateText(status);
      if (status === 'HLS_PLAYABLE') {
        const u = downstreamUrl || playbackHlsUrl;
        if (u) setHlsUrl(u);
      }
      if (status === 'HLS_STOPPED' || status === 'HLS_STOPPING') {
        onPlaybackEnded?.();
      }
    },
    onMeetingLeft: () => onPlaybackEnded?.(),
    onError: (err) => {
      console.warn('[LiveViewer] meeting error', err);
      setHlsStateText('ERROR');
    },
  });

  useEffect(() => {
    const u = pickHlsUrl(hlsUrls);
    if (u) setHlsUrl(u);
  }, [hlsUrls]);

  useEffect(() => {
    if (!hlsUrl) return;
    let cancelled = false;
    player
      .replaceAsync({ uri: hlsUrl, contentType: 'hls' })
      .then(() => {
        if (!cancelled && !suppressPlayback) player.play();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      try {
        player.pause();
      } catch (_) {}
    };
  }, [hlsUrl, player, suppressPlayback]);

  useEffect(() => {
    try {
      player.muted = Boolean(suppressPlayback);
      if (suppressPlayback) {
        player.pause();
      } else if (hlsUrl) {
        player.play();
      }
    } catch (_) {}
  }, [suppressPlayback, hlsUrl, player]);

  actionsRef.current.join = join;
  actionsRef.current.leave = leave;

  // Join once — wait for join() binding like host/call flows.
  useEffect(() => {
    if (joinOnceRef.current) return undefined;
    joinOnceRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        if (VIEWER_PRE_JOIN_DELAY_MS > 0) {
          await new Promise((r) => setTimeout(r, VIEWER_PRE_JOIN_DELAY_MS));
        }
        if (cancelled) return;
        let joinFn = actionsRef.current.join;
        if (typeof joinFn !== 'function') {
          joinFn = await waitForMeetingJoinFn(() => actionsRef.current.join, {
            isCancelled: () => cancelled,
            timeoutMs: 6000,
            intervalMs: 50,
          });
        }
        if (cancelled || !joinFn) {
          throw new Error('VideoSDK viewer join() was not ready');
        }
        await Promise.resolve(joinFn());
      } catch (e) {
        if (cancelled) return;
        console.error('[LiveViewer] join failed', e);
        setHlsStateText('ERROR');
      }
    })();
    return () => {
      cancelled = true;
      try {
        actionsRef.current.leave?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (hlsUrl) return;
    const t = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [hlsUrl]);

  if (!hlsUrl) {
    return (
      <View style={styles.hlsWaiting}>
        <ActivityIndicator color="#a77df8" size="large" />
        <Text style={styles.hlsWaitingText}>Waiting for live video…</Text>
        <Text style={styles.hlsWaitingHint}>The host may still be starting the stream.</Text>
        <Text style={styles.hlsStateText}>State: {hlsStateText}</Text>
        {waitSeconds >= 20 ? (
          <Text style={styles.hlsTroubleshoot}>
            Taking longer than expected. Host should confirm HLS started successfully and that the
            VideoSDK project has interactive live streaming enabled.
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={[styles.hlsVideo, suppressPlayback && styles.hlsSuppressed]}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

/**
 * Prevents duplicate host audio: viewers watch via HLS; mute remote WebRTC mic tracks.
 */
function RemoteWebRtcAudioMuteInner({ participantId }) {
  const { micStream } = useParticipant(participantId);
  useEffect(() => {
    const track = micStream?.track;
    if (!track) return undefined;
    track.enabled = false;
    return () => {
      try {
        track.enabled = true;
      } catch (_) {}
    };
  }, [micStream?.track?.id, participantId]);
  return null;
}

function RemoteWebRtcAudioMute({ participantId }) {
  if (!participantId) return null;
  return <RemoteWebRtcAudioMuteInner participantId={participantId} />;
}

function LiveViewerRealtimeLayers({
  showChat,
  displayName,
  canRaiseHand,
  webrtcLiveActive = false,
}) {
  const { participants, localParticipant } = useMeeting();
  const localId = localParticipant?.id;
  const localMode = String(localParticipant?.mode || '').toUpperCase();
  const localIsSpeaker =
    localMode === 'SEND_AND_RECV' ||
    localMode === 'SEND_RECV' ||
    localMode === 'CONFERENCE';

  const remotePublisherIds = useMemo(() => {
    const ids = [];
    if (!(participants instanceof Map) || !localId) return ids;
    participants.forEach((p, id) => {
      if (!id || id === localId) return;
      const m = String(p?.mode || '').trim().toUpperCase();
      if (!m || m === 'SEND_AND_RECV' || m === 'CONFERENCE' || m === 'SEND_RECV') {
        ids.push(String(id));
      }
    });
    return ids;
  }, [participants, localId]);

  return (
    <>
      {!localIsSpeaker &&
        remotePublisherIds.map((id) => (
          <RemoteWebRtcAudioMute key={`rtc-mute-${id}`} participantId={id} />
        ))}
      <LiveRemoteRtcTiles hideWhenSinglePublisher />
      <LiveCoHostInviteListener />
      {localIsSpeaker ? <LiveCoHostGuestMedia /> : null}
      {showChat ? (
        <View style={styles.chatOverlay} pointerEvents="box-none">
          <LiveMeetingChat
            displayName={displayName}
            showRaiseHand={canRaiseHand}
            style={styles.chatOverlayInner}
          />
        </View>
      ) : null}
    </>
  );
}

/**
 * Viewer shell inside MeetingProvider — HLS first, realtime layers after join.
 * Matches VideoSDK ILS: RECV_ONLY + join() + HLS playback.
 */
function LiveViewerInMeeting({
  onPlaybackEnded,
  showChat = true,
  displayName = 'Viewer',
  canRaiseHand = false,
}) {
  const [meetingReady, setMeetingReady] = useState(false);
  const [webrtcLiveActive, setWebrtcLiveActive] = useState(false);
  const { participants, localParticipant } = useMeeting();
  const localId = localParticipant?.id;
  const hostPublisherId = useMemo(
    () => pickPrimaryHostPublisherId(participants, localId),
    [participants, localId]
  );

  return (
    <View style={styles.viewerMeetingRoot}>
      <LiveHlsViewerInner
        onPlaybackEnded={onPlaybackEnded}
        onMeetingReady={() => setMeetingReady(true)}
        suppressPlayback={webrtcLiveActive}
      />
      {meetingReady && hostPublisherId ? (
        <HostWebRtcLiveLayer
          participantId={hostPublisherId}
          onActiveChange={setWebrtcLiveActive}
        />
      ) : null}
      {meetingReady ? (
        <LiveViewerRealtimeLayers
          showChat={showChat}
          displayName={displayName}
          canRaiseHand={canRaiseHand}
          webrtcLiveActive={webrtcLiveActive}
        />
      ) : null}
    </View>
  );
}

export default function LiveStreamPlayerImpl({ stream, onClose, showChat = true }) {
  const { user } = useGlobalContext();
  const effectiveRoomId = stream?.videosdkRoomId || null;
  const [viewerCount, setViewerCount] = useState(stream?.viewerCount || 0);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [token, setToken] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const [meetingParticipantId, setMeetingParticipantId] = useState(undefined);
  const playbackEndedRef = useRef(false);

  useEffect(() => {
    playbackEndedRef.current = false;
  }, [stream?.$id]);

  useEffect(() => {
    let unsubscribe;

    if (stream?.hostId && user?.$id && user.$id !== stream.hostId) {
      isFollowing(user.$id, stream.hostId).then(setIsFollowingUser).catch(console.error);
      getFollowerCount(stream.hostId).then(setFollowerCount).catch(console.error);
    }

    if (stream?.$id) {
      unsubscribe = subscribeLiveStreamUpdates(stream.$id, (response) => {
        if (response.payload) {
          setViewerCount(response.payload.viewerCount || 0);
          if (response.payload.isLive === false) {
            if (onClose) onClose();
          }
        }
      });
    }

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [stream?.$id, stream?.hostId, user?.$id, onClose]);

  useEffect(() => {
    if (!effectiveRoomId || !user?.$id) {
      setTokenLoading(false);
      return;
    }
    let cancelled = false;
    setTokenError(null);
    setToken(null);
    setMeetingParticipantId(undefined);
    setTokenLoading(true);
    (async () => {
      try {
        const t = await getVideoSDKToken(effectiveRoomId, user.$id, { purpose: 'live' });
        if (cancelled) return;
        if (t) {
          const validation = validateMeetingToken(t, effectiveRoomId, { requireMod: false });
          if (!validation.ok) {
            setTokenError(validation.error);
            return;
          }
          if (validation.participantId) {
            setMeetingParticipantId(validation.participantId);
          }
          setToken(t);
          return;
        }
        setTokenError(VIDEOSDK_TOKEN_SETUP_MESSAGE);
        return;
      } catch (e) {
        if (!cancelled) setTokenError(e?.message || 'Token error');
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, user?.$id]);

  const handleFollowToggle = async () => {
    if (!user?.$id) {
      Alert.alert('Error', 'Please login to follow streamers');
      return;
    }

    if (!stream?.hostId) {
      Alert.alert('Error', 'Invalid stream host');
      return;
    }

    try {
      if (isFollowingUser) {
        await unfollowStreamer(user.$id, stream.hostId);
        setIsFollowingUser(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
        Alert.alert('Success', `Unfollowed ${stream.hostUsername}`);
      } else {
        await followStreamer(user.$id, stream.hostId, stream.hostUsername);
        setIsFollowingUser(true);
        setFollowerCount((prev) => prev + 1);
        Alert.alert('Success', `Following ${stream.hostUsername}`);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  const handlePlaybackEnded = () => {
    if (playbackEndedRef.current) return;
    playbackEndedRef.current = true;
    onClose?.();
  };

  if (!stream || !user?.$id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Sign in to watch live streams</Text>
      </View>
    );
  }

  if (tokenLoading) {
    return (
      <View style={[styles.container, styles.centerFill]}>
        <ActivityIndicator color="#a77df8" />
        <Text style={styles.loadingLabel}>Connecting to live room…</Text>
      </View>
    );
  }

  if (tokenError) {
    return (
      <View style={[styles.container, styles.centerFill, { padding: 24 }]}>
        <Text style={styles.errorText}>{tokenError}</Text>
        <Text style={styles.tokenHint}>
          Configure EXPO_PUBLIC_VIDEOSDK_TOKEN_URL and EXPO_PUBLIC_VIDEOSDK_TOKEN_PATH, then use a
          development build (not Expo Go).
        </Text>
        <Text style={styles.tokenHint}>{TOKEN_ENDPOINT_HINT}</Text>
        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const authToken = token;

  if (!authToken) {
    return (
      <View style={[styles.container, styles.centerFill]}>
        <Text style={styles.errorText}>Missing VideoSDK token</Text>
        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoArea}>
        <MeetingProvider
          key={effectiveRoomId}
          config={{
            meetingId: effectiveRoomId,
            micEnabled: false,
            webcamEnabled: false,
            name: user.username || user.$id || 'Viewer',
            mode: 'RECV_ONLY',
            debugMode: __DEV__,
            notification: {
              title: 'ASAB Live',
              message: 'Watching live',
            },
            ...(meetingParticipantId ? { participantId: meetingParticipantId } : {}),
          }}
          token={authToken}
        >
          <LiveViewerInMeeting
            onPlaybackEnded={handlePlaybackEnded}
            showChat={showChat}
            displayName={user.username || 'Viewer'}
            canRaiseHand={Boolean(stream.hostId && user.$id !== stream.hostId)}
          />
        </MeetingProvider>

        <View style={styles.viewerBadge} pointerEvents="none">
          <Text style={styles.viewerBadgeText}>👁 {viewerCount}</Text>
        </View>

        {onClose && (
          <TouchableOpacity style={styles.closeFab} onPress={onClose}>
            <Text style={styles.closeFabText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View
        style={[
          styles.bottomOverlay,
          showChat && { paddingBottom: height * 0.44 },
        ]}
      >
        <View style={styles.hostInfoContainer}>
          <View style={styles.hostInfo}>
            <Image
              source={stream.hostAvatar ? { uri: stream.hostAvatar } : images.profile}
              style={styles.hostAvatarSmall}
            />
            <View style={styles.hostDetails}>
              <Text style={styles.hostName}>{stream.hostUsername}</Text>
              <Text style={styles.followerCountText}>
                {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
              </Text>
              <Text style={styles.streamTitle} numberOfLines={2}>
                {stream.title}
              </Text>
            </View>
          </View>

          {stream.hostId && user.$id !== stream.hostId && (
            <TouchableOpacity
              style={[styles.followButton, isFollowingUser && styles.followingButton]}
              onPress={handleFollowToggle}
            >
              <Text style={[styles.followButtonText, isFollowingUser && styles.followingButtonText]}>
                {isFollowingUser ? '✓ Following' : '+ Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerFill: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingLabel: {
    color: '#ccc',
    marginTop: 12,
    fontSize: 15,
  },
  tokenHint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
  videoArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  viewerMeetingRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  chatOverlayInner: {
    flex: 1,
  },
  chatOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 28,
  },
  hlsVideo: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  hlsSuppressed: {
    opacity: 0,
    position: 'absolute',
    width: 1,
    height: 1,
  },
  webrtcLiveLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 6,
  },
  webrtcLiveVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  webrtcLiveAudioSink: {
    position: 'absolute',
    width: 2,
    height: 2,
    bottom: 0,
    right: 0,
    opacity: 0.01,
  },
  hlsWaiting: {
    flex: 1,
    minHeight: height * 0.45,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 24,
  },
  hlsWaitingText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  hlsWaitingHint: {
    color: '#888',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  hlsStateText: {
    color: '#a77df8',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
  },
  hlsTroubleshoot: {
    color: '#c9c9c9',
    fontSize: 12,
    marginTop: 10,
    textAlign: 'center',
    lineHeight: 18,
  },
  viewerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewerBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  closeFab: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeFabText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingBottom: 24,
    zIndex: 8,
  },
  hostInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 10,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#222',
  },
  hostDetails: {
    flex: 1,
  },
  hostName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  followerCountText: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
  },
  streamTitle: {
    color: '#ddd',
    fontSize: 12,
  },
  followButton: {
    backgroundColor: '#a77df8',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginLeft: 10,
  },
  followingButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: '#a77df8',
  },
  followButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  followingButtonText: {
    color: '#a77df8',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
  closeButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 30,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

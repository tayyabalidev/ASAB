import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  MeetingProvider,
  useMeeting,
} from '@videosdk.live/react-native-sdk';
import LiveMeetingChat from './LiveMeetingChat';
import { LiveCoHostInviteListener, LiveCoHostGuestMedia } from './LiveCoHostGuest';
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
import { pickLiveHlsUrl, seekHlsNearLiveEdge } from '../lib/videosdkLiveHls';
import { images } from '../constants';

const { height } = Dimensions.get('window');
const TOKEN_ENDPOINT_HINT = `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}${
  VIDEOSDK_CONFIG.tokenPath || ''
}`;

function LiveHlsViewerInner({ liveMode, onPlaybackEnded, onMeetingReady }) {
  const [hlsUrl, setHlsUrl] = useState(null);
  const [hlsStateText, setHlsStateText] = useState('CONNECTING');
  const [waitSeconds, setWaitSeconds] = useState(0);
  const joinOnceRef = useRef(false);
  const meetingJoinedRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const lastLoadedUrlRef = useRef(null);
  const actionsRef = useRef({});
  const onMeetingReadyRef = useRef(onMeetingReady);
  const isCameraLive = liveMode !== 'screen';

  useEffect(() => {
    onMeetingReadyRef.current = onMeetingReady;
  }, [onMeetingReady]);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  const applyHlsUrl = useCallback((nextUrl) => {
    if (!nextUrl || nextUrl === lastLoadedUrlRef.current) return;
    lastLoadedUrlRef.current = nextUrl;
    setHlsUrl(nextUrl);
  }, []);

  const { join, leave, hlsUrls } = useMeeting({
    onMeetingJoined: () => {
      meetingJoinedRef.current = true;
      setHlsStateText('MEETING_JOINED');
      onMeetingReadyRef.current?.();
    },
    onHlsStarted: (payload = {}) => {
      setHlsStateText('HLS_STARTED');
      const u = pickLiveHlsUrl(payload);
      if (u) applyHlsUrl(u);
    },
    onHlsStateChanged: (payload = {}) => {
      const status = payload?.status;
      if (status) setHlsStateText(status);
      if (status === 'HLS_PLAYABLE') {
        const u = pickLiveHlsUrl(payload);
        if (u) applyHlsUrl(u);
      }
      if (status === 'HLS_STOPPED' && playbackStartedRef.current) {
        onPlaybackEnded?.();
      }
    },
    onMeetingLeft: () => {
      if (!meetingJoinedRef.current) return;
    },
    onError: () => {
      setHlsStateText('ERROR');
    },
  });

  useEffect(() => {
    const u = pickLiveHlsUrl(hlsUrls);
    if (u) applyHlsUrl(u);
  }, [hlsUrls, applyHlsUrl]);

  useEffect(() => {
    if (!hlsUrl) return undefined;
    playbackStartedRef.current = true;
    let cancelled = false;
    let statusSub = null;

    const startPlayback = async () => {
      try {
        await player.replaceAsync({ uri: hlsUrl, contentType: 'hls' });
        if (cancelled) return;
        player.play();
        seekHlsNearLiveEdge(player);
      } catch (_) {
        if (!cancelled) setHlsStateText('ERROR');
      }
    };

    startPlayback();

    try {
      statusSub = player.addListener('statusChange', (ev) => {
        if (cancelled) return;
        if (ev?.status === 'readyToPlay' || ev?.status === 'playing') {
          seekHlsNearLiveEdge(player);
        }
      });
    } catch (_) {}

    return () => {
      cancelled = true;
      try {
        statusSub?.remove?.();
      } catch (_) {}
      try {
        player.pause();
      } catch (_) {}
    };
  }, [hlsUrl, player]);

  actionsRef.current.join = join;
  actionsRef.current.leave = leave;

  // Join once ΓÇö do not call leave() in this effect's cleanup (Strict Mode / re-renders
  // were disconnecting viewers before join completed). Leave only on unmount below.
  useEffect(() => {
    if (joinOnceRef.current) return undefined;
    joinOnceRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        let joinFn = actionsRef.current.join;
        if (typeof joinFn !== 'function') {
          joinFn = await waitForMeetingJoinFn(() => actionsRef.current.join, {
            isCancelled: () => cancelled,
            timeoutMs: 8000,
            intervalMs: 50,
          });
        }
        if (cancelled || !joinFn) {
          throw new Error('VideoSDK viewer join() was not ready');
        }
        await Promise.resolve(joinFn());
      } catch (_) {
        if (!cancelled) setHlsStateText('ERROR');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (!meetingJoinedRef.current) return;
      try {
        actionsRef.current.leave?.();
      } catch (_) {}
    };
  }, []);

  useEffect(() => {
    if (hlsUrl) return undefined;
    const t = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [hlsUrl]);

  if (!hlsUrl) {
    return (
      <View style={styles.hlsWaiting}>
        <ActivityIndicator color="#a77df8" size="large" />
        <Text style={styles.hlsWaitingText}>Waiting for live videoΓÇª</Text>
        <Text style={styles.hlsWaitingHint}>The host may still be starting the stream.</Text>
        <Text style={styles.hlsStateText}>State: {hlsStateText}</Text>
        {waitSeconds >= 20 ? (
          <Text style={styles.hlsTroubleshoot}>
            Taking longer than expected. Confirm the host has started broadcasting.
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.hlsVideoWrap, isCameraLive && styles.hlsVideoMirror]}>
      <VideoView
        player={player}
        style={styles.hlsVideo}
        contentFit="cover"
        nativeControls={false}
      />
    </View>
  );
}

function LiveViewerJoinedLayers({ showChat, displayName, canRaiseHand }) {
  const { localParticipant } = useMeeting();
  const localMode = String(localParticipant?.mode || '').toUpperCase();
  const localIsSpeaker =
    localMode === 'SEND_AND_RECV' ||
    localMode === 'SEND_RECV' ||
    localMode === 'CONFERENCE';

  return (
    <>
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

function LiveViewerInMeeting({
  liveMode,
  onPlaybackEnded,
  showChat = true,
  displayName = 'Viewer',
  canRaiseHand = false,
}) {
  const [meetingReady, setMeetingReady] = useState(false);

  return (
    <View style={styles.viewerMeetingRoot}>
      <LiveHlsViewerInner
        liveMode={liveMode}
        onPlaybackEnded={onPlaybackEnded}
        onMeetingReady={() => setMeetingReady(true)}
      />
      {meetingReady ? (
        <LiveViewerJoinedLayers
          showChat={showChat}
          displayName={displayName}
          canRaiseHand={canRaiseHand}
        />
      ) : null}
    </View>
  );
}

export default function LiveStreamPlayerImpl({ stream, onClose, showChat = true }) {
  const { user } = useGlobalContext();
  const effectiveRoomId = stream?.videosdkRoomId || null;
  const liveMode = stream?.liveMode === 'screen' ? 'screen' : 'camera';
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
      isFollowing(user.$id, stream.hostId).then(setIsFollowingUser).catch(() => {});
      getFollowerCount(stream.hostId).then(setFollowerCount).catch(() => {});
    }

    if (stream?.$id) {
      unsubscribe = subscribeLiveStreamUpdates(stream.$id, (response) => {
        if (response.payload) {
          setViewerCount(response.payload.viewerCount || 0);
          if (response.payload.isLive === false) {
            onClose?.();
          }
        }
      });
    }

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [stream?.$id, stream?.hostId, user?.$id, onClose]);

  useEffect(() => {
    if (!effectiveRoomId || !user?.$id) {
      setTokenLoading(false);
      return undefined;
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
            if (!cancelled) setTokenError(validation.error);
            return;
          }
          if (!cancelled) {
            if (validation.participantId) {
              setMeetingParticipantId(validation.participantId);
            }
            setToken(t);
          }
          return;
        }
        if (!cancelled) setTokenError(VIDEOSDK_TOKEN_SETUP_MESSAGE);
      } catch (e) {
        if (!cancelled) setTokenError(e?.message || 'Token error');
      } finally {
        setTokenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, user?.$id]);

  const handleFollowToggle = async () => {
    if (!user?.$id || !stream?.hostId) {
      Alert.alert('Error', 'Please login to follow streamers');
      return;
    }

    try {
      if (isFollowingUser) {
        await unfollowStreamer(user.$id, stream.hostId);
        setIsFollowingUser(false);
        setFollowerCount((prev) => Math.max(0, prev - 1));
      } else {
        await followStreamer(user.$id, stream.hostId, stream.hostUsername);
        setIsFollowingUser(true);
        setFollowerCount((prev) => prev + 1);
      }
    } catch (_) {
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
        <Text style={styles.loadingLabel}>Connecting to live roomΓÇª</Text>
      </View>
    );
  }

  if (tokenError) {
    return (
      <View style={[styles.container, styles.centerFill, { padding: 24 }]}>
        <Text style={styles.errorText}>{tokenError}</Text>
        <Text style={styles.tokenHint}>
          Configure EXPO_PUBLIC_VIDEOSDK_TOKEN_URL and use a development build (not Expo Go).
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

  if (!effectiveRoomId) {
    return (
      <View style={[styles.container, styles.centerFill, { padding: 24 }]}>
        <Text style={styles.errorText}>This stream has no VideoSDK room id.</Text>
        <Text style={styles.tokenHint}>Ask the host to start a new live stream.</Text>
        {onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (!token) {
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
            debugMode: false,
            notification: {
              title: 'ASAB Live',
              message: 'Watching live',
            },
            ...(meetingParticipantId ? { participantId: meetingParticipantId } : {}),
          }}
          token={token}
        >
          <LiveViewerInMeeting
            liveMode={liveMode}
            onPlaybackEnded={handlePlaybackEnded}
            showChat={showChat}
            displayName={user.username || 'Viewer'}
            canRaiseHand={Boolean(stream.hostId && user.$id !== stream.hostId)}
          />
        </MeetingProvider>

        <View style={styles.viewerBadge} pointerEvents="none">
          <Text style={styles.viewerBadgeText}>≡ƒæü {viewerCount}</Text>
        </View>

        {onClose && (
          <TouchableOpacity style={styles.closeFab} onPress={onClose}>
            <Text style={styles.closeFabText}>Γ£ò</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.bottomOverlay, showChat && { paddingBottom: height * 0.44 }]}>
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
                {isFollowingUser ? 'Γ£ô Following' : '+ Follow'}
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
  hlsVideoWrap: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  hlsVideoMirror: {
    transform: [{ scaleX: -1 }],
  },
  hlsVideo: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
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

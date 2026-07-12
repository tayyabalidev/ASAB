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
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  MeetingProvider,
  useMeeting,
} from '@videosdk.live/react-native-sdk';
import LiveStreamChatOverlay from './LiveStreamChatOverlay';
import LiveStreamHeartReactions from './LiveStreamHeartReactions';
import { LiveCoHostInviteListener, LiveCoHostGuestMedia } from './LiveCoHostGuest';
import { useGlobalContext } from '../context/GlobalProvider';
import {
  subscribeLiveStreamUpdates,
  followStreamer,
  unfollowStreamer,
  isFollowing,
  getFollowerCount,
  resolveLiveStreamThumbnailUrl,
  buildLiveViewerParticipantId,
} from '../lib/livestream';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { getVideoSDKToken, waitForMeetingJoinFn } from '../lib/videosdkHelper';
import { validateMeetingToken } from '../lib/videosdkTokenValidate';
import {
  pickLiveHlsUrl,
  listLiveHlsUrlFallbacks,
  buildHlsVideoSource,
  seekHlsNearLiveEdge,
  shouldSyncHlsLiveEdge,
  HLS_LIVE_EDGE_SYNC_MS,
  HLS_IOS_RETRY_DELAY_MS,
} from '../lib/videosdkLiveHls';
import { images } from '../constants';
import { getViewerLiveChatLayout } from '../lib/liveChatLayout';

const { height } = Dimensions.get('window');
const OVERLAY_MOUNT_DELAY_MS = Platform.OS === 'ios' ? 800 : 450;
const TOKEN_ENDPOINT_HINT = `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}${
  VIDEOSDK_CONFIG.tokenPath || ''
}`;

function LiveHlsViewerInner({ liveMode, thumbnailUri, onPlaybackEnded, onOverlaysReady }) {
  const [hlsUrl, setHlsUrl] = useState(null);
  const [hlsStateText, setHlsStateText] = useState('CONNECTING');
  const [playbackError, setPlaybackError] = useState(null);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const joinOnceRef = useRef(false);
  const meetingJoinedRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const lastLoadedUrlRef = useRef(null);
  const hlsPayloadRef = useRef(null);
  const hlsUrlAttemptRef = useRef(0);
  const playbackRetryTimerRef = useRef(null);
  const overlayReadyFiredRef = useRef(false);
  const overlayReadyTimerRef = useRef(null);
  const hlsUrlRef = useRef(null);
  const actionsRef = useRef({});
  const onOverlaysReadyRef = useRef(onOverlaysReady);
  const isCameraLive = liveMode !== 'screen';

  useEffect(() => {
    onOverlaysReadyRef.current = onOverlaysReady;
  }, [onOverlaysReady]);

  useEffect(() => {
    hlsUrlRef.current = hlsUrl;
  }, [hlsUrl]);

  const scheduleOverlayReady = useCallback(() => {
    if (overlayReadyFiredRef.current) return;
    if (!meetingJoinedRef.current || !hlsUrlRef.current) return;

    overlayReadyFiredRef.current = true;
    if (overlayReadyTimerRef.current) {
      clearTimeout(overlayReadyTimerRef.current);
    }
    overlayReadyTimerRef.current = setTimeout(() => {
      onOverlaysReadyRef.current?.();
      overlayReadyTimerRef.current = null;
    }, OVERLAY_MOUNT_DELAY_MS);
  }, []);

  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  const applyHlsPayload = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') return;
    hlsPayloadRef.current = payload;
    hlsUrlAttemptRef.current = 0;
    const nextUrl = pickLiveHlsUrl(payload, Platform.OS);
    if (!nextUrl || nextUrl === lastLoadedUrlRef.current) return;
    lastLoadedUrlRef.current = nextUrl;
    setPlaybackError(null);
    setHlsUrl(nextUrl);
  }, []);

  const tryNextHlsUrl = useCallback(() => {
    const payload = hlsPayloadRef.current;
    const urls = listLiveHlsUrlFallbacks(payload, Platform.OS);
    if (urls.length === 0) return false;
    const nextAttempt = hlsUrlAttemptRef.current + 1;
    if (nextAttempt >= urls.length) return false;
    hlsUrlAttemptRef.current = nextAttempt;
    const nextUrl = urls[nextAttempt];
    lastLoadedUrlRef.current = nextUrl;
    setPlaybackError(null);
    setHlsStateText(`RETRY_HLS_${nextAttempt + 1}`);
    setHlsUrl(nextUrl);
    return true;
  }, []);

  const { join, leave, hlsUrls } = useMeeting({
    onMeetingJoined: () => {
      meetingJoinedRef.current = true;
      setHlsStateText('MEETING_JOINED');
      scheduleOverlayReady();
    },
    onHlsStarted: (payload = {}) => {
      setHlsStateText('HLS_STARTED');
      applyHlsPayload(payload);
    },
    onHlsStateChanged: (payload = {}) => {
      const status = payload?.status;
      if (status) setHlsStateText(status);
      if (status === 'HLS_PLAYABLE' || status === 'HLS_STARTED') {
        applyHlsPayload(payload);
      }
      if (status === 'HLS_STOPPED' && playbackStartedRef.current) {
        onPlaybackEnded?.();
      }
    },
    onMeetingLeft: () => {
      if (!meetingJoinedRef.current) return;
    },
    onError: (err) => {
      const msg = err?.message || err?.reason || 'Meeting error';
      setHlsStateText(`ERROR: ${msg}`);
    },
  });

  useEffect(() => {
    if (!hlsUrls) return;
    applyHlsPayload(hlsUrls);
  }, [hlsUrls, applyHlsPayload]);

  // Mount chat/reactions only after meeting join + HLS URL (avoids PubSub vs player native crash).
  useEffect(() => {
    if (!hlsUrl || !meetingJoinedRef.current) return undefined;
    scheduleOverlayReady();
    return undefined;
  }, [hlsUrl, scheduleOverlayReady]);

  useEffect(() => {
    if (!hlsUrl) return undefined;
    playbackStartedRef.current = true;
    let cancelled = false;
    let statusSub = null;

    const scheduleRetry = () => {
      if (cancelled) return;
      if (playbackRetryTimerRef.current) {
        clearTimeout(playbackRetryTimerRef.current);
      }
      playbackRetryTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        if (tryNextHlsUrl()) return;
        setPlaybackError('Could not start live video on this device.');
        setHlsStateText('PLAYBACK_ERROR');
      }, HLS_IOS_RETRY_DELAY_MS);
    };

    const startPlayback = async () => {
      try {
        setPlaybackError(null);
        await player.replaceAsync(buildHlsVideoSource(hlsUrl));
        if (cancelled) return;
        if (Platform.OS !== 'ios') {
          player.play();
          seekHlsNearLiveEdge(player);
        }
      } catch (_) {
        if (!cancelled) scheduleRetry();
      }
    };

    startPlayback();

    const syncTimer = shouldSyncHlsLiveEdge()
      ? setInterval(() => {
          seekHlsNearLiveEdge(player);
        }, HLS_LIVE_EDGE_SYNC_MS)
      : null;

    try {
      statusSub = player.addListener('statusChange', (ev) => {
        if (cancelled) return;
        const status = ev?.status;
        if (status === 'readyToPlay') {
          try {
            player.play();
          } catch (_) {}
          seekHlsNearLiveEdge(player);
        }
        if (status === 'playing') {
          setPlaybackError(null);
          seekHlsNearLiveEdge(player);
          scheduleOverlayReady();
        }
        if (status === 'error' || status === 'failed') {
          scheduleRetry();
        }
      });
    } catch (_) {}

    return () => {
      cancelled = true;
      if (syncTimer) clearInterval(syncTimer);
      if (playbackRetryTimerRef.current) {
        clearTimeout(playbackRetryTimerRef.current);
        playbackRetryTimerRef.current = null;
      }
      try {
        statusSub?.remove?.();
      } catch (_) {}
      try {
        player.pause();
      } catch (_) {}
    };
  }, [hlsUrl, player, tryNextHlsUrl]);

  actionsRef.current.join = join;
  actionsRef.current.leave = leave;

  // Join once — do not call leave() in this effect's cleanup (Strict Mode / re-renders
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
        if (Platform.OS === 'ios') {
          await new Promise((r) => setTimeout(r, 120));
        }
        await Promise.resolve(joinFn());
      } catch (err) {
        if (!cancelled) {
          setHlsStateText(`JOIN_ERROR: ${err?.message || 'join failed'}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (playbackRetryTimerRef.current) {
        clearTimeout(playbackRetryTimerRef.current);
        playbackRetryTimerRef.current = null;
      }
      if (overlayReadyTimerRef.current) {
        clearTimeout(overlayReadyTimerRef.current);
        overlayReadyTimerRef.current = null;
      }
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
        {thumbnailUri ? (
          <Image
            source={{ uri: thumbnailUri }}
            style={styles.hlsWaitingBackground}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.hlsWaitingOverlay}>
          <ActivityIndicator color="#a77df8" size="large" />
          <Text style={styles.hlsWaitingText}>Waiting for live video…</Text>
          <Text style={styles.hlsWaitingHint}>
            {isCameraLive
              ? 'The host may still be starting the stream.'
              : 'Screen share may take 15–30 seconds to appear after the host starts sharing.'}
          </Text>
          <Text style={styles.hlsStateText}>State: {hlsStateText}</Text>
          {waitSeconds >= 20 ? (
            <Text style={styles.hlsTroubleshoot}>
              Taking longer than expected. Confirm the host has started broadcasting.
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.hlsVideoWrap,
        isCameraLive ? styles.hlsVideoMirror : styles.hlsVideoScreen,
      ]}
    >
      <VideoView
        player={player}
        style={styles.hlsVideo}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      {playbackError ? (
        <View style={styles.hlsPlaybackErrorOverlay} pointerEvents="none">
          <Feather name="video-off" size={40} color="#888" />
          <Text style={styles.hlsPlaybackErrorText}>{playbackError}</Text>
          <Text style={styles.hlsStateText}>{hlsStateText}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LiveViewerJoinedLayers({
  streamId,
  showChat,
  displayName,
  liveMode,
}) {
  const insets = useSafeAreaInsets();
  const { localParticipant } = useMeeting();
  const localMode = String(localParticipant?.mode || '').toUpperCase();
  const localIsSpeaker =
    localMode === 'SEND_AND_RECV' ||
    localMode === 'SEND_RECV' ||
    localMode === 'CONFERENCE';
  const isScreenLive = liveMode === 'screen';
  const chatLayout = getViewerLiveChatLayout(insets, { compact: isScreenLive });

  return (
    <>
      <LiveCoHostInviteListener />
      {localIsSpeaker ? <LiveCoHostGuestMedia /> : null}
      <LiveStreamChatOverlay
        streamId={streamId}
        displayName={displayName}
        visible={showChat}
        bottomOffset={chatLayout.chatBottomOffset}
        messageMaxHeight={chatLayout.messageMaxHeight}
        compact={isScreenLive}
      />
      <LiveStreamHeartReactions
        streamId={streamId}
        isHost={false}
        bottomOffset={chatLayout.chatBottomOffset - 8}
      />
    </>
  );
}

function LiveViewerInMeeting({
  streamId,
  liveMode,
  thumbnailUri,
  onPlaybackEnded,
  showChat = true,
  displayName = 'Viewer',
}) {
  const [overlaysReady, setOverlaysReady] = useState(false);

  return (
    <View style={styles.viewerMeetingRoot}>
      <LiveHlsViewerInner
        liveMode={liveMode}
        thumbnailUri={thumbnailUri}
        onPlaybackEnded={onPlaybackEnded}
        onOverlaysReady={() => setOverlaysReady(true)}
      />
      {overlaysReady ? (
        <LiveViewerJoinedLayers
          streamId={streamId}
          showChat={showChat}
          displayName={displayName}
          liveMode={liveMode}
        />
      ) : null}
    </View>
  );
}

export default function LiveStreamPlayerImpl({ stream, onClose, showChat = true }) {
  const { user } = useGlobalContext();
  const insets = useSafeAreaInsets();
  const effectiveRoomId = stream?.videosdkRoomId || null;
  const liveMode = stream?.liveMode === 'screen' ? 'screen' : 'camera';
  const viewerChatLayout = getViewerLiveChatLayout(insets, {
    compact: liveMode === 'screen',
  });
  const streamThumbnailUri = resolveLiveStreamThumbnailUrl(stream);
  const [viewerCount, setViewerCount] = useState(stream?.viewerCount || 0);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [token, setToken] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const playbackEndedRef = useRef(false);
  const viewerParticipantId = buildLiveViewerParticipantId(stream?.$id, user?.$id);

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
    setTokenLoading(true);
    (async () => {
      try {
        const meetingToken = await getVideoSDKToken(
          effectiveRoomId,
          viewerParticipantId,
          {
            purpose: 'live',
            streamId: stream?.$id,
            userId: user.$id,
          }
        );
        if (cancelled) return;
        if (meetingToken) {
          const validation = validateMeetingToken(meetingToken, effectiveRoomId, {
            requireMod: false,
          });
          if (!validation.ok) {
            if (!cancelled) setTokenError(validation.error);
            return;
          }
          if (!cancelled) {
            setToken(meetingToken);
          }
          return;
        }
        if (!cancelled) setTokenError(VIDEOSDK_TOKEN_SETUP_MESSAGE);
      } catch (e) {
        if (!cancelled) setTokenError(e?.message || 'Token error');
      } finally {
        if (!cancelled) setTokenLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveRoomId, user?.$id, viewerParticipantId, stream?.$id]);

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
        {streamThumbnailUri ? (
          <Image
            source={{ uri: streamThumbnailUri }}
            style={styles.connectingBackground}
            resizeMode="cover"
          />
        ) : null}
        <View style={styles.connectingOverlay}>
          <ActivityIndicator color="#a77df8" />
          <Text style={styles.loadingLabel}>Connecting to live room…</Text>
        </View>
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
          key={`${effectiveRoomId}-${viewerParticipantId}`}
          config={{
            meetingId: effectiveRoomId,
            micEnabled: false,
            webcamEnabled: false,
            name: user.username || user.$id || 'Viewer',
            mode: 'RECV_ONLY',
            debugMode: false,
            ...(Platform.OS === 'android'
              ? {
                  notification: {
                    title: 'ASAB Live',
                    message: 'Watching live',
                  },
                }
              : {}),
          }}
          token={token}
        >
          <LiveViewerInMeeting
            streamId={stream.$id}
            liveMode={liveMode}
            thumbnailUri={streamThumbnailUri}
            onPlaybackEnded={handlePlaybackEnded}
            showChat={showChat}
            displayName={user.username || 'Viewer'}
          />
        </MeetingProvider>

        <View style={styles.viewerBadge} pointerEvents="none">
          <Feather name="eye" size={14} color="#fff" style={styles.viewerBadgeIcon} />
          <Text style={styles.viewerBadgeText}>{viewerCount}</Text>
        </View>

        {onClose && (
          <TouchableOpacity style={styles.closeFab} onPress={onClose}>
            <Feather name="x" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.bottomOverlay, { paddingBottom: viewerChatLayout.hostOverlayPadding }]}>
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
  connectingBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  connectingOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    ...StyleSheet.absoluteFillObject,
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
  hlsVideoWrap: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  hlsVideoMirror: {
    transform: [{ scaleX: -1 }],
  },
  hlsVideoScreen: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  hlsVideo: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  hlsWaiting: {
    flex: 1,
    minHeight: height * 0.45,
    backgroundColor: '#0a0a0a',
  },
  hlsWaitingBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  hlsWaitingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
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
  hlsPlaybackErrorOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 24,
  },
  hlsPlaybackErrorText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  viewerBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewerBadgeIcon: {
    marginRight: 6,
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

import React, { useState, useEffect, useRef } from 'react';
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
import { MeetingProvider, useMeeting } from '@videosdk.live/react-native-sdk';
import { useGlobalContext } from '../context/GlobalProvider';
import {
  subscribeLiveStreamUpdates,
  followStreamer,
  unfollowStreamer,
  isFollowing,
  getFollowerCount,
} from '../lib/livestream';
import { VIDEOSDK_CONFIG, VIDEOSDK_TOKEN_SETUP_MESSAGE } from '../lib/config';
import { getVideoSDKToken } from '../lib/videosdkHelper';
import { images } from '../constants';

const { height } = Dimensions.get('window');
const TOKEN_ENDPOINT_HINT = `Token URL: ${VIDEOSDK_CONFIG.tokenServerUrl || 'missing'}${
  VIDEOSDK_CONFIG.tokenPath || ''
}`;

function pickHlsUrl(hlsUrls) {
  if (!hlsUrls) return null;
  const u =
    hlsUrls.downstreamUrl ||
    hlsUrls.playbackHlsUrl ||
    hlsUrls.livestreamUrl;
  return typeof u === 'string' && u.length > 0 ? u : null;
}

function LiveHlsViewerInner({ onPlaybackEnded }) {
  const [hlsUrl, setHlsUrl] = useState(null);
  const [hlsStateText, setHlsStateText] = useState('CONNECTING');
  const [waitSeconds, setWaitSeconds] = useState(0);
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
    p.muted = false;
  });

  const { join, leave, hlsUrls } = useMeeting({
    onMeetingJoined: () => setHlsStateText('MEETING_JOINED'),
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
    onError: () => {
      setHlsStateText('ERROR');
      onPlaybackEnded?.();
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
        if (!cancelled) player.play();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hlsUrl, player]);

  useEffect(() => {
    Promise.resolve(join()).catch((e) => {
      console.error('[LiveViewer] join failed', e);
      setHlsStateText('ERROR');
      onPlaybackEnded?.();
    });
    return () => {
      try {
        leave();
      } catch (_) {}
    };
  }, [join, leave]);

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
      style={styles.hlsVideo}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

export default function LiveStreamPlayerImpl({ stream, onClose }) {
  const { user } = useGlobalContext();
  const effectiveRoomId = stream?.videosdkRoomId || null;
  const [viewerCount, setViewerCount] = useState(stream?.viewerCount || 0);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [token, setToken] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
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
    setTokenLoading(true);
    (async () => {
      try {
        const t = await getVideoSDKToken(effectiveRoomId, user.$id);
        if (cancelled) return;
        if (t) {
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
          config={{
            meetingId: effectiveRoomId,
            participantId: user.$id,
            micEnabled: false,
            webcamEnabled: false,
            name: user.username || user.$id || 'Viewer',
            mode: 'VIEWER',
            notification: {
              title: 'ASAB Live',
              message: 'Watching live',
            },
          }}
          token={authToken}
        >
          <LiveHlsViewerInner onPlaybackEnded={handlePlaybackEnded} />
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

      <View style={styles.bottomOverlay}>
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
    paddingBottom: 120,
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

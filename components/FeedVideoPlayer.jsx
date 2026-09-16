import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, Image, Platform, View } from 'react-native';
import { VideoView, useVideoPlayer, isPictureInPictureSupported } from 'expo-video';
import { buildFeedVideoSource, isHlsVideoUri } from '../lib/feedVideoSource';

function configurePlayer(player, { isLooping, isMuted, isHls }) {
  player.loop = isLooping;
  player.muted = isMuted;
  player.timeUpdateEventInterval = 0.5;
  // Never keep feed audio alive after the app is backgrounded/closed unless
  // we are actively inside a PiP session (set only in onPictureInPictureStart).
  player.staysActiveInBackground = false;
  if (Platform.OS === 'ios') {
    player.bufferOptions = isHls
      ? {
          preferredForwardBufferDuration: 2,
          waitsToMinimizeStalling: false,
        }
      : {
          // Raw Appwrite MOV/MP4 files need metadata (often at end of file) before play.
          preferredForwardBufferDuration: 8,
          waitsToMinimizeStalling: true,
        };
    player.audioMixingMode = 'mixWithOthers';
    player.showNowPlayingNotification = false;
  }
}

const FeedVideoPlayer = forwardRef(function FeedVideoPlayer(
  {
    videoUrl,
    posterUri,
    shouldPlay = false,
    loadSource = true,
    isLooping = true,
    isMuted = false,
    /** Kept for API compatibility; feed no longer auto-PiPs (caused ghost audio). */
    enablePiP = false,
    onPlaybackUpdate,
    onReady,
    onError,
  },
  ref
) {
  const videoViewRef = useRef(null);
  const isInPipRef = useRef(false);
  const shouldPlayRef = useRef(shouldPlay);
  const appStateRef = useRef(AppState.currentState);
  const isMutedRef = useRef(isMuted);
  const [showPoster, setShowPoster] = useState(Boolean(posterUri));

  const videoSource = useMemo(
    () => (loadSource && videoUrl ? buildFeedVideoSource(videoUrl) : null),
    [loadSource, videoUrl]
  );
  const isHls = isHlsVideoUri(videoUrl);

  const player = useVideoPlayer(videoSource, (instance) => {
    configurePlayer(instance, {
      isLooping,
      isMuted: isMutedRef.current,
      isHls,
    });
    if (
      shouldPlayRef.current &&
      appStateRef.current !== 'background' &&
      videoSource
    ) {
      try {
        instance.play();
      } catch (_) {}
    }
  });

  const hardStop = useCallback(() => {
    isInPipRef.current = false;
    try {
      player.staysActiveInBackground = false;
    } catch (_) {}
    if (Platform.OS === 'ios') {
      try {
        player.showNowPlayingNotification = false;
      } catch (_) {}
    }
    try {
      player.pause();
    } catch (_) {}
    try {
      player.muted = true;
    } catch (_) {}
    try {
      videoViewRef.current?.stopPictureInPicture?.().catch(() => {});
    } catch (_) {}
  }, [player]);

  useEffect(() => {
    shouldPlayRef.current = shouldPlay;
  }, [shouldPlay]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Leave / close app → stop feed audio. Do not treat iOS `inactive`
  // (Control Center, screenshot, notification shade) as a full stop.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'background' && previousState !== 'background') {
        hardStop();
        return;
      }

      if (nextState === 'active' && previousState !== 'active') {
        try {
          player.muted = isMutedRef.current;
        } catch (_) {}
        if (shouldPlayRef.current) {
          try {
            player.play();
          } catch (_) {}
        }
      }
    });

    return () => subscription.remove();
  }, [hardStop, player]);

  useImperativeHandle(
    ref,
    () => ({
      playAsync: async () => {
        try {
          player.play();
        } catch (_) {}
      },
      pauseAsync: async () => {
        try {
          player.pause();
        } catch (_) {}
      },
      setPositionAsync: async (millis) => {
        try {
          player.currentTime = Math.max(0, millis) / 1000;
        } catch (_) {}
      },
      getStatusAsync: async () => ({
        isLoaded: true,
        positionMillis: Math.round((player.currentTime || 0) * 1000),
        durationMillis: Math.round((player.duration || 0) * 1000),
      }),
    }),
    [player]
  );

  const tryPlay = useCallback(() => {
    if (!shouldPlayRef.current) return;
    if (appStateRef.current === 'background') return;
    try {
      player.muted = isMutedRef.current;
      player.play();
    } catch (_) {}
  }, [player]);

  useEffect(() => {
    setShowPoster(Boolean(posterUri));
  }, [videoUrl, posterUri]);

  useEffect(() => {
    configurePlayer(player, { isLooping, isMuted, isHls });
  }, [isLooping, isMuted, isHls, player]);

  useEffect(() => {
    if (!player) return;

    if (shouldPlay) {
      tryPlay();
      const retries = [300, 1000, 2500].map((ms) => setTimeout(tryPlay, ms));
      return () => retries.forEach(clearTimeout);
    }

    try {
      player.pause();
    } catch (_) {}
  }, [shouldPlay, player, videoSource, tryPlay]);

  const handlePlaybackUpdate = useCallback(
    (payload) => {
      onPlaybackUpdate?.(payload);
    },
    [onPlaybackUpdate]
  );

  const handleReady = useCallback(
    (payload) => {
      onReady?.(payload);
    },
    [onReady]
  );

  const handleError = useCallback(() => {
    onError?.();
  }, [onError]);

  useEffect(() => {
    const subscription = player.addListener('timeUpdate', (event) => {
      handlePlaybackUpdate({
        positionMillis: Math.round((event.currentTime || 0) * 1000),
        durationMillis: Math.round((player.duration || 0) * 1000),
      });
    });
    return () => subscription.remove();
  }, [player, handlePlaybackUpdate]);

  useEffect(() => {
    const subscription = player.addListener('sourceLoad', (event) => {
      handleReady({
        durationMillis: Math.round((event.duration || player.duration || 0) * 1000),
      });
      tryPlay();
    });
    return () => subscription.remove();
  }, [player, handleReady, tryPlay]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', (event) => {
      if (event.status === 'readyToPlay') {
        tryPlay();
      }
      if (event.status === 'error') {
        handleError();
      }
    });
    return () => subscription.remove();
  }, [player, tryPlay, handleError]);

  // Hard-stop when this feed item unmounts so audio cannot linger.
  useEffect(() => {
    return () => {
      hardStop();
    };
  }, [hardStop]);

  const handlePictureInPictureStart = () => {
    // Manual / system PiP only — keep audio alive while the tiny window is open.
    isInPipRef.current = true;
    try {
      player.staysActiveInBackground = true;
    } catch (_) {}
  };

  const handlePictureInPictureStop = () => {
    isInPipRef.current = false;
    try {
      player.staysActiveInBackground = false;
      player.showNowPlayingNotification = false;
    } catch (_) {}
    const appActive = appStateRef.current === 'active';
    if (appActive && shouldPlayRef.current) {
      try {
        player.muted = isMutedRef.current;
        player.play();
      } catch (_) {}
      return;
    }
    hardStop();
  };

  return (
    <View style={{ width: '100%', height: '100%', backgroundColor: '#000' }}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        nativeControls={false}
        allowsVideoFrameAnalysis={false}
        allowsPictureInPicture={enablePiP && isPictureInPictureSupported()}
        startsPictureInPictureAutomatically={false}
        fullscreenOptions={{ enable: true }}
        onPictureInPictureStart={handlePictureInPictureStart}
        onPictureInPictureStop={handlePictureInPictureStop}
        onFirstFrameRender={() => setShowPoster(false)}
      />
      {showPoster && posterUri ? (
        <Image
          pointerEvents="none"
          source={{ uri: posterUri }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100%',
          }}
          resizeMode="contain"
        />
      ) : null}
    </View>
  );
});

export default FeedVideoPlayer;

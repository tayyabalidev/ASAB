import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { AppState, Image, Platform, View } from 'react-native';
import { VideoView, useVideoPlayer, isPictureInPictureSupported } from 'expo-video';
import { buildFeedVideoSource } from '../lib/feedVideoSource';

function configurePlayerForPiP(player, { isLooping, isMuted, enablePiP }) {
  player.loop = isLooping;
  player.muted = isMuted;
  player.timeUpdateEventInterval = 0.5;
  if (Platform.OS === 'ios') {
    player.bufferOptions = {
      preferredForwardBufferDuration: 2,
      waitsToMinimizeStalling: false,
    };
  }
  if (enablePiP) {
    player.staysActiveInBackground = true;
    if (Platform.OS === 'ios') {
      // mixWithOthers keeps feed PiP from blocking WebRTC live / calls on go-live.
      player.audioMixingMode = 'mixWithOthers';
      player.showNowPlayingNotification = false;
    }
  } else {
    player.staysActiveInBackground = false;
    if (Platform.OS === 'ios') {
      player.showNowPlayingNotification = false;
    }
  }
}

const IOS_PIP_RETRY_DELAYS_MS = [0, 200, 500, 1000];

const FeedVideoPlayer = forwardRef(function FeedVideoPlayer(
  {
    videoUrl,
    posterUri,
    shouldPlay = false,
    loadSource = true,
    isLooping = true,
    isMuted = false,
    enablePiP = true,
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
  const pipEligibleRef = useRef(false);
  const pipRetryTimersRef = useRef([]);
  const [showPoster, setShowPoster] = useState(Boolean(posterUri));

  const player = useVideoPlayer(null, (instance) => {
    configurePlayerForPiP(instance, { isLooping, isMuted, enablePiP });
  });

  const clearPipRetries = useCallback(() => {
    pipRetryTimersRef.current.forEach(clearTimeout);
    pipRetryTimersRef.current = [];
  }, []);

  const updatePipEligibility = useCallback(() => {
    pipEligibleRef.current =
      enablePiP && (shouldPlayRef.current || player.playing);
  }, [enablePiP, player]);

  useEffect(() => {
    shouldPlayRef.current = shouldPlay;
    updatePipEligibility();
  }, [shouldPlay, updatePipEligibility]);

  useEffect(() => {
    if (!player || !enablePiP) return undefined;
    updatePipEligibility();
    const subscription = player.addListener('playingChange', () => {
      updatePipEligibility();
    });
    return () => subscription.remove();
  }, [player, enablePiP, updatePipEligibility]);

  const requestPictureInPicture = useCallback(() => {
    if (!enablePiP || isInPipRef.current) return;
    if (!pipEligibleRef.current && !player.playing) return;
    if (Platform.OS === 'ios' && !isPictureInPictureSupported()) return;

    try {
      player.play();
    } catch (_) {}

    clearPipRetries();

    const delays =
      Platform.OS === 'ios'
        ? IOS_PIP_RETRY_DELAYS_MS
        : Platform.OS === 'android' && Platform.Version < 31
          ? [0]
          : [];

    delays.forEach((delay) => {
      const timerId = setTimeout(() => {
        if (isInPipRef.current) return;
        if (appStateRef.current === 'active') return;
        if (!pipEligibleRef.current && !player.playing) return;
        videoViewRef.current?.startPictureInPicture?.().catch(() => {});
      }, delay);
      pipRetryTimersRef.current.push(timerId);
    });
  }, [clearPipRetries, enablePiP, player]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (!enablePiP) return;

      if (
        (nextState === 'inactive' || nextState === 'background') &&
        previousState === 'active'
      ) {
        if (!pipEligibleRef.current && !player.playing) return;

        // iOS: auto PiP often needs an explicit start; inactive fires before background.
        if (Platform.OS === 'ios') {
          requestPictureInPicture();
          return;
        }

        // Android 11 and below do not auto-enter PiP.
        if (Platform.OS === 'android' && Platform.Version < 31) {
          requestPictureInPicture();
        }
      }
    });

    return () => {
      subscription.remove();
      clearPipRetries();
    };
  }, [clearPipRetries, enablePiP, player, requestPictureInPicture]);

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
          if (!isInPipRef.current) {
            player.pause();
          }
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
    if (!shouldPlayRef.current && !isInPipRef.current) return;
    try {
      player.play();
    } catch (_) {}
  }, [player]);

  useEffect(() => {
    if (!videoUrl || !loadSource) return;
    setShowPoster(Boolean(posterUri));
    try {
      player.replace(buildFeedVideoSource(videoUrl));
    } catch (_) {}
  }, [videoUrl, player, posterUri, loadSource]);

  useEffect(() => {
    configurePlayerForPiP(player, { isLooping, isMuted, enablePiP });
  }, [isLooping, isMuted, enablePiP, player]);

  useEffect(() => {
    if (!player) return undefined;

    if (shouldPlay || isInPipRef.current) {
      tryPlay();
      return undefined;
    }

    // Let native PiP keep playing while the app is in the background.
    if (enablePiP && appStateRef.current !== 'active') {
      return undefined;
    }

    try {
      player.pause();
      if (enablePiP && !isInPipRef.current) {
        videoViewRef.current?.stopPictureInPicture?.().catch(() => {});
      }
    } catch (_) {}
    return undefined;
  }, [shouldPlay, player, enablePiP, tryPlay]);

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
    });
    return () => subscription.remove();
  }, [player, tryPlay]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', (event) => {
      if (event.status === 'error') {
        handleError();
      }
    });
    return () => subscription.remove();
  }, [player, handleError]);

  // Hard-stop when this feed item unmounts (scrolled away / left home) so audio cannot linger.
  useEffect(() => {
    return () => {
      clearPipRetries();
      isInPipRef.current = false;
      try {
        player.staysActiveInBackground = false;
        player.showNowPlayingNotification = false;
      } catch (_) {}
      try {
        player.pause();
      } catch (_) {}
      try {
        videoViewRef.current?.stopPictureInPicture?.().catch(() => {});
      } catch (_) {}
    };
  }, [player, clearPipRetries]);

  const handlePictureInPictureStart = () => {
    isInPipRef.current = true;
    clearPipRetries();
    try {
      player.staysActiveInBackground = true;
    } catch (_) {}
    if (Platform.OS === 'ios') {
      try {
        player.showNowPlayingNotification = true;
      } catch (_) {}
    }
    try {
      player.play();
    } catch (_) {}
  };

  const handlePictureInPictureStop = () => {
    isInPipRef.current = false;
    if (Platform.OS === 'ios') {
      try {
        player.showNowPlayingNotification = false;
      } catch (_) {}
    }
    // Closing the small PiP window must stop audio when the app is not on that video.
    // Previously we kept playing if shouldPlay was still true while backgrounded → ghost audio.
    const appActive = appStateRef.current === 'active';
    if (appActive && shouldPlayRef.current) {
      try {
        player.play();
      } catch (_) {}
      return;
    }
    try {
      player.pause();
      player.staysActiveInBackground = false;
    } catch (_) {}
    try {
      videoViewRef.current?.stopPictureInPicture?.().catch(() => {});
    } catch (_) {}
  };

  return (
    <View style={{ width: '100%', height: '100%' }}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={enablePiP}
        startsPictureInPictureAutomatically={enablePiP}
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

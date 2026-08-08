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

function configurePlayer(player, { isLooping, isMuted }) {
  player.loop = isLooping;
  player.muted = isMuted;
  player.timeUpdateEventInterval = 0.5;
  // Never keep feed audio alive after the app is backgrounded/closed unless
  // we are actively inside a PiP session (set only in onPictureInPictureStart).
  player.staysActiveInBackground = false;
  if (Platform.OS === 'ios') {
    player.bufferOptions = {
      preferredForwardBufferDuration: 2,
      waitsToMinimizeStalling: false,
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
  const [showPoster, setShowPoster] = useState(Boolean(posterUri));

  const player = useVideoPlayer(null, (instance) => {
    configurePlayer(instance, { isLooping, isMuted });
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

  // Leave / close app → always stop feed audio (no ghost playback).
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        (nextState === 'inactive' || nextState === 'background') &&
        previousState === 'active'
      ) {
        hardStop();
        return;
      }

      if (nextState === 'active' && previousState !== 'active') {
        try {
          player.muted = isMuted;
        } catch (_) {}
        if (shouldPlayRef.current) {
          try {
            player.play();
          } catch (_) {}
        }
      }
    });

    return () => subscription.remove();
  }, [hardStop, player, isMuted]);

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
    if (appStateRef.current !== 'active') return;
    try {
      player.muted = isMuted;
      player.play();
    } catch (_) {}
  }, [player, isMuted]);

  useEffect(() => {
    if (!videoUrl || !loadSource) return;
    setShowPoster(Boolean(posterUri));
    try {
      player.replace(buildFeedVideoSource(videoUrl));
    } catch (_) {}
  }, [videoUrl, player, posterUri, loadSource]);

  useEffect(() => {
    configurePlayer(player, { isLooping, isMuted });
  }, [isLooping, isMuted, player]);

  useEffect(() => {
    if (!player) return;

    if (shouldPlay && appStateRef.current === 'active') {
      tryPlay();
      return;
    }

    try {
      player.pause();
    } catch (_) {}
  }, [shouldPlay, player, tryPlay]);

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
        player.muted = isMuted;
        player.play();
      } catch (_) {}
      return;
    }
    hardStop();
  };

  return (
    <View style={{ width: '100%', height: '100%' }}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        nativeControls={false}
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

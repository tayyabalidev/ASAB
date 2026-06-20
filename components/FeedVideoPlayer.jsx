import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { AppState, Image, Platform, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { buildFeedVideoSource } from '../lib/feedVideoSource';

function configurePlayerForPiP(player, { isLooping, isMuted, enablePiP }) {
  player.loop = isLooping;
  player.muted = isMuted;
  player.timeUpdateEventInterval = 0.5;
  if (enablePiP) {
    player.staysActiveInBackground = true;
  }
  if (Platform.OS === 'ios') {
    player.bufferOptions = {
      preferredForwardBufferDuration: 2,
      waitsToMinimizeStalling: false,
    };
  }
}

const FeedVideoPlayer = forwardRef(function FeedVideoPlayer(
  {
    videoUrl,
    posterUri,
    shouldPlay = false,
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
  const [showPoster, setShowPoster] = useState(Boolean(posterUri));

  const player = useVideoPlayer(null, (instance) => {
    configurePlayerForPiP(instance, { isLooping, isMuted, enablePiP });
  });

  useEffect(() => {
    shouldPlayRef.current = shouldPlay;
    pipEligibleRef.current = enablePiP && shouldPlay;
  }, [shouldPlay, enablePiP]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;

      if (!enablePiP || nextState !== 'background' || !pipEligibleRef.current) {
        return;
      }

      // Android 11 and below do not auto-enter PiP; request it explicitly.
      if (Platform.OS === 'android' && Platform.Version < 31 && !isInPipRef.current) {
        try {
          player.play();
        } catch (_) {}
        videoViewRef.current?.startPictureInPicture?.().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [enablePiP, player]);

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

  useEffect(() => {
    if (!videoUrl) return;
    setShowPoster(Boolean(posterUri));
    try {
      player.replace(buildFeedVideoSource(videoUrl));
    } catch (_) {}
  }, [videoUrl, player, posterUri]);

  useEffect(() => {
    configurePlayerForPiP(player, { isLooping, isMuted, enablePiP });
  }, [isLooping, isMuted, enablePiP, player]);

  useEffect(() => {
    if (!player) return undefined;

    if (shouldPlay || isInPipRef.current) {
      try {
        player.play();
      } catch (_) {}
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
  }, [shouldPlay, player, enablePiP]);

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
    });
    return () => subscription.remove();
  }, [player, handleReady]);

  useEffect(() => {
    const subscription = player.addListener('statusChange', (event) => {
      if (event.status === 'error') {
        handleError();
      }
    });
    return () => subscription.remove();
  }, [player, handleError]);

  const handlePictureInPictureStart = () => {
    isInPipRef.current = true;
    try {
      player.play();
    } catch (_) {}
  };

  const handlePictureInPictureStop = () => {
    isInPipRef.current = false;
    if (shouldPlayRef.current) {
      try {
        player.play();
      } catch (_) {}
    } else {
      try {
        player.pause();
      } catch (_) {}
    }
  };

  const pipActive = enablePiP && shouldPlay;

  return (
    <View style={{ width: '100%', height: '100%' }}>
      <VideoView
        ref={videoViewRef}
        player={player}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        nativeControls={false}
        allowsPictureInPicture={enablePiP}
        startsPictureInPictureAutomatically={pipActive}
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

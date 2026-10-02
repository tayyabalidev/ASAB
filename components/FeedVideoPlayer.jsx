import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { AppState, Image, View } from 'react-native';
import { Audio, InterruptionModeIOS, ResizeMode, Video } from 'expo-av';

async function enableFeedAudio() {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (_) {}
}

const FeedVideoPlayer = forwardRef(function FeedVideoPlayer(
  {
    videoUrl,
    posterUri,
    shouldPlay = false,
    loadSource = true,
    isLooping = true,
    isMuted = false,
    enablePiP = false,
    onPlaybackUpdate,
    onReady,
    onError,
  },
  ref
) {
  const videoRef = useRef(null);
  const shouldPlayRef = useRef(shouldPlay);
  const appStateRef = useRef(AppState.currentState);
  const readyOnceRef = useRef(false);
  const [showPoster, setShowPoster] = useState(Boolean(posterUri));

  useEffect(() => {
    shouldPlayRef.current = shouldPlay;
  }, [shouldPlay]);

  useEffect(() => {
    readyOnceRef.current = false;
    setShowPoster(Boolean(posterUri));
  }, [videoUrl, posterUri]);

  useEffect(() => {
    if (shouldPlay) {
      enableFeedAudio();
    }
  }, [shouldPlay]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState === 'background') {
        videoRef.current?.pauseAsync?.().catch(() => {});
        return;
      }

      if (nextState === 'active' && previousState !== 'active' && shouldPlayRef.current) {
        enableFeedAudio().then(() => {
          videoRef.current?.playAsync?.().catch(() => {});
        });
      }
    });
    return () => subscription.remove();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      playAsync: async () => {
        try {
          await videoRef.current?.playAsync?.();
        } catch (_) {}
      },
      pauseAsync: async () => {
        try {
          await videoRef.current?.pauseAsync?.();
        } catch (_) {}
      },
      setPositionAsync: async (millis) => {
        try {
          await videoRef.current?.setPositionAsync?.(Math.max(0, millis));
        } catch (_) {}
      },
      getStatusAsync: async () => {
        try {
          return await videoRef.current?.getStatusAsync?.();
        } catch (_) {
          return { isLoaded: false };
        }
      },
    }),
    []
  );

  const handleStatus = useCallback(
    (status) => {
      if (!status) return;
      if (!status.isLoaded) {
        if (status.error) onError?.();
        return;
      }
      if (!readyOnceRef.current && status.durationMillis) {
        readyOnceRef.current = true;
        onReady?.({ durationMillis: status.durationMillis });
      }
      if (status.isPlaying || (status.positionMillis || 0) > 250) {
        setShowPoster(false);
      }
      onPlaybackUpdate?.({
        positionMillis: status.positionMillis || 0,
        durationMillis: status.durationMillis || 0,
      });
    },
    [onError, onReady, onPlaybackUpdate]
  );

  useEffect(() => {
    return () => {
      videoRef.current?.pauseAsync?.().catch(() => {});
      videoRef.current?.unloadAsync?.().catch(() => {});
    };
  }, []);

  if (!loadSource || !videoUrl) {
    return (
      <View style={{ width: '100%', height: '100%', backgroundColor: '#000' }}>
        {posterUri ? (
          <Image
            source={{ uri: posterUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ width: '100%', height: '100%', backgroundColor: '#000' }}>
      <Video
        ref={videoRef}
        source={{ uri: videoUrl }}
        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={shouldPlay && appStateRef.current !== 'background'}
        isLooping={isLooping}
        isMuted={isMuted}
        useNativeControls={false}
        progressUpdateIntervalMillis={500}
        onPlaybackStatusUpdate={handleStatus}
        onError={() => onError?.()}
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

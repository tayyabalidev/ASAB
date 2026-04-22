import { useState, useRef, useEffect } from "react";
import { View, Text } from "react-native";
import Slider from "@react-native-community/slider";

const VideoProgressBar = ({
  videoRef,
  playbackPosition,
  playbackDuration,
  isVideoReady,
  onSeek,
  showProgressBar,
  onShowProgressBar,
  bottomOffset = 90,
  disableAutoHide = false,
}) => {
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const progressBarTimeoutRef = useRef(null);

  // Auto-hide progress bar after 3 seconds
  useEffect(() => {
    if (showProgressBar && !disableAutoHide) {
      if (progressBarTimeoutRef.current) {
        clearTimeout(progressBarTimeoutRef.current);
      }
      progressBarTimeoutRef.current = setTimeout(() => {
        onShowProgressBar(false);
      }, 3000);
    }
    return () => {
      if (progressBarTimeoutRef.current) {
        clearTimeout(progressBarTimeoutRef.current);
      }
    };
  }, [showProgressBar, onShowProgressBar, disableAutoHide]);

  const formatTime = (milliseconds) => {
    if (!milliseconds || isNaN(milliseconds)) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleSeekChange = (position) => {
    if (playbackDuration > 0) {
      const newPosition = Math.floor((position / 100) * playbackDuration);
      setSeekPosition(newPosition);
    }
  };

  const handleSeekComplete = async (position) => {
    if (!videoRef.current || !isVideoReady || playbackDuration <= 0) {
      setIsSeeking(false);
      return;
    }

    try {
      const seekPositionMillis = Math.max(0, Math.floor((position / 100) * playbackDuration));
      
      // Call the onSeek callback if provided
      if (onSeek) {
        await onSeek(seekPositionMillis);
      } else {
        // Default seek behavior
        await videoRef.current.setPositionAsync(seekPositionMillis);
      }
      
      setSeekPosition(seekPositionMillis);
    } catch (error) {
      // Error handling
    } finally {
      setTimeout(() => {
        setIsSeeking(false);
      }, 200);
    }
  };

  if (!showProgressBar || !isVideoReady || playbackDuration <= 0) {
    return null;
  }

  return (
    <View
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 0,
        right: 0,
        paddingHorizontal: 15,
        paddingBottom: 20,
        paddingTop: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 30,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
        <Text style={{ color: '#fff', fontSize: 12, marginRight: 10, minWidth: 40 }}>
          {formatTime(isSeeking ? seekPosition : playbackPosition)}
        </Text>
        <View style={{ flex: 1 }}>
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={0}
            maximumValue={100}
            value={playbackDuration > 0 ? (isSeeking ? (seekPosition / playbackDuration) * 100 : (playbackPosition / playbackDuration) * 100) : 0}
            onValueChange={handleSeekChange}
            onSlidingStart={handleSeekStart}
            onSlidingComplete={handleSeekComplete}
            minimumTrackTintColor="#fff"
            maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
            thumbTintColor="#fff"
            step={0.1}
            disabled={!isVideoReady || playbackDuration <= 0}
          />
        </View>
        <Text style={{ color: '#fff', fontSize: 12, marginLeft: 10, minWidth: 40 }}>
          {formatTime(playbackDuration)}
        </Text>
      </View>
    </View>
  );
};

export default VideoProgressBar;

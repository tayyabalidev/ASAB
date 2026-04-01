import { useState, useRef, useEffect } from "react";
import { ResizeMode, Video } from "expo-av";
import { View, Text, TouchableOpacity, Image, Alert, Share, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { icons } from "../constants";
import { addBookmark, isVideoBookmarked, incrementShareCount } from "../lib/appwrite";
import { useGlobalContext } from "../context/GlobalProvider";
import VideoProgressBar from "./VideoProgressBar";

const getPlaybackCandidates = (url) => {
  if (!url) return [];
  if (!url.includes("/storage/buckets/") || !url.includes("/files/")) return [url];
  const viewUrl = url.replace("/download", "/view");
  const downloadUrl = url.replace("/view", "/download");
  return [...new Set([viewUrl, downloadUrl, url])];
};

const VideoCard = ({ title, creator, avatar, thumbnail, video, $id: videoId, creatorId }) => {
  const [play, setPlay] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoSourceIndex, setVideoSourceIndex] = useState(0);
  const videoRef = useRef(null);
  const videoPlaybackCandidates = getPlaybackCandidates(video);
  const activeVideoUri = videoPlaybackCandidates[videoSourceIndex] || video;
  const { user } = useGlobalContext();

  useEffect(() => {
    setVideoSourceIndex(0);
  }, [videoId, video]);

  const shareVideo = async () => {
    try {
      const result = await Share.share({
        message: `Check out this video: ${title} by ${creator}\n${video}`,
        title: title,
      });
      
      if (result.action === Share.sharedAction) {
      
        // Increment share count in database
        try {
          await incrementShareCount(videoId);
         
        } catch (shareError) {
          
          // Don't show error to user since sharing was successful
        }
      }
    } catch (error) {
      
      Alert.alert("Error", "Failed to share video");
    }
  };

  const bookmarkVideo = async () => {
    try {
      if (!user || !user.$id) {
        Alert.alert("Error", "Please login to bookmark videos");
        return;
      }

      // Check if already bookmarked
      const isBookmarked = await isVideoBookmarked(user.$id, videoId);
      
      if (isBookmarked) {
        Alert.alert("Info", "Video is already bookmarked!");
        return;
      }

      // Add bookmark
      const videoData = {
        title,
        creator,
        avatar,
        thumbnail,
        video,
        videoId
      };

      await addBookmark(user.$id, videoId, videoData);
      Alert.alert("Success", "Video added to bookmarks!");
    } catch (error) {
      
      Alert.alert("Error", "Failed to bookmark video");
    }
  };

  const reportVideo = async () => {
    try {
      // TODO: Implement report functionality with Appwrite
      
      Alert.alert("Success", "Video reported successfully!");
    } catch (error) {
      
      Alert.alert("Error", "Failed to report video");
    }
  };

  const handleMenuPress = () => {
    Alert.alert(
      "Video Options",
      "What would you like to do?",
      [
        {
          text: "Share",
          onPress: shareVideo,
        },
        {
          text: "Bookmark",
          onPress: bookmarkVideo,
        },
        {
          text: "Report",
          onPress: reportVideo,
          style: "destructive",
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  const handleProfilePress = () => {
    if (creatorId && creatorId !== user?.$id) {
      router.push(`/profile/${creatorId}`);
    }
  };

  const handleVideoPress = () => {
    // Only show progress bar when video is tapped, don't pause/play
    setShowProgressBar(true);
  };

  const handlePausePlay = () => {
    setPlay((prev) => !prev);
    setShowProgressBar(true);
  };

  return (
    <View className="flex flex-col items-center px-4 mb-14">
      <View className="flex flex-row gap-3 items-start">
        <View className="flex justify-center items-center flex-row flex-1">
          <TouchableOpacity 
            onPress={handleProfilePress}
            activeOpacity={0.7}
            className="w-[46px] h-[46px] rounded-lg border border-secondary flex justify-center items-center p-0.5"
          >
            <Image
              source={{ uri: avatar }}
              className="w-full h-full rounded-lg"
              resizeMode="cover"
            />
          </TouchableOpacity>

          <View className="flex justify-center flex-1 ml-3 gap-y-1">
            <Text
              className="font-psemibold text-sm text-white"
              numberOfLines={1}
            >
              {title}
            </Text>
            <TouchableOpacity onPress={handleProfilePress} activeOpacity={0.7}>
              <Text
                className="text-xs text-gray-100 font-pregular"
                numberOfLines={1}
              >
                {creator}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          className="pt-2" 
          onPress={handleMenuPress}
          activeOpacity={0.7}
        >
          <Image source={icons.menu} className="w-5 h-5" resizeMode="contain" />
        </TouchableOpacity>
      </View>

      {play ? (
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleVideoPress}
          className="w-full h-60 rounded-xl mt-3 relative"
        >
          <Video
            ref={videoRef}
            source={{ uri: activeVideoUri }}
            className="w-full h-full rounded-xl"
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls={false}
            shouldPlay={play}
            isLooping={true}
            isMuted={isMuted}
            progressUpdateIntervalMillis={500}
            posterSource={thumbnail ? { uri: thumbnail } : undefined}
            usePoster={!isVideoReady}
            {...(Platform.OS === "ios" && {
              allowsExternalPlayback: false,
              playInSilentModeIOS: true,
              ignoreSilentSwitch: "ignore",
              automaticallyWaitsToMinimizeStalling: false,
              preferredForwardBufferDuration: 1,
            })}
            onLoad={(status) => {
              if (status.isLoaded) {
                setPlaybackDuration(status.durationMillis || 0);
                setIsVideoReady(true);
              }
            }}
            onError={() => {
              if (videoSourceIndex < videoPlaybackCandidates.length - 1) {
                setVideoSourceIndex((prev) => prev + 1);
                setIsVideoReady(false);
              }
            }}
            onPlaybackStatusUpdate={(status) => {
              if (status.isLoaded) {
                setPlaybackPosition(status.positionMillis || 0);
                if (status.durationMillis) {
                  setPlaybackDuration(status.durationMillis);
                }
              }
            }}
          />
          {/* Mute Button */}
          <TouchableOpacity
            onPress={() => setIsMuted(!isMuted)}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 flex justify-center items-center z-10"
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={isMuted ? "volume-off" : "volume-high"}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>
          {/* Progress Bar */}
          <VideoProgressBar
            videoRef={videoRef}
            playbackPosition={playbackPosition}
            playbackDuration={playbackDuration}
            isVideoReady={isVideoReady}
            showProgressBar={showProgressBar}
            onShowProgressBar={setShowProgressBar}
            bottomOffset={10}
          />
          {/* Play/Pause Button */}
          <TouchableOpacity
            onPress={handlePausePlay}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: [{ translateX: -25 }, { translateY: -25 }],
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 20
            }}
            activeOpacity={0.7}
          >
            <Text style={{ color: '#fff', fontSize: 24 }}>
              {play ? '❚❚' : '▶'}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setPlay(true);
            setPlayCount(0);
            setIsMuted(false);
            setShowProgressBar(true);
          }}
          className="w-full h-60 rounded-xl mt-3 relative flex justify-center items-center"
        >
          <Image
            source={{ uri: thumbnail }}
            className="w-full h-full rounded-xl mt-3"
            resizeMode="cover"
          />

          <Image
            source={icons.play}
            className="w-12 h-12 absolute"
            resizeMode="contain"
          />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default VideoCard;

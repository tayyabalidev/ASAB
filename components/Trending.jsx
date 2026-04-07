import { useEffect, useMemo, useState } from "react";
import { ResizeMode, Video } from "expo-av";
import * as Animatable from "react-native-animatable";
import {
  FlatList,
  Image,
  ImageBackground,
  TouchableOpacity,
  View,
} from "react-native";

import { icons } from "../constants";
import { isVideoMedia, isMuxPlaceholderVideo } from "../lib/mediaType";
import { getIOSCompatibleVideoUrl, getVideoPosterUri, getVideoPlaybackUrls } from "../lib/appwrite";
import { getPlaybackUriForPost } from "../lib/muxPlayback";

const getPlaybackCandidates = (url) => {
  if (!url) return [];
  if (!url.includes("/storage/buckets/") || !url.includes("/files/")) return [url];
  const viewUrl = url.replace("/download", "/view");
  const downloadUrl = url.replace("/view", "/download");
  return [...new Set([viewUrl, downloadUrl, url])];
};

const zoomIn = {
  0: {
    scale: 0.9,
  },
  1: {
    scale: 1,
  },
};

const zoomOut = {
  0: {
    scale: 1,
  },
  1: {
    scale: 0.9,
  },
};

const TrendingItem = ({ activeItem, item }) => {
  const [play, setPlay] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const isVideo = isVideoMedia(item?.video, item?.postType || "video");
  const videoPosterUri = useMemo(
    () => getVideoPosterUri(item?.thumbnail, item?.video),
    [item?.thumbnail, item?.video]
  );
  const thumbUri = isVideo
    ? videoPosterUri || item?.photo || null
    : item?.photo || item?.thumbnail || null;
  const resolvedStream = useMemo(
    () =>
      getPlaybackUriForPost(item) ||
      (!isMuxPlaceholderVideo(item?.video)
        ? item?.video
        : null),
    [item?.video, item?.mux_playback_id, item?.muxPlaybackId]
  );
  const videoCandidates = useMemo(() => {
    if (!resolvedStream) return [];
    return getVideoPlaybackUrls(resolvedStream);
  }, [resolvedStream]);
  const activeVideoUri =
    videoCandidates[sourceIndex] ||
    (resolvedStream
      ? getIOSCompatibleVideoUrl(resolvedStream) || resolvedStream
      : null);
  const isActive = activeItem === item.$id;

  useEffect(() => {
    // Autoplay active trending item for instant preview.
    if (isVideo) {
      setPlay(isActive);
    } else {
      setPlay(false);
    }
  }, [isActive, isVideo]);

  useEffect(() => {
    setSourceIndex(0);
  }, [item?.$id, item?.video]);

  return (
    <Animatable.View
      className="mr-5"
      animation={activeItem === item.$id ? zoomIn : zoomOut}
      duration={500}
    >
      {play && isVideo && activeVideoUri ? (
        <Video
          source={{ uri: activeVideoUri }}
          className="w-52 h-72 rounded-[33px] mt-3 bg-white/10"
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay
          isLooping
          progressUpdateIntervalMillis={500}
          posterSource={videoPosterUri ? { uri: videoPosterUri } : undefined}
          usePoster={false}
          onPlaybackStatusUpdate={(status) => {
            if (status.didJustFinish) {
              setPlay(true);
            }
          }}
          onError={() => {
            if (sourceIndex < videoCandidates.length - 1) {
              setSourceIndex((prev) => prev + 1);
            }
          }}
        />
      ) : (
        <TouchableOpacity
          className="relative flex justify-center items-center"
          activeOpacity={0.7}
          onPress={() => {
            if (isVideo) setPlay(true);
          }}
        >
          {thumbUri ? (
          <ImageBackground
            source={{
              uri: thumbUri,
            }}
            className="w-52 h-72 rounded-[33px] my-5 overflow-hidden shadow-lg shadow-black/40"
            resizeMode="cover"
          />
          ) : (
            <View className="w-52 h-72 rounded-[33px] my-5 bg-black/40" />
          )}

          {isVideo && (
            <Image
              source={icons.play}
              className="w-12 h-12 absolute"
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      )}
    </Animatable.View>
  );
};

const Trending = ({ posts }) => {
  const [activeItem, setActiveItem] = useState(posts?.[0]?.$id ?? null);

  const viewableItemsChanged = ({ viewableItems }) => {
    if (viewableItems.length > 0 && viewableItems[0].item?.$id) {
      setActiveItem(viewableItems[0].item.$id);
    }
  };

  return (
    <FlatList
      data={posts}
      horizontal
      keyExtractor={(item) => item.$id}
      renderItem={({ item }) => (
        <TrendingItem activeItem={activeItem} item={item} />
      )}
      onViewableItemsChanged={viewableItemsChanged}
      viewabilityConfig={{
        itemVisiblePercentThreshold: 70,
      }}
      contentOffset={{ x: 170 }}
    />
  );
};

export default Trending;

import { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Linking,
  StyleSheet,
  Dimensions,
} from "react-native";
import { useGlobalContext } from "../context/GlobalProvider";
import { incrementAdViewCount, incrementAdClickCount, getIOSCompatibleVideoUrl } from "../lib/appwrite";
import { isVideoMedia, isImageUrl, isVideoUrl } from "../lib/mediaType";
import FeedVideoPlayer from "./FeedVideoPlayer";

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get("window");

function resolveAdVideoUrl(advertisement) {
  const explicit = advertisement?.video || advertisement?.videoUrl || advertisement?.mediaUrl;
  if (explicit) {
    return getIOSCompatibleVideoUrl(String(explicit).replace(/#advideo$/i, "")) || explicit;
  }

  const image = advertisement?.image;
  if (!image) return null;
  const raw = String(image);
  const markedVideo = /#advideo$/i.test(raw);
  const clean = raw.replace(/#advideo$/i, "");
  if (markedVideo || isVideoUrl(clean) || isVideoMedia(clean, "video")) {
    return getIOSCompatibleVideoUrl(clean) || clean;
  }
  if (isImageUrl(clean)) return null;
  return null;
}

function resolveAdPoster(advertisement, videoUrl) {
  const image = advertisement?.image;
  if (!image) return null;
  const clean = String(image).replace(/#advideo$/i, "");
  if (/#advideo$/i.test(String(image))) return null;
  if (isVideoUrl(clean)) return null;
  if (videoUrl && clean === String(advertisement?.video || advertisement?.videoUrl || "").replace(/#advideo$/i, "")) {
    return null;
  }
  if (isImageUrl(clean)) return clean;
  return null;
}

const AdvertisementCard = ({
  advertisement,
  style,
  isVisible = true,
  shouldLoadSource = true,
  cardHeight = SCREEN_HEIGHT,
}) => {
  const { theme } = useGlobalContext();
  const [viewTracked, setViewTracked] = useState(false);
  const [preferImage, setPreferImage] = useState(false);

  const videoUrl = useMemo(
    () => (preferImage ? null : resolveAdVideoUrl(advertisement)),
    [advertisement, preferImage]
  );
  const posterUri = useMemo(
    () => resolveAdPoster(advertisement, videoUrl) || (!videoUrl ? advertisement?.image : null),
    [advertisement, videoUrl]
  );
  const ctaLabel =
    advertisement?.ctaLabel ||
    advertisement?.buttonText ||
    (advertisement?.linkUrl ? "Learn more" : "Watch now");

  useEffect(() => {
    setPreferImage(false);
  }, [advertisement?.$id, advertisement?.originalAdId, advertisement?.image, advertisement?.video]);

  useEffect(() => {
    const adId = advertisement?.originalAdId || advertisement?.$id;
    if (!adId || viewTracked) return;
    if (!String(adId).startsWith("ad_")) {
      incrementAdViewCount(adId);
      setViewTracked(true);
    } else if (advertisement?.originalAdId) {
      incrementAdViewCount(advertisement.originalAdId);
      setViewTracked(true);
    }
  }, [advertisement?.$id, advertisement?.originalAdId, viewTracked]);

  const handleCtaPress = async () => {
    if (!advertisement) return;

    const adId = advertisement?.originalAdId || advertisement?.$id;
    if (adId && !String(adId).startsWith("ad_")) {
      incrementAdClickCount(adId);
    } else if (advertisement?.originalAdId) {
      incrementAdClickCount(advertisement.originalAdId);
    }

    if (advertisement.linkUrl) {
      try {
        const canOpen = await Linking.canOpenURL(advertisement.linkUrl);
        if (canOpen) {
          await Linking.openURL(advertisement.linkUrl);
        }
      } catch (_) {
        /* ignore */
      }
    }
  };

  if (!advertisement) return null;

  const imageUri = (posterUri || advertisement.image || "")
    .toString()
    .replace(/#advideo$/i, "") || null;

  return (
    <View
      style={[
        styles.container,
        { height: cardHeight, width: SCREEN_WIDTH, backgroundColor: "#000" },
        style,
      ]}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {videoUrl && shouldLoadSource ? (
          <FeedVideoPlayer
            videoUrl={videoUrl}
            posterUri={posterUri}
            loadSource={shouldLoadSource}
            shouldPlay={!!isVisible}
            isLooping
            isMuted={false}
            enablePiP={false}
            onError={() => setPreferImage(true)}
          />
        ) : imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.media} resizeMode="cover" />
        ) : (
          <View style={[styles.media, { backgroundColor: "#111" }]} />
        )}
        <View style={styles.scrim} />
      </View>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>Ad</Text>
      </View>

      <View style={styles.bottomBlock} pointerEvents="box-none">
        {advertisement.advertiserName ? (
          <Text style={styles.sponsor} numberOfLines={1}>
            Sponsored · {advertisement.advertiserName}
          </Text>
        ) : (
          <Text style={styles.sponsor}>Sponsored</Text>
        )}
        {advertisement.title ? (
          <Text style={styles.title} numberOfLines={2}>
            {advertisement.title}
          </Text>
        ) : null}
        {advertisement.description ? (
          <Text style={styles.description} numberOfLines={2}>
            {advertisement.description}
          </Text>
        ) : null}

        <TouchableOpacity
          onPress={handleCtaPress}
          activeOpacity={0.85}
          style={[styles.cta, { backgroundColor: theme.accent || "#E1306C" }]}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    position: "relative",
  },
  media: {
    width: "100%",
    height: "100%",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  badge: {
    position: "absolute",
    top: 16,
    left: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  bottomBlock: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 96,
    zIndex: 12,
  },
  sponsor: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  description: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    marginBottom: 14,
  },
  cta: {
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default AdvertisementCard;

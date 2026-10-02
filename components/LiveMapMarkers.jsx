/**
 * Memoized map markers — prevents search TextInput re-renders from
 * baking typed text into react-native-maps marker bitmaps.
 *
 * Use system fonts inside markers. Custom fonts often snapshot blank/garbled
 * on iOS MapKit. Keep tracksViewChanges on only until the first paint/image load.
 */
import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { Feather } from "@expo/vector-icons";
import { images } from "../constants";
import { getPhotoUrl } from "../lib/appwrite";

function resolveImageSource(value) {
  if (!value || typeof value !== "string") return images.profile;
  const trimmed = value.trim();
  if (!trimmed) return images.profile;
  if (/^(https?:|file:|data:|content:)/i.test(trimmed)) {
    return { uri: trimmed };
  }
  const url = getPhotoUrl(trimmed);
  return url ? { uri: url } : images.profile;
}

function displayName(value, fallback) {
  const name = String(value || "").trim();
  if (!name || name === "User") return fallback;
  return name;
}

function nudgeCoordinate(latitude, longitude, id) {
  const seed = String(id || "pin");
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180);
  const meters = 0.00014;
  return {
    latitude: Number(latitude) + Math.cos(angle) * meters,
    longitude: Number(longitude) + Math.sin(angle) * meters,
  };
}

function useMarkerTracking(key, holdMs = 400) {
  const [tracks, setTracks] = useState(true);

  useEffect(() => {
    setTracks(true);
    const timer = setTimeout(() => setTracks(false), holdMs);
    return () => clearTimeout(timer);
  }, [key, holdMs]);

  const stopTracking = useCallback(() => {
    setTimeout(() => setTracks(false), 50);
  }, []);
  return [tracks, stopTracking];
}

function NamePill({ title, subtitle, style }) {
  const heading = String(title || "").trim();
  const extra = String(subtitle || "").trim();
  if (!heading) return null;
  return (
    <View style={[styles.namePill, style]} collapsable={false}>
      <Text style={styles.namePillTitle} numberOfLines={1}>
        {heading}
      </Text>
      {extra && extra !== heading ? (
        <Text style={styles.namePillSub} numberOfLines={1}>
          {extra}
        </Text>
      ) : null}
    </View>
  );
}

function FriendMarkerView({
  avatar,
  username,
  lastSeen,
  isLive,
  liked,
  borderColor,
  onImageReady,
}) {
  return (
    <View style={styles.personWrap} collapsable={false}>
      <View
        style={[
          styles.markerRing,
          { borderColor: isLive ? "#22C55E" : borderColor || "#94A3B8" },
        ]}
      >
        <Image
          source={resolveImageSource(avatar)}
          defaultSource={images.profile}
          style={styles.markerAvatar}
          resizeMode="cover"
          onLoadEnd={onImageReady}
          onError={onImageReady}
        />
      </View>
      <NamePill
        title={displayName(username, "Friend")}
        subtitle={isLive ? "Live" : lastSeen}
      />
      {liked ? (
        <View style={styles.likeBadge}>
          <Feather name="heart" size={11} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

const MemoFriendMarkerView = memo(FriendMarkerView);

function YouMarkerView({ avatar, onImageReady }) {
  return (
    <View style={styles.personWrap} collapsable={false}>
      <View style={[styles.markerRing, styles.youRing]}>
        <Image
          source={resolveImageSource(avatar)}
          defaultSource={images.profile}
          style={styles.markerAvatar}
          resizeMode="cover"
          onLoadEnd={onImageReady}
          onError={onImageReady}
        />
      </View>
      <NamePill title="You" subtitle="Here" />
    </View>
  );
}

const MemoYouMarkerView = memo(YouMarkerView);

function MomentMarkerView({
  photoUrl,
  avatar,
  username,
  likeCount,
  isVideo,
  onImageReady,
}) {
  return (
    <View style={styles.momentWrap} collapsable={false}>
      <View style={[styles.momentFrame, isVideo && styles.momentVideoFrame]}>
        {photoUrl ? (
          <Image
            source={resolveImageSource(photoUrl)}
            defaultSource={images.profile}
            style={styles.momentImage}
            resizeMode="cover"
            onLoadEnd={onImageReady}
            onError={onImageReady}
          />
        ) : (
          <View style={styles.momentVideoFallback} onLayout={onImageReady}>
            <Feather name="film" size={22} color="#fff" />
          </View>
        )}
        {isVideo ? (
          <View style={styles.momentPlayBadge}>
            <Feather name="play" size={16} color="#111" />
          </View>
        ) : null}
        <View style={styles.momentPinAvatarWrap}>
          <Image
            source={resolveImageSource(avatar)}
            defaultSource={images.profile}
            style={styles.momentPinAvatar}
            resizeMode="cover"
          />
        </View>
      </View>
      <NamePill
        title={displayName(username, isVideo ? "Short" : "Photo")}
        subtitle={isVideo ? "Short" : "Photo"}
      />
      {likeCount > 0 ? (
        <View style={styles.momentLikeRow}>
          <Feather name="heart" size={11} color="#FF4D6D" />
          <Text style={styles.momentLikeText}>{likeCount}</Text>
        </View>
      ) : null}
    </View>
  );
}

const MemoMomentMarkerView = memo(MomentMarkerView);

export const FriendLocationMarker = memo(function FriendLocationMarker({
  friend,
  borderColor,
  labelColor,
  liked = false,
  onPress,
}) {
  const trackKey = `${friend?.$id || friend?.userId || ""}:${friend?.avatar || ""}:${friend?.username || ""}`;
  const [tracks, stopTracking] = useMarkerTracking(trackKey);

  return (
    <Marker
      coordinate={{
        latitude: friend.latitude,
        longitude: friend.longitude,
      }}
      onPress={onPress}
      tracksViewChanges={tracks}
      cluster={false}
      zIndex={400}
      anchor={{ x: 0.5, y: 0.34 }}
      stopPropagation
    >
      <MemoFriendMarkerView
        avatar={friend.avatar}
        username={friend.username}
        lastSeen={friend.freshness?.label}
        isLive={Boolean(friend.freshness?.isLive)}
        liked={liked}
        borderColor={borderColor}
        labelColor={labelColor}
        onImageReady={stopTracking}
      />
    </Marker>
  );
});

export const YouLocationMarker = memo(function YouLocationMarker({
  coordinate,
  avatar,
  labelColor,
}) {
  const [tracks, stopTracking] = useMarkerTracking(avatar || "local");

  if (!coordinate) return null;
  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={tracks}
      cluster={false}
      zIndex={300}
      anchor={{ x: 0.5, y: 0.34 }}
      stopPropagation
    >
      <MemoYouMarkerView
        avatar={avatar}
        labelColor={labelColor}
        onImageReady={stopTracking}
      />
    </Marker>
  );
});

export const MapMomentMarker = memo(function MapMomentMarker({
  moment,
  onPress,
}) {
  const isVideo = moment?.mediaType === "video" || Boolean(moment?.videoUrl);
  const [tracks, stopTracking] = useMarkerTracking(
    `${moment?.$id || ""}:${moment?.photoUrl || ""}:${moment?.videoUrl || ""}:${moment?.avatar || ""}:${moment?.username || ""}`
  );
  const coordinate = useMemo(
    () => nudgeCoordinate(moment?.latitude, moment?.longitude, moment?.$id || "short"),
    [moment?.$id, moment?.latitude, moment?.longitude]
  );

  if (!moment?.photoUrl && !moment?.videoUrl) return null;
  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={tracks}
      cluster={false}
      zIndex={1100}
      anchor={{ x: 0.5, y: 0.36 }}
      stopPropagation
    >
      <MemoMomentMarkerView
        photoUrl={moment.photoUrl}
        avatar={moment.avatar}
        username={moment.username}
        likeCount={moment.likeCount || 0}
        isVideo={isVideo}
        onImageReady={stopTracking}
      />
    </Marker>
  );
});

function PinMarkerView({ pinType, title, username, placeLabel, visibility, onLayout }) {
  const isFavorite = pinType === "favorite";
  const color = isFavorite ? "#8B5CF6" : "#F97316";
  return (
    <View style={styles.pinWrap} collapsable={false} onLayout={onLayout}>
      <NamePill
        title={displayName(title, isFavorite ? "Favorite" : "Event")}
        subtitle={[displayName(username, ""), placeLabel].filter(Boolean).join(" · ")}
        style={{ marginTop: 0 }}
      />
      <View style={[styles.pinBubble, { backgroundColor: color }]}>
        <Feather name={isFavorite ? "star" : "map-pin"} size={20} color="#fff" />
      </View>
      <View style={[styles.pinStem, { borderTopColor: color }]} />
      <View style={[styles.pinDot, { backgroundColor: color }]} />
      {visibility === "everyone" ? (
        <View style={styles.publicBadge}>
          <Feather name="globe" size={10} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

const MemoPinMarkerView = memo(PinMarkerView);

function DraftPinView({ placeLabel }) {
  return (
    <View style={styles.draftWrap} collapsable={false}>
      <View style={styles.draftPill} collapsable={false}>
        <Text style={styles.draftPillTitle} numberOfLines={1}>
          Selected pin
        </Text>
        <Text style={styles.draftPillSub} numberOfLines={2}>
          {placeLabel || "Drag to move"}
        </Text>
      </View>
      <View style={styles.draftBubble}>
        <Feather name="map-pin" size={26} color="#fff" />
      </View>
      <View style={styles.draftStem} />
      <View style={styles.draftDot} />
    </View>
  );
}

const MemoDraftPinView = memo(DraftPinView);

export const DraftPinMarker = memo(function DraftPinMarker({
  coordinate,
  placeLabel,
  onDragEnd,
}) {
  if (
    !coordinate ||
    !Number.isFinite(coordinate.latitude) ||
    !Number.isFinite(coordinate.longitude)
  ) {
    return null;
  }
  return (
    <Marker
      coordinate={coordinate}
      draggable
      onDragEnd={onDragEnd}
      cluster={false}
      zIndex={2000}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges
      stopPropagation
    >
      <MemoDraftPinView placeLabel={placeLabel} />
    </Marker>
  );
});

export const MapPinMarker = memo(function MapPinMarker({ pin, onPress }) {
  const trackKey = `${pin?.$id || ""}:${pin?.title || ""}:${pin?.username || ""}`;
  const [tracks, stopTracking] = useMarkerTracking(trackKey, 450);
  const coordinate = useMemo(
    () => nudgeCoordinate(pin?.latitude, pin?.longitude, pin?.$id || "pin"),
    [pin?.$id, pin?.latitude, pin?.longitude]
  );

  if (!pin || !Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) {
    return null;
  }
  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={tracks}
      cluster={false}
      stopPropagation
      zIndex={1000}
      anchor={{ x: 0.5, y: 1 }}
    >
      <MemoPinMarkerView
        pinType={pin.pinType}
        title={pin.title}
        username={pin.username}
        placeLabel={pin.placeLabel}
        visibility={pin.visibility}
        onLayout={stopTracking}
      />
    </Marker>
  );
});

const styles = StyleSheet.create({
  personWrap: {
    alignItems: "center",
    width: 140,
    backgroundColor: Platform.OS === "android" ? "#00000000" : undefined,
  },
  markerRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  youRing: { borderColor: "#22C55E" },
  markerAvatar: { width: "100%", height: "100%" },
  namePill: {
    marginTop: 6,
    minWidth: 78,
    maxWidth: 136,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D0D7E2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: "center",
    overflow: "hidden",
  },
  namePillTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    includeFontPadding: false,
  },
  namePillSub: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "500",
    color: "#475569",
    textAlign: "center",
    includeFontPadding: false,
  },
  likeBadge: {
    position: "absolute",
    top: 36,
    right: 36,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  momentWrap: { alignItems: "center", width: 140 },
  momentFrame: {
    width: 84,
    height: 84,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#111827",
  },
  momentVideoFrame: {
    borderColor: "#2EE6E0",
  },
  momentImage: { width: "100%", height: "100%" },
  momentPinAvatarWrap: {
    position: "absolute",
    left: 6,
    bottom: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#E2E8F0",
  },
  momentPinAvatar: {
    width: "100%",
    height: "100%",
  },
  momentLikeRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: "hidden",
  },
  momentLikeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    includeFontPadding: false,
  },
  momentVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  momentPlayBadge: {
    position: "absolute",
    top: 29,
    left: 29,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.95)",
    alignItems: "center",
    justifyContent: "center",
  },
  pinWrap: { alignItems: "center", width: 148 },
  pinBubble: {
    marginTop: 6,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  pinStem: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -2,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  publicBadge: {
    position: "absolute",
    top: 52,
    right: 42,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  draftWrap: { alignItems: "center", width: 168 },
  draftPill: {
    marginBottom: 6,
    minWidth: 96,
    maxWidth: 160,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F97316",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: "center",
    overflow: "hidden",
  },
  draftPillTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  draftPillSub: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "500",
    color: "#475569",
    textAlign: "center",
  },
  draftBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  draftStem: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 14,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#F97316",
    marginTop: -1,
  },
  draftDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -2,
    backgroundColor: "#F97316",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});

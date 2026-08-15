/**
 * Memoized map markers — prevents search TextInput re-renders from
 * baking typed text into react-native-maps marker bitmaps.
 */
import React, { memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { Feather } from "@expo/vector-icons";
import { images } from "../constants";

function FriendMarkerView({ avatar, username, lastSeen, isLive, liked, borderColor, labelColor }) {
  return (
    <View style={styles.markerWrap} collapsable={false}>
      <View
        style={[
          styles.markerRing,
          { borderColor: isLive ? "#22C55E" : borderColor },
        ]}
      >
        <Image
          source={avatar ? { uri: avatar } : images.profile}
          style={styles.markerAvatar}
        />
      </View>
      <View style={styles.labelRow}>
        <Text style={[styles.markerLabel, { color: labelColor }]} numberOfLines={1}>
          {username} {lastSeen || ""}
        </Text>
        {liked ? (
          <View style={styles.likeBadge}>
            <Feather name="heart" size={10} color="#fff" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const MemoFriendMarkerView = memo(FriendMarkerView);

function YouMarkerView({ avatar, labelColor }) {
  return (
    <View style={styles.markerWrap} collapsable={false}>
      <View style={[styles.markerRing, styles.youRing]}>
        <Image
          source={avatar ? { uri: avatar } : images.profile}
          style={styles.markerAvatar}
        />
      </View>
      <Text style={[styles.markerLabel, { color: labelColor }]}>You · Now</Text>
    </View>
  );
}

const MemoYouMarkerView = memo(YouMarkerView);

function MomentMarkerView({ photoUrl, likeCount }) {
  return (
    <View style={styles.momentWrap} collapsable={false}>
      <View style={styles.momentFrame}>
        <Image
          source={photoUrl ? { uri: photoUrl } : images.profile}
          style={styles.momentImage}
        />
      </View>
      {likeCount > 0 ? (
        <View style={styles.momentLikeRow}>
          <Feather name="heart" size={10} color="#FF4D6D" />
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
  return (
    <Marker
      coordinate={{
        latitude: friend.latitude,
        longitude: friend.longitude,
      }}
      onPress={onPress}
      tracksViewChanges={false}
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
      />
    </Marker>
  );
});

export const YouLocationMarker = memo(function YouLocationMarker({
  coordinate,
  avatar,
  labelColor,
}) {
  if (!coordinate) return null;
  return (
    <Marker
      coordinate={coordinate}
      tracksViewChanges={false}
      cluster={false}
      stopPropagation
    >
      <MemoYouMarkerView avatar={avatar} labelColor={labelColor} />
    </Marker>
  );
});

export const MapMomentMarker = memo(function MapMomentMarker({
  moment,
  onPress,
}) {
  if (!moment?.photoUrl) return null;
  return (
    <Marker
      coordinate={{
        latitude: moment.latitude,
        longitude: moment.longitude,
      }}
      onPress={onPress}
      tracksViewChanges={false}
      cluster={false}
      stopPropagation
    >
      <MemoMomentMarkerView
        photoUrl={moment.photoUrl}
        likeCount={moment.likeCount || 0}
      />
    </Marker>
  );
});

const styles = StyleSheet.create({
  markerWrap: { alignItems: "center", maxWidth: 120 },
  markerRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  youRing: { borderColor: "#22C55E" },
  markerAvatar: { width: "100%", height: "100%" },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  markerLabel: {
    fontSize: 11,
    fontFamily: "Poppins-SemiBold",
    textAlign: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
    maxWidth: 96,
  },
  likeBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#FF4D6D",
    alignItems: "center",
    justifyContent: "center",
  },
  momentWrap: { alignItems: "center", width: 72 },
  momentFrame: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    overflow: "hidden",
    backgroundColor: "#111",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  momentImage: { width: "100%", height: "100%" },
  momentLikeRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  momentLikeText: {
    fontSize: 10,
    fontFamily: "Poppins-SemiBold",
    color: "#0F172A",
  },
});

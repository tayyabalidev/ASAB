/**
 * Memoized map markers — prevents search TextInput re-renders from
 * baking typed text into react-native-maps marker bitmaps.
 */
import React, { memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { Marker } from "react-native-maps";
import { images } from "../constants";

function FriendMarkerView({ avatar, username, lastSeen, isLive, borderColor, labelColor }) {
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
      <Text style={[styles.markerLabel, { color: labelColor }]} numberOfLines={1}>
        {username} {lastSeen || ""}
      </Text>
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

export const FriendLocationMarker = memo(function FriendLocationMarker({
  friend,
  borderColor,
  labelColor,
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

const styles = StyleSheet.create({
  markerWrap: { alignItems: "center", maxWidth: 110 },
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
  markerLabel: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Poppins-SemiBold",
    textAlign: "center",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: "hidden",
  },
});

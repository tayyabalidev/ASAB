import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useMeeting, usePubSub } from '@videosdk.live/react-native-sdk';
import { useGlobalContext } from '../context/GlobalProvider';
import { addLiveReaction } from '../lib/livestream';

const { height } = Dimensions.get('window');

const HEART_COLORS = ['#ff4757', '#2ed8c3', '#a77df8', '#ffd700', '#ff6b81', '#70a1ff'];

function pickHeartColor() {
  return HEART_COLORS[Math.floor(Math.random() * HEART_COLORS.length)];
}

function FloatingHeart({ color, size, driftX, onComplete }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -height * 0.62,
        duration: 2600,
        useNativeDriver: true,
      }),
      Animated.timing(translateX, {
        toValue: driftX,
        duration: 2600,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 2600,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }),
    ]).start(() => onComplete?.());
  }, [translateY, translateX, opacity, scale, driftX, onComplete]);

  return (
    <Animated.View
      style={[
        styles.floatingHeart,
        {
          opacity,
          transform: [{ translateY }, { translateX }, { scale }],
        },
      ]}
    >
      <FontAwesome name="heart" size={size} color={color} />
    </Animated.View>
  );
}

/**
 * Floating heart reactions via VideoSDK PubSub — instant for all meeting participants.
 * Must render inside MeetingProvider.
 */
export default function LiveStreamHeartReactions({
  streamId,
  isHost = false,
  bottomOffset = 100,
}) {
  const { user } = useGlobalContext();
  const { localParticipant } = useMeeting();
  const localParticipantId = localParticipant?.id;
  const { publish, messages } = usePubSub('LIVE_HEART', {});
  const [hearts, setHearts] = useState([]);
  const lastHeartIndexRef = useRef(0);
  const pendingTapRef = useRef(0);

  const spawnHeart = useCallback((colorOverride) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const color = colorOverride || pickHeartColor();
    const size = 22 + Math.floor(Math.random() * 12);
    const driftX = (Math.random() - 0.5) * 48;
    setHearts((prev) => [...prev.slice(-40), { id, color, size, driftX }]);
  }, []);

  const removeHeart = useCallback((id) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  useEffect(() => {
    const msgs = messages || [];
    const timers = [];
    for (let i = lastHeartIndexRef.current; i < msgs.length; i += 1) {
      const item = msgs[i];
      if (item?.senderId && item.senderId === localParticipantId) {
        continue;
      }
      spawnHeart();
      if (Math.random() > 0.5) {
        timers.push(setTimeout(() => spawnHeart(pickHeartColor()), 80));
      }
    }
    lastHeartIndexRef.current = msgs.length;
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [messages, localParticipantId, spawnHeart]);

  const handleLike = useCallback(() => {
    spawnHeart();
    pendingTapRef.current += 1;
    if (pendingTapRef.current % 3 === 0) {
      setTimeout(() => spawnHeart(pickHeartColor()), 60);
    }
    try {
      if (typeof publish === 'function') {
        publish('heart', { persist: false });
      }
    } catch (_) {
      /* ignore */
    }
    if (streamId && user?.$id) {
      addLiveReaction(streamId, user.$id, 'heart').catch(() => {});
    }
  }, [spawnHeart, publish, streamId, user?.$id]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View
        style={[styles.floatingLane, { bottom: bottomOffset + 56 }]}
        pointerEvents="none"
      >
        {hearts.map((item) => (
          <FloatingHeart
            key={item.id}
            color={item.color}
            size={item.size}
            driftX={item.driftX}
            onComplete={() => removeHeart(item.id)}
          />
        ))}
      </View>

      {!isHost ? (
        <TouchableOpacity
          style={[styles.likeButton, { bottom: bottomOffset }]}
          onPress={handleLike}
          activeOpacity={0.85}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          pressRetentionOffset={{ top: 18, bottom: 18, left: 18, right: 18 }}
          accessibilityLabel="Like stream"
        >
          <FontAwesome name="heart" size={26} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 27,
  },
  floatingLane: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: height * 0.5,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  floatingHeart: {
    position: 'absolute',
    bottom: 0,
  },
  likeButton: {
    position: 'absolute',
    right: 12,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255, 71, 87, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff4757',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 40,
  },
});

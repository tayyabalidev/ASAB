import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export const FEED_SIDE_ACTIONS_STYLE = {
  position: 'absolute',
  right: 12,
  top: 52,
  zIndex: 20,
  elevation: 20,
};

export function FeedFireAction({
  onPress,
  color = '#2EE6E0',
  count = 0,
  textColor = '#FFFFFF',
  sending = false,
  sent = false,
}) {
  const label = sending ? '...' : sent ? 'Sent' : 'Send';
  const iconColor = sent ? '#22C55E' : sending ? '#94A3B8' : color;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={sending || sent}
      style={{ marginBottom: 20, alignItems: 'center', opacity: sending ? 0.7 : 1 }}
      activeOpacity={0.7}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 5,
        }}
      >
        <Ionicons name={sent ? 'checkmark-circle' : 'flame'} size={42} color={iconColor} />
      </View>
      <Text style={{ color: textColor, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function FeedReactionBurst({ type, burstKey }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!burstKey || !type) return undefined;

    scale.setValue(0.28);
    opacity.setValue(1);

    const animation = Animated.sequence([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.delay(420),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 280,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [burstKey, type, scale, opacity]);

  if (!burstKey || !type) return null;

  return (
    <View pointerEvents="none" collapsable={false} style={styles.wrap}>
      <Animated.View key={burstKey} style={{ opacity, transform: [{ scale }] }}>
        {type === 'fire' ? (
          <View style={styles.stack}>
            <View style={[styles.glow, styles.fireGlow]} />
            <Ionicons name="flame" size={176} color="#3CEDE6" />
            <Ionicons
              name="flame"
              size={128}
              color="#8B5CFF"
              style={styles.innerIcon}
            />
          </View>
        ) : (
          <View style={styles.stack}>
            <View style={[styles.glow, styles.heartGlow]} />
            <Ionicons name="heart" size={168} color="#FF3B5C" />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 80,
    elevation: 80,
  },
  stack: {
    width: 190,
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
  },
  fireGlow: {
    backgroundColor: 'rgba(46, 230, 224, 0.22)',
  },
  heartGlow: {
    backgroundColor: 'rgba(255, 59, 92, 0.28)',
  },
  innerIcon: {
    position: 'absolute',
  },
});

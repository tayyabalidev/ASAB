import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  StatusBar,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const InstagramPreviewScreen = ({
  mediaUri,
  mediaType = 'photo', // 'photo' or 'video'
  onClose,
  onNext,
  suggestedAudio = null, // { thumbnail: uri, title: string, artist: string }
  onAudioPress,
  onTextPress,
  onOverlayPress,
  onFilterPress,
  onEditPress,
  theme = {
    background: '#000000',
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    accent: '#0095F6',
  },
}) => {
  const [videoRef, setVideoRef] = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const blurAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Smooth fade-in animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(blurAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Instagram-style subtle enhancement filter
  const getEnhancementStyle = () => ({
    // Soft warm tone overlay
    backgroundColor: 'rgba(255, 240, 220, 0.03)',
    // Subtle brightness boost
    opacity: 0.98,
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Full-screen media preview */}
      <Animated.View
        style={[
          styles.mediaContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {mediaType === 'photo' ? (
          <Image
            source={{ uri: mediaUri }}
            style={styles.media}
            resizeMode="cover"
          />
        ) : (
          <Video
            ref={setVideoRef}
            source={{ uri: mediaUri }}
            style={styles.media}
            resizeMode={ResizeMode.COVER}
            isLooping
            shouldPlay
            isMuted={false}
          />
        )}

        {/* Subtle enhancement overlay for cinematic feel */}
        <View style={[styles.enhancementOverlay, getEnhancementStyle()]} />

        {/* Gentle background blur effect - using gradient overlay for depth */}
        <Animated.View
          style={[
            styles.blurOverlay,
            {
              opacity: blurAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.2],
              }),
            },
          ]}
        >
          <LinearGradient
            colors={['transparent', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.2)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </Animated.View>

      {/* Top bar */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <View style={styles.topBarContent}>
          {/* Close button */}
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <View style={styles.iconButton}>
              <Feather name="x" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Suggested audio section (center) */}
          {suggestedAudio && (
            <TouchableOpacity
              onPress={onAudioPress}
              style={styles.audioSuggestion}
              activeOpacity={0.8}
            >
              {suggestedAudio.thumbnail && (
                <Image
                  source={{ uri: suggestedAudio.thumbnail }}
                  style={styles.audioThumbnail}
                />
              )}
              <View style={styles.audioInfo}>
                <Text style={styles.audioTitle} numberOfLines={1}>
                  {suggestedAudio.title || 'Suggested audio'}
                </Text>
                <Text style={styles.audioSubtitle} numberOfLines={1}>
                  {suggestedAudio.artist || 'Suggested audio'}
                </Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Add button (top right) */}
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.7}
          >
            <View style={styles.iconButton}>
              <Feather name="plus" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom action bar */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <LinearGradient
          colors={['transparent', 'rgba(0, 0, 0, 0.7)', 'rgba(0, 0, 0, 0.85)']}
          style={styles.bottomGradient}
        >
          {/* Action buttons row with Next button */}
          <View style={styles.bottomRow}>
            {/* Action buttons */}
            <View style={styles.actionButtons}>
            <ActionButton
              icon="music"
              label="Audio"
              onPress={onAudioPress}
              theme={theme}
            />
            <ActionButton
              icon="type"
              label="Text"
              onPress={onTextPress}
              theme={theme}
            />
            <ActionButton
              icon="grid"
              label="Overlay"
              onPress={onOverlayPress}
              theme={theme}
            />
            <ActionButton
              icon="sliders"
              label="Filter"
              onPress={onFilterPress}
              theme={theme}
            />
            <ActionButton
              icon="edit-3"
              label="Edit"
              onPress={onEditPress}
              theme={theme}
            />
            </View>

            {/* Next button */}
            <TouchableOpacity
              onPress={onNext}
              style={styles.nextButton}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#0095F6', '#1877F2']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.nextButtonGradient}
              >
                <Text style={styles.nextButtonText}>Next</Text>
                <Feather name="arrow-right" size={18} color="#FFFFFF" style={{ marginLeft: 4 }} />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    </View>
  );
};

const ActionButton = ({ icon, label, onPress, theme }) => {
  const [pressed, setPressed] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    setPressed(true);
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    setPressed(false);
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={0.8}
      style={styles.actionButtonContainer}
    >
      <Animated.View
        style={[
          styles.actionButton,
          {
            transform: [{ scale: scaleAnim }],
            backgroundColor: pressed
              ? 'rgba(255, 255, 255, 0.25)'
              : 'rgba(255, 255, 255, 0.15)',
          },
        ]}
      >
        <Feather name={icon} size={22} color="#FFFFFF" />
        <Text style={styles.actionButtonLabel}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  mediaContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  enhancementOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
    paddingBottom: 12,
  },
  topBarContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    zIndex: 11,
  },
  addButton: {
    zIndex: 11,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  audioSuggestion: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 12,
    maxWidth: SCREEN_WIDTH * 0.6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  audioThumbnail: {
    width: 32,
    height: 32,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  audioInfo: {
    flex: 1,
  },
  audioTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Poppins-SemiBold',
  },
  audioSubtitle: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Poppins-Regular',
    marginTop: 2,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomGradient: {
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 24,
    paddingHorizontal: 16,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  actionButtonContainer: {
    alignItems: 'center',
    marginRight: 4,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  actionButtonLabel: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'Poppins-Medium',
    marginTop: 2,
    textAlign: 'center',
  },
  nextButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#0095F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins-SemiBold',
  },
});

export default InstagramPreviewScreen;


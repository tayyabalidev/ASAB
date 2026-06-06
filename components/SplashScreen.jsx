import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Dimensions, Text } from 'react-native';
import { GestureHandlerRootView, PanGestureHandler, State } from 'react-native-gesture-handler';
import { SplashScreen as ExpoSplashScreen } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('screen');

const SplashScreen = ({ onComplete }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [splashReady, setSplashReady] = useState(false);

  useEffect(() => {
    if (splashReady) {
      ExpoSplashScreen.hideAsync();
    }
  }, [splashReady]);

  const splashImages = [
    require('../assets/images/splash1.png'),
    require('../assets/images/splash3.png'),
    require('../assets/images/splash4.png'),
  ];

  const splashQuotes = [
    "Where memories live and connections grow.",
    "Your moments, our connections. Let's share!",
    "Welcome to ASAB"
  ];

  const handleSwipe = (event) => {
    if (event.nativeEvent.state === State.END) {
      const { translationX, velocityX } = event.nativeEvent;
      
      // Check for swipe gesture (minimum distance or velocity) - more sensitive
      const isSwipeLeft = translationX < -20 || velocityX < -200;
      const isSwipeRight = translationX > 20 || velocityX > 200;
      
      // Swipe left to go to next image - instant switch
      if (isSwipeLeft && currentImageIndex < splashImages.length - 1) {
        setCurrentImageIndex(prev => prev + 1);
      }
      // Swipe right to go to previous image - instant switch
      else if (isSwipeRight && currentImageIndex > 0) {
        setCurrentImageIndex(prev => prev - 1);
      }
      // If on last image and swipe left, complete splash screen
      else if (isSwipeLeft && currentImageIndex === splashImages.length - 1) {
        onComplete();
      }
    }
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar hidden />
      <PanGestureHandler onHandlerStateChange={handleSwipe}>
        <View style={styles.imageContainer}>
          <Image
            key={currentImageIndex}
            source={splashImages[currentImageIndex]}
            style={styles.splashImage}
            resizeMode="cover"
            onLoad={() => {
              if (currentImageIndex === 0) {
                setSplashReady(true);
              }
            }}
          />

          <View style={styles.quoteContainer}>
            <Text style={styles.quoteText}>
              {splashQuotes[currentImageIndex]}
            </Text>
          </View>

          <View style={styles.progressContainer}>
            {splashImages.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.progressDot,
                  index === currentImageIndex ? styles.activeDot : styles.inactiveDot
                ]}
              />
            ))}
          </View>

          <Text style={styles.instructionText}>
            {currentImageIndex < splashImages.length - 1
              ? 'Swipe left to continue'
              : 'Swipe left to start'}
          </Text>
        </View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  splashImage: {
    ...StyleSheet.absoluteFillObject,
    width,
    height,
  },
  quoteContainer: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  quoteText: {
    color: '#FF9C01', // App accent color
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  progressContainer: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 6,
  },
  activeDot: {
    backgroundColor: '#FF8E01',
  },
  inactiveDot: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  instructionText: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginHorizontal: 40,
  },
});

export default SplashScreen;

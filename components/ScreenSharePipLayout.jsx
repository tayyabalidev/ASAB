import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { Platform } from 'react-native';
import { RTCView } from '@videosdk.live/react-native-sdk';

export default function ScreenSharePipLayout({
  streamURL,
  useFrontCamera = true,
  isBlurEnabled = false,
}) {
  if (!streamURL) {
    return <View style={styles.root} />;
  }

  return (
    <View style={styles.root}>
      <RTCView
        streamURL={streamURL}
        style={styles.video}
        objectFit="cover"
        mirror={Boolean(useFrontCamera)}
        zOrder={2}
        {...(Platform.OS === 'android' ? { zOrderMediaOverlay: true } : {})}
      />
      {isBlurEnabled ? (
        <BlurView
          intensity={Platform.OS === 'android' ? 72 : 85}
          tint="dark"
          style={styles.blur}
          pointerEvents="none"
          experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  blur: {
    ...StyleSheet.absoluteFillObject,
  },
});

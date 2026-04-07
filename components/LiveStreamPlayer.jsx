import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { useGlobalContext } from '../context/GlobalProvider';
import { isExpoGoOrStoreClient } from '../lib/videosdkNativeGate';
import { images } from '../constants';

const { height } = Dimensions.get('window');

function FallbackPlayer({ stream, onClose }) {
  const { user } = useGlobalContext();

  if (!stream || !user?.$id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Sign in to watch live streams</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.videoArea, styles.fallbackVideo]}>
        <Text style={styles.fallbackTitle}>Live video unavailable</Text>
        <Text style={styles.fallbackSub}>
          Open this app from a development or production build (not Expo Go) to watch VideoSDK
          streams.
        </Text>
        {onClose && (
          <TouchableOpacity style={styles.closeFabAlt} onPress={onClose}>
            <Text style={styles.closeFabText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.bottomOverlay}>
        <View style={styles.hostInfoContainer}>
          <View style={styles.hostInfo}>
            <Image
              source={stream.hostAvatar ? { uri: stream.hostAvatar } : images.profile}
              style={styles.hostAvatarSmall}
            />
            <View style={styles.hostDetails}>
              <Text style={styles.hostName}>{stream.hostUsername}</Text>
              <Text style={styles.streamTitle} numberOfLines={2}>
                {stream.title}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Lazy-loads VideoSDK + HLS viewer only outside Expo Go (safe for components barrel imports).
 */
export default function LiveStreamPlayer(props) {
  const Inner = useMemo(() => {
    if (isExpoGoOrStoreClient()) {
      return null;
    }
    try {
      return require('./LiveStreamPlayerImpl').default;
    } catch (e) {
      console.warn('LiveStreamPlayer: failed to load VideoSDK implementation', e);
      return null;
    }
  }, []);

  if (!Inner) {
    return <FallbackPlayer stream={props.stream} onClose={props.onClose} />;
  }

  return <Inner {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  fallbackVideo: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    minHeight: height * 0.45,
  },
  fallbackTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  fallbackSub: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 320,
  },
  closeFabAlt: {
    marginTop: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  closeFabText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingBottom: 120,
  },
  hostInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 10,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
    backgroundColor: '#222',
  },
  hostDetails: {
    flex: 1,
  },
  hostName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  streamTitle: {
    color: '#ddd',
    fontSize: 12,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
});

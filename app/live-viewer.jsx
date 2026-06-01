import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  Text,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LiveStreamPlayer, LiveReactions } from '../components';
import { useGlobalContext } from '../context/GlobalProvider';
import { getLiveStreamById, joinLiveStream, leaveLiveStream } from '../lib/livestream';
import { useTranslation } from 'react-i18next';

const { height } = Dimensions.get('window');

function firstRouteParam(value) {
  if (value == null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : v != null ? String(v) : undefined;
}

const LiveViewer = () => {
  const params = useLocalSearchParams();
  const streamId = firstRouteParam(params.streamId);
  const { user } = useGlobalContext();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!streamId) {
      router.replace('/home');
      return;
    }

    const loadStream = async () => {
      try {
        const streamData = await getLiveStreamById(streamId);

        if (!streamData.isLive) {
          Alert.alert(t('liveViewer.streamEndedTitle'), t('liveViewer.streamEndedMessage'));
          router.replace('/live-streams');
          return;
        }

        setStream(streamData);
      } catch (_) {
        Alert.alert(t('common.error'), t('liveViewer.loadError'));
        router.replace('/live-streams');
      } finally {
        setLoading(false);
      }
    };

    loadStream();
  }, [streamId, t]);

  useEffect(() => {
    if (!streamId || !user?.$id) return undefined;
    joinLiveStream(streamId, user.$id).catch(() => {});
    return () => {
      leaveLiveStream(streamId, user.$id).catch(() => {});
    };
  }, [streamId, user?.$id]);

  const handleClose = () => {
    router.replace('/home');
  };

  if (loading || !stream) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('liveViewer.loading')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.container}>
          <LiveStreamPlayer stream={stream} onClose={handleClose} showChat={showChat} />

          {stream.liveMode === 'screen' ? (
            <View
              pointerEvents="none"
              style={[styles.liveModePill, { top: insets.top + 10 }]}
            >
              <Text style={styles.liveModePillText}>{t('live.modeScreen')}</Text>
            </View>
          ) : null}

          <LiveReactions streamId={streamId} isHost={false} />

          <TouchableOpacity
            style={[
              styles.chatToggle,
              { bottom: showChat ? height * 0.44 : Math.max(24, height * 0.06) },
            ]}
            onPress={() => setShowChat((prev) => !prev)}
          >
            <View style={styles.chatToggleIcon}>
              <View style={styles.chatBubble1} />
              <View style={styles.chatBubble2} />
            </View>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  liveModePill: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  liveModePillText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chatToggle: {
    position: 'absolute',
    left: 20,
    zIndex: 32,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatToggleIcon: {
    width: 24,
    height: 24,
    position: 'relative',
  },
  chatBubble1: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    top: 0,
    left: 0,
  },
  chatBubble2: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#a77df8',
    bottom: 0,
    right: 0,
  },
});

export default LiveViewer;

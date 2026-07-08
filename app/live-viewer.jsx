import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  InteractionManager,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import LiveStreamPaywall from '../components/LiveStreamPaywall';
import { useGlobalContext } from '../context/GlobalProvider';
import { getLiveStreamById, joinLiveStream, leaveLiveStream } from '../lib/livestream';
import {
  getStreamAccessPrice,
  hasStreamAccess,
  isPaidLiveStream,
} from '../lib/streamAccess';
import { useTranslation } from 'react-i18next';

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
  const [accessGranted, setAccessGranted] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [fatalError, setFatalError] = useState(null);
  const [showChat, setShowChat] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const LiveStreamPlayer = useMemo(() => {
    try {
      return require('../components/LiveStreamPlayer').default;
    } catch (_) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (loading || checkingAccess || !accessGranted || !stream) {
      setPlayerReady(false);
      return undefined;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (!cancelled) setPlayerReady(true);
    });

    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [loading, checkingAccess, accessGranted, stream?.$id]);

  const verifyAccess = useCallback(async (streamData) => {
    if (!streamData) {
      setAccessGranted(false);
      setCheckingAccess(false);
      return false;
    }

    if (!isPaidLiveStream(streamData)) {
      setAccessGranted(true);
      setCheckingAccess(false);
      return true;
    }

    if (!user?.$id) {
      setAccessGranted(false);
      setCheckingAccess(false);
      return false;
    }

    if (String(streamData.hostId) === String(user.$id)) {
      setAccessGranted(true);
      setCheckingAccess(false);
      return true;
    }

    setCheckingAccess(true);
    try {
      const allowed = await hasStreamAccess(streamData, user.$id);
      setAccessGranted(allowed);
      return allowed;
    } catch (_) {
      setAccessGranted(false);
      return false;
    } finally {
      setCheckingAccess(false);
    }
  }, [user?.$id]);

  useEffect(() => {
    if (!streamId) {
      router.replace('/home');
      return;
    }

    let cancelled = false;

    const loadStream = async () => {
      setLoading(true);
      setFatalError(null);
      try {
        const streamData = await getLiveStreamById(streamId);
        if (cancelled) return;

        if (!streamData.isLive) {
          Alert.alert(t('liveViewer.streamEndedTitle'), t('liveViewer.streamEndedMessage'));
          router.replace('/live-streams');
          return;
        }

        setStream(streamData);
        await verifyAccess(streamData);
      } catch (error) {
        if (!cancelled) {
          setFatalError(error?.message || t('liveViewer.loadError'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStream();
    return () => {
      cancelled = true;
    };
  }, [streamId, t, verifyAccess]);

  useEffect(() => {
    if (!streamId || !user?.$id || !accessGranted) return undefined;
    joinLiveStream(streamId, user.$id).catch(() => {});
    return () => {
      leaveLiveStream(streamId, user.$id).catch(() => {});
    };
  }, [streamId, user?.$id, accessGranted]);

  const handleClose = () => {
    router.replace('/home');
  };

  const handleAccessGranted = async () => {
    if (!stream) return;
    setCheckingAccess(true);
    try {
      // Allow Appwrite purchase write to become visible before re-checking access.
      await new Promise((resolve) => setTimeout(resolve, 500));
      await verifyAccess(stream);
    } finally {
      setCheckingAccess(false);
    }
  };

  if (loading || checkingAccess) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('liveViewer.loading')}</Text>
      </View>
    );
  }

  if (fatalError || !stream) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{fatalError || t('liveViewer.loadError')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Text style={styles.backButtonText}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const paid = isPaidLiveStream(stream);
  const hasValidPrice = getStreamAccessPrice(stream) > 0;

  if (paid && !hasValidPrice) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>{t('paidStream.invalidPrice')}</Text>
        <TouchableOpacity style={styles.backButton} onPress={handleClose}>
          <Text style={styles.backButtonText}>{t('common.close')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (paid && !accessGranted) {
    return (
      <LiveStreamPaywall
        stream={stream}
        user={user}
        onAccessGranted={handleAccessGranted}
        onClose={handleClose}
      />
    );
  }

  if (!LiveStreamPlayer || !playerReady) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>
          {playerReady === false && LiveStreamPlayer
            ? t('liveViewer.loading')
            : t('liveViewer.loadError')}
        </Text>
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

          <TouchableOpacity
            style={[
              styles.chatToggle,
              { bottom: showChat ? 252 : Math.max(insets.bottom + 16, 24) },
            ]}
            onPress={() => setShowChat((prev) => !prev)}
            accessibilityLabel={showChat ? 'Hide chat' : 'Show chat'}
          >
            <Feather
              name="message-circle"
              size={22}
              color={showChat ? '#fff' : 'rgba(255,255,255,0.55)'}
            />
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
    padding: 24,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 125, 248, 0.25)',
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '700',
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
    left: 16,
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
});

export default LiveViewer;

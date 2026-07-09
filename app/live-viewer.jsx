import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  isPaidLiveStream,
  verifyReturningPurchaseAccess,
} from '../lib/streamAccess';
import { useTranslation } from 'react-i18next';

function firstRouteParam(value) {
  if (value == null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : v != null ? String(v) : undefined;
}

class LivePlayerErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (__DEV__) {
      console.warn('[live-viewer] LiveStreamPlayer crashed:', error?.message || error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Could not start live video on this device.</Text>
          <TouchableOpacity style={styles.backButton} onPress={this.props.onClose}>
            <Text style={styles.backButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const LiveViewer = () => {
  const params = useLocalSearchParams();
  const streamId = firstRouteParam(params.streamId);
  const { user } = useGlobalContext();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [fatalError, setFatalError] = useState(null);
  const [showChat, setShowChat] = useState(true);
  const [playerReady, setPlayerReady] = useState(false);
  const [LiveStreamPlayer, setLiveStreamPlayer] = useState(null);
  const loadStreamRunRef = useRef(0);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  // Load VideoSDK player only after access is granted — never on paywall.
  useEffect(() => {
    if (!accessGranted || loading) {
      setLiveStreamPlayer(null);
      return undefined;
    }

    let cancelled = false;
    try {
      const Player = require('../components/LiveStreamPlayer').default;
      if (!cancelled) setLiveStreamPlayer(() => Player);
    } catch (_) {
      if (!cancelled) setLiveStreamPlayer(null);
    }

    return () => {
      cancelled = true;
    };
  }, [accessGranted, loading]);

  useEffect(() => {
    if (loading || !accessGranted || !stream) {
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
  }, [loading, accessGranted, stream?.$id]);

  useEffect(() => {
    if (!streamId) {
      router.replace('/home');
      return;
    }

    const runId = loadStreamRunRef.current + 1;
    loadStreamRunRef.current = runId;
    let cancelled = false;

    const loadStream = async () => {
      setLoading(true);
      setFatalError(null);
      setAccessGranted(false);

      try {
        const streamData = await getLiveStreamById(streamId);
        if (cancelled || loadStreamRunRef.current !== runId) return;

        if (!streamData.isLive) {
          Alert.alert(t('liveViewer.streamEndedTitle'), t('liveViewer.streamEndedMessage'));
          router.replace('/live-streams');
          return;
        }

        setStream(streamData);

        if (!isPaidLiveStream(streamData)) {
          setAccessGranted(true);
          return;
        }

        if (!user?.$id) {
          setAccessGranted(false);
          return;
        }

        if (String(streamData.hostId) === String(user.$id)) {
          setAccessGranted(true);
          return;
        }

        // Paid viewer: show paywall immediately — do not block on server access check.
        setAccessGranted(false);

        // Returning purchaser: verify in background (server-only, no Appwrite listDocuments).
        verifyReturningPurchaseAccess(streamData, user.$id)
          .then((allowed) => {
            if (!cancelled && loadStreamRunRef.current === runId && allowed) {
              setAccessGranted(true);
            }
          })
          .catch(() => {});
      } catch (error) {
        if (!cancelled && loadStreamRunRef.current === runId) {
          setFatalError(error?.message || t('liveViewer.loadError'));
        }
      } finally {
        if (!cancelled && loadStreamRunRef.current === runId) {
          setLoading(false);
        }
      }
    };

    loadStream();
    return () => {
      cancelled = true;
    };
  }, [streamId, user?.$id, t]);

  useEffect(() => {
    if (!streamId || !user?.$id || !accessGranted) return undefined;
    joinLiveStream(streamId, user.$id).catch(() => {});
    return () => {
      leaveLiveStream(streamId, user.$id).catch(() => {});
    };
  }, [streamId, user?.$id, accessGranted]);

  const handleClose = useCallback(() => {
    router.replace('/home');
  }, []);

  const handleAccessGranted = useCallback(() => {
    setAccessGranted(true);
  }, []);

  if (loading) {
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
          <LivePlayerErrorBoundary onClose={handleClose}>
            <LiveStreamPlayer stream={stream} onClose={handleClose} showChat={showChat} />
          </LivePlayerErrorBoundary>

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

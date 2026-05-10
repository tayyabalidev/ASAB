import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Modal, Alert, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LiveStreamBroadcaster, LiveChatPanel, LiveReactions } from '../components';
import { useGlobalContext } from '../context/GlobalProvider';
import { useTranslation } from 'react-i18next';
import { peekLiveHostSession, clearLiveHostSession } from '../lib/pendingLiveBroadcast';

const { height } = Dimensions.get('window');

/** Expo Router may pass a param as string or string[] */
function firstRouteParam(value) {
  if (value == null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : v != null ? String(v) : undefined;
}

const LiveBroadcast = () => {
  const params = useLocalSearchParams();
  const streamId = firstRouteParam(params.streamId);
  /** Full JWT must not live in URL params (iOS can truncate); use in-memory stash from go-live when present. */
  const stashed = streamId ? peekLiveHostSession(streamId) : null;
  const roomId = stashed?.roomId || firstRouteParam(params.roomId);
  const hostToken = stashed?.hostToken || firstRouteParam(params.hostToken);
  const quality = stashed?.quality ?? firstRouteParam(params.quality);
  const liveMode = stashed?.liveMode ?? firstRouteParam(params.liveMode);
  const { user } = useGlobalContext();
  const [showChat, setShowChat] = useState(false);
  const { t } = useTranslation();

  const handleStreamEnd = () => {
    if (streamId) clearLiveHostSession(streamId);
    Alert.alert(t('liveBroadcast.endedTitle'), t('liveBroadcast.endedMessage'));
    router.replace('/home');
  };

  useEffect(() => {
    if (!streamId) {
      Alert.alert(t('common.error'), t('liveBroadcast.missingStream'));
      router.replace('/home');
      return;
    }
    if (!roomId) {
      Alert.alert(
        t('common.error'),
        'Missing videosdkRoomId for this live stream. Please start a new stream and try again.'
      );
      if (streamId) clearLiveHostSession(streamId);
      router.replace('/home');
      return;
    }
    if (!hostToken) {
      Alert.alert(
        t('common.error'),
        'Missing VideoSDK host token. Start again from Go Live (do not open this URL manually).'
      );
      clearLiveHostSession(streamId);
      router.replace('/home');
    }
  }, [streamId, roomId, hostToken, t]);

  if (!streamId || !roomId || !hostToken) {
    return null;
  }

  if (!user?.$id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.center}>
          <Text style={styles.hint}>Sign in to go live.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/home')}>
            <Text style={styles.backBtnText}>Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const qualityParam = typeof quality === 'string' ? quality : 'auto';
  const liveModeParam = liveMode === 'screen' ? 'screen' : 'camera';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.container}>
        <LiveStreamBroadcaster
          streamId={streamId}
          roomId={roomId}
          initialToken={hostToken}
          hostUserId={user.$id}
          hostDisplayName={user.username}
          quality={qualityParam}
          liveMode={liveModeParam}
          onStreamEnd={handleStreamEnd}
        />

        <LiveReactions streamId={streamId} isHost={true} />

        <TouchableOpacity
          style={styles.chatFab}
          onPress={() => setShowChat(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.chatFabText}>💬</Text>
        </TouchableOpacity>

        <Modal
          visible={showChat}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowChat(false)}
        >
          <View style={styles.chatModal}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>Live chat</Text>
              <TouchableOpacity onPress={() => setShowChat(false)} hitSlop={12}>
                <Text style={styles.chatClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <LiveChatPanel streamId={streamId} isHost={true} />
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  hint: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
  },
  backBtn: {
    backgroundColor: '#a77df8',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  chatFab: {
    position: 'absolute',
    bottom: Math.max(32, height * 0.06),
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatFabText: {
    fontSize: 24,
  },
  chatModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    marginTop: height * 0.28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.15)',
  },
  chatTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  chatClose: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
});

export default LiveBroadcast;

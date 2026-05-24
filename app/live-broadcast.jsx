import React, { useEffect } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LiveStreamBroadcaster, LiveReactions } from '../components';
import { useGlobalContext } from '../context/GlobalProvider';
import { useTranslation } from 'react-i18next';
import { peekLiveHostSession, clearLiveHostSession } from '../lib/pendingLiveBroadcast';

/** Expo Router may pass a param as string or string[] */
function firstRouteParam(value) {
  if (value == null) return undefined;
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : v != null ? String(v) : undefined;
}

const LiveBroadcast = () => {
  const params = useLocalSearchParams();
  const streamId = firstRouteParam(params.streamId);
  const stashed = streamId ? peekLiveHostSession(streamId) : null;
  const roomId = stashed?.roomId || firstRouteParam(params.roomId);
  const hostToken = stashed?.hostToken || firstRouteParam(params.hostToken);
  const quality = stashed?.quality ?? firstRouteParam(params.quality);
  const liveMode = stashed?.liveMode ?? firstRouteParam(params.liveMode);
  const { user } = useGlobalContext();
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
});

export default LiveBroadcast;

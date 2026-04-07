import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { isExpoGoOrStoreClient } from '../lib/videosdkNativeGate';

function FallbackBroadcaster({ streamId, onStreamEnd }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Live broadcast</Text>
      <Text style={styles.sub}>
        VideoSDK needs native modules that are not included in Expo Go. Create a development build:
        {'\n\n'}
        npx expo run:ios{'\n'}
        npx expo run:android
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => onStreamEnd?.()}>
        <Text style={styles.btnText}>Go back</Text>
      </TouchableOpacity>
      {streamId ? <Text style={styles.muted}>Room: {streamId}</Text> : null}
    </View>
  );
}

/**
 * Lazy-loads VideoSDK only outside Expo Go so importing this file from the components barrel
 * does not crash auth and other screens (see VideoSDKCallWrapper).
 */
export default function LiveStreamBroadcaster(props) {
  const Inner = useMemo(() => {
    if (isExpoGoOrStoreClient()) {
      return null;
    }
    try {
      return require('./LiveStreamBroadcasterImpl').default;
    } catch (e) {
      console.warn('LiveStreamBroadcaster: failed to load VideoSDK implementation', e);
      return null;
    }
  }, []);

  if (!Inner) {
    return <FallbackBroadcaster streamId={props.streamId} onStreamEnd={props.onStreamEnd} />;
  }

  return <Inner {...props} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  sub: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  btn: {
    backgroundColor: '#F44336',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
  },
  btnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  muted: {
    color: '#666',
    fontSize: 11,
    marginTop: 20,
    textAlign: 'center',
  },
});

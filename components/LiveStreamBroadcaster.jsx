import React from 'react';
import { View, StyleSheet } from 'react-native';
import AgoraBroadcasterWrapper from './AgoraBroadcasterWrapper';

const LiveStreamBroadcaster = ({ streamId, onStreamEnd }) => {
  return (
    <View style={styles.container}>
      {/* Use Agora Broadcaster wrapper (handles missing SDK gracefully) */}
      <AgoraBroadcasterWrapper 
        streamId={streamId}
        onStreamEnd={onStreamEnd}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

export default LiveStreamBroadcaster;


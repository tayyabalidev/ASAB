import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const LiveStreamBroadcaster = ({ streamId, onStreamEnd }) => {
  return (
    <View style={styles.container}>
      {/* TODO: Integrate your new live streaming SDK here */}
      <View style={styles.placeholderContainer}>
        <Text style={styles.placeholderText}>📹 Live Broadcast</Text>
        <Text style={styles.placeholderSubtext}>
          Live broadcasting feature needs to be integrated with your new SDK.
        </Text>
        <Text style={styles.placeholderSubtext}>
          Stream ID: {streamId}
        </Text>
        {onStreamEnd && (
          <TouchableOpacity style={styles.endButton} onPress={onStreamEnd}>
            <Text style={styles.endButtonText}>End Stream</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  placeholderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  placeholderText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  placeholderSubtext: {
    color: '#999',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
  },
  endButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 30,
  },
  endButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default LiveStreamBroadcaster;


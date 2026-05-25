/**
 * Call Button Component
 * 
 * Reusable button to initiate calls with users
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useGlobalContext } from '../context/GlobalProvider';
import { startOutgoingCall } from '../lib/startOutgoingCall';

const CallButton = ({ 
  receiverId, 
  receiverName, 
  callType = 'video', // 'audio' or 'video'
  style,
  iconSize = 20,
  showLabel = false,
}) => {
  const { user } = useGlobalContext();

  const handleCall = async () => {
    try {
      if (!user?.$id) {
        Alert.alert('Error', 'Please sign in to place a call');
        return;
      }
      await startOutgoingCall({
        userId: user.$id,
        receiverId,
        callType,
      });
    } catch (error) {
      console.error('Error initiating call:', error);
      const message =
        error?.message === 'You cannot call yourself'
          ? error.message
          : 'Failed to initiate call. Please try again.';
      Alert.alert('Error', message);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, style]}
      onPress={handleCall}
      activeOpacity={0.7}
    >
      <Feather
        name={callType === 'video' ? 'video' : 'phone'}
        size={iconSize}
        color={style?.color || "#fff"}
      />
      {showLabel && (
        <Text style={styles.label}>
          {callType === 'video' ? 'Video Call' : 'Audio Call'}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#4CAF50',
    padding: 12,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 50,
    minHeight: 50,
  },
  label: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
});

export default CallButton;

/**
 * Call Button Component
 * 
 * Reusable button to initiate calls with users
 */

import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useGlobalContext } from '../context/GlobalProvider';
import { getActiveCall } from '../lib/calls';

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
      // Check if user is already in a call
      const activeCall = await getActiveCall(user.$id);
      if (activeCall) {
        Alert.alert(
          'Call in Progress',
          'You are already in a call. Please end the current call first.'
        );
        return;
      }

      // Check if trying to call yourself
      if (receiverId === user.$id) {
        Alert.alert('Error', 'You cannot call yourself');
        return;
      }

      // Navigate to call screen with parameters
      router.push({
        pathname: '/call',
        params: {
          receiverId: receiverId,
          callType: callType,
        },
      });
    } catch (error) {
      console.error('Error initiating call:', error);
      Alert.alert('Error', 'Failed to initiate call. Please try again.');
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

/**
 * Call Screen
 * 
 * Handles incoming and outgoing calls
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useGlobalContext } from '../../context/GlobalProvider';
import {
  createCall,
  acceptCall,
  rejectCall,
  getCallById,
  subscribeCallUpdates,
  updateCallStatus,
} from '../../lib/calls';
import { generateCallChannelName, CallState } from '../../lib/callHelper';
import VideoSDKCallWrapper from '../../components/VideoSDKCallWrapper';

const CallScreen = () => {
  const params = useLocalSearchParams();
  const { user } = useGlobalContext();
  
  const [callState, setCallState] = useState('idle');
  const [callData, setCallData] = useState(null);
  const [callType, setCallType] = useState('video');
  const [isIncoming, setIsIncoming] = useState(false);
  const [error, setError] = useState(null);
  
  const unsubscribeRef = useRef(null);
  const isInitializedRef = useRef(false); // Prevent multiple initializations
  const paramsRef = useRef(params); // Track params to detect changes

  // Update params ref when params change
  useEffect(() => {
    const paramsChanged = JSON.stringify(paramsRef.current) !== JSON.stringify(params);
    if (paramsChanged) {
      paramsRef.current = params;
      isInitializedRef.current = false; // Reset initialization flag on param change
    }
  }, [params]);

  useEffect(() => {
    if (!user || !user.$id) {
      return;
    }
    
    // Prevent multiple initializations
    if (isInitializedRef.current) {
      return;
    }

    // Initialize call
    isInitializedRef.current = true;
    initializeCall();
    
    return () => {
      // Cleanup on unmount
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, [user?.$id, params.callId, params.receiverId, params.callType]);

  const initializeCall = async () => {
    try {
      setError(null);
      
      if (params.callId) {
        // Incoming call - load call data
        const call = await getCallById(params.callId);
        if (call) {
          setCallData(call);
          setIsIncoming(true);
          setCallType(call.callType || 'video');
          
          if (call.receiverId === user.$id) {
            // Receiver - show ringing state
            if (call.status === CallState.CALLING) {
              setCallState('ringing');
            } else if (call.status === CallState.CONNECTING || call.status === CallState.CONNECTED) {
              setCallState('connecting');
            } else {
              setCallState('ended');
              setTimeout(() => router.back(), 500);
              return;
            }
            
            // Subscribe to call updates
            if (unsubscribeRef.current) {
              unsubscribeRef.current();
            }
            unsubscribeRef.current = subscribeCallUpdates(call.$id, ({ payload }) => {
              if (payload.status === CallState.ENDED || payload.status === CallState.REJECTED) {
                handleCallEnd();
              } else if (payload.status === CallState.CONNECTING || payload.status === CallState.CONNECTED) {
                setCallState('connecting');
              }
            });
          } else {
            // Caller - check status
            if (call.status === CallState.REJECTED || call.status === CallState.ENDED) {
              handleCallEnd();
              return;
            } else if (call.status === CallState.CONNECTING || call.status === CallState.CONNECTED) {
              setCallState('connecting');
            } else {
              setCallState('calling');
            }
            
            // Subscribe to call updates for caller
            if (unsubscribeRef.current) {
              unsubscribeRef.current();
            }
            unsubscribeRef.current = subscribeCallUpdates(call.$id, ({ payload }) => {
              if (payload.status === CallState.REJECTED) {
                Alert.alert('Call Rejected', 'The call was rejected');
                handleCallEnd();
              } else if (payload.status === CallState.ENDED) {
                handleCallEnd();
              } else if (payload.status === CallState.CONNECTING || payload.status === CallState.CONNECTED) {
                // Receiver accepted - transition to connecting state
                setCallState('connecting');
                // Update call data
                setCallData(payload);
              }
            });
          }
        } else {
          setError('Call not found');
        }
      } else if (params.receiverId && params.callType) {
        // Outgoing call
        setIsIncoming(false);
        setCallType(params.callType);
        setCallState('calling');
        
        // Initiate call
        await initiateCall(params.receiverId, params.callType);
      } else {
        setError('Invalid call parameters');
      }
    } catch (error) {
      console.error('Error initializing call:', error);
      setError(error.message || 'Failed to initialize call');
    }
  };

  const initiateCall = async (receiverId, type) => {
    try {
      const call = await createCall(user.$id, receiverId, type, user.username);
      setCallData(call);
      
      // Subscribe to call updates
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      unsubscribeRef.current = subscribeCallUpdates(call.$id, ({ payload }) => {
        if (payload.status === CallState.REJECTED) {
          Alert.alert('Call Rejected', 'The call was rejected');
          handleCallEnd();
        } else if (payload.status === CallState.ENDED) {
          handleCallEnd();
        } else if (payload.status === CallState.CONNECTING || payload.status === CallState.CONNECTED) {
          setCallState('connecting');
        }
      });
    } catch (error) {
      console.error('Error initiating call:', error);
      setError(error.message || 'Failed to initiate call');
      setCallState('idle');
    }
  };

  const handleAcceptCall = async () => {
    try {
      if (!callData) return;
      
      setCallState('connecting');
      await acceptCall(callData.$id, user.$id);
      await updateCallStatus(callData.$id, CallState.CONNECTING);
      
      // Update local call data
      const updatedCall = await getCallById(callData.$id);
      setCallData(updatedCall);
      
      setCallState('connecting');
    } catch (error) {
      console.error('Error accepting call:', error);
      setError('Failed to accept call');
      handleCallEnd();
    }
  };

  const handleRejectCall = async () => {
    try {
      if (!callData) return;
      
      // Clean up subscriptions immediately
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      
      // Reject the call
      await rejectCall(callData.$id, user.$id);
      
      // End call immediately
      handleCallEnd();
    } catch (error) {
      console.error('Error rejecting call:', error);
      // Still end the call even if reject fails
      handleCallEnd();
    }
  };

  const handleCallEnd = () => {
    // Clean up subscriptions
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    setCallState('ended');
    
    // Navigate back after a short delay
    setTimeout(() => {
      router.back();
    }, 300);
  };

  const handleCallError = (error) => {
    try {
      console.error('❌ Call error:', error);
      
      // More specific error messages
      let errorMessage = 'An error occurred during the call';
      
      if (typeof error === 'string') {
        if (error.includes('PERMISSION')) {
          errorMessage = 'Microphone/Camera permission denied. Please enable in device settings.';
        } else {
          errorMessage = error;
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } catch (err) {
      // Prevent crash if error handling itself fails
      console.error('Error in handleCallError:', err);
    }
  };

  // Show error state
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: '#F44336', fontSize: 20, marginBottom: 20 }]}>⚠️ Error</Text>
          <Text style={[styles.loadingText, { fontSize: 14, color: '#999', textAlign: 'center', paddingHorizontal: 20 }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.button, styles.endButton, { marginTop: 30 }]}
            onPress={() => router.back()}
          >
            <Text style={styles.buttonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show calling/ringing UI
  if (callState === 'calling' || callState === 'ringing') {
    return (
      <View style={styles.container}>
        <View style={styles.callingContainer}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {isIncoming 
                  ? callData?.callerId?.charAt(0)?.toUpperCase() || 'C'
                  : callData?.receiverId?.charAt(0)?.toUpperCase() || 'R'}
              </Text>
            </View>
          </View>
          
          <Text style={styles.userName}>
            {isIncoming ? 'Incoming Call' : 'Calling...'}
          </Text>
          
          <Text style={styles.callType}>
            {callType === 'video' ? 'Video Call' : 'Audio Call'}
          </Text>

          {callState === 'calling' && (
            <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
          )}

          {isIncoming && callState === 'ringing' && (
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.rejectButton]}
                onPress={handleRejectCall}
              >
                <Text style={styles.buttonText}>✕</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.button, styles.acceptButton]}
                onPress={handleAcceptCall}
              >
                <Text style={styles.buttonText}>✓</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isIncoming && callState === 'calling' && (
            <TouchableOpacity
              style={[styles.button, styles.endButton]}
              onPress={handleCallEnd}
            >
              <Text style={styles.buttonText}>End Call</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Show connected call UI
  if (callState === 'connected' || callState === 'connecting') {
    if (!callData) {
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Connecting...</Text>
          </View>
        </View>
      );
    }

    // Use the stored channelName from call data (must be consistent for both users)
    // If channelName is missing, this is an error - both users need the same channel
    if (!callData.channelName) {
      console.error('Missing channelName in call data!', callData);
      setError('Call configuration error: Missing channel name');
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: '#F44336' }]}>Configuration Error</Text>
            <Text style={[styles.loadingText, { fontSize: 14, color: '#999', marginTop: 10 }]}>
              Missing channel name. Please try again.
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.endButton, { marginTop: 30 }]}
              onPress={handleCallEnd}
            >
              <Text style={styles.buttonText}>End Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    
    // Use channelName as meetingId for VideoSDK
    // VideoSDK uses meetingId instead of channelName
    const meetingId = callData.channelName || callData.meetingId;
    const receiverId = callData.receiverId === user.$id ? callData.callerId : callData.receiverId;

    if (!meetingId) {
      console.error('Missing meetingId/channelName in call data!', callData);
      setError('Call configuration error: Missing meeting ID');
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: '#F44336' }]}>Configuration Error</Text>
            <Text style={[styles.loadingText, { fontSize: 14, color: '#999', marginTop: 10 }]}>
              Missing meeting ID. Please try again.
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.endButton, { marginTop: 30 }]}
              onPress={handleCallEnd}
            >
              <Text style={styles.buttonText}>End Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <VideoSDKCallWrapper
        meetingId={meetingId}
        callerId={callData.callerId}
        receiverId={receiverId}
        currentUserId={user.$id}
        callType={callType}
        callId={callData.$id}
        onCallEnd={handleCallEnd}
        onError={handleCallError}
      />
    );
  }

  // Show loading state while user is not loaded
  if (!user || !user.$id) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading user...</Text>
        </View>
      </View>
    );
  }

  // Show loading state for initial call setup
  // If we have params but state is still idle, show calling UI immediately
  if (callState === 'idle') {
    if (params.receiverId && params.callType) {
      // Outgoing call - show calling UI immediately
      return (
        <View style={styles.container}>
          <View style={styles.callingContainer}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>R</Text>
              </View>
            </View>
            <Text style={styles.userName}>Calling...</Text>
            <Text style={styles.callType}>
              {params.callType === 'video' ? 'Video Call' : 'Audio Call'}
            </Text>
            <ActivityIndicator size="large" color="#4CAF50" style={styles.loader} />
            <TouchableOpacity
              style={[styles.button, styles.endButton]}
              onPress={handleCallEnd}
            >
              <Text style={styles.buttonText}>End Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    } else if (params.callId) {
      // Incoming call - show loading briefly
      return (
        <View style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4CAF50" />
            <Text style={styles.loadingText}>Loading call...</Text>
          </View>
        </View>
      );
    }
  }

  // Fallback - should not reach here, but just in case
  return (
    <View style={styles.container}>
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading...</Text>
        <TouchableOpacity
          style={[styles.button, styles.endButton, { marginTop: 30 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    width: '100%',
    height: '100%',
  },
  callingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000000',
  },
  avatarContainer: {
    marginBottom: 30,
  },
  avatar: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 64,
    color: '#fff',
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 28,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  callType: {
    fontSize: 18,
    color: '#999999',
    marginBottom: 40,
  },
  loader: {
    marginTop: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 40,
    marginTop: 60,
  },
  button: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  endButton: {
    backgroundColor: '#F44336',
    width: 120,
    height: 50,
    borderRadius: 25,
    marginTop: 40,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    padding: 20,
  },
  loadingText: {
    color: '#ffffff',
    marginTop: 20,
    fontSize: 16,
  },
});

export default CallScreen;

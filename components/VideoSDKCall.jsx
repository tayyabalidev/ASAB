/**
 * VideoSDK Call Component
 * 
 * Handles audio and video calls using VideoSDK
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  PermissionsAndroid,
  Platform,
} from 'react-native';
// VideoSDK React Native SDK imports
// Note: Install @videosdk.live/react-native-sdk package
import {
  MeetingProvider,
  useMeeting,
  useParticipant,
  RTCView,
} from '@videosdk.live/react-native-sdk';
import { VIDEOSDK_CONFIG } from '../lib/config';
import { getVideoSDKToken } from '../lib/videosdkHelper';
import { updateCallStatus, endCall } from '../lib/calls';
import { CallState } from '../lib/callHelper';

const { width, height } = Dimensions.get('window');

// Inner component that uses VideoSDK hooks
const VideoSDKCallInner = ({
  meetingId,
  currentUserId,
  callType = 'video',
  callId = null,
  onCallEnd,
  onError,
}) => {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [callDuration, setCallDuration] = useState(0);
  
  const durationIntervalRef = useRef(null);
  const callIdRef = useRef(callId);

  const { join, leave, toggleMic, toggleWebcam, participants } = useMeeting({
    onMeetingJoined: () => {
      console.log('✅ Joined VideoSDK meeting successfully');
      updateCallStatus(callIdRef.current, CallState.CONNECTED).catch(console.error);
    },
    onMeetingLeft: () => {
      console.log('👋 Left VideoSDK meeting');
      handleCallEnd();
    },
    onError: (error) => {
      console.error('❌ VideoSDK error:', error);
      Alert.alert('Call Error', error?.message || 'An error occurred during the call');
      if (onError) onError(error);
    },
    onParticipantJoined: (participant) => {
      console.log('👤 Participant joined:', participant.id);
    },
    onParticipantLeft: (participant) => {
      console.log('👋 Participant left:', participant.id);
      // If all participants left, end call
      if (participants.size === 0) {
        handleCallEnd();
      }
    },
  });

  useEffect(() => {
    // Start call duration timer
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Join meeting when component mounts
    const joinMeeting = async () => {
      try {
        // Request permissions first
        if (Platform.OS === 'android') {
          const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
          if (callType === 'video') {
            permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
          }
          const granted = await PermissionsAndroid.requestMultiple(permissions);
          
          const audioGranted = granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED;
          const cameraGranted = callType === 'video' 
            ? granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED
            : true;

          if (!audioGranted || !cameraGranted) {
            Alert.alert('Permissions Required', 'Microphone and camera permissions are required for calls.');
            if (onError) onError('PERMISSION_DENIED');
            return;
          }
        }

        // Join the meeting
        await join();
      } catch (error) {
        console.error('Error joining VideoSDK meeting:', error);
        Alert.alert('Error', 'Failed to join call. Please try again.');
        if (onError) onError(error);
      }
    };

    joinMeeting();
  }, [meetingId, join]);

  const handleCallEnd = async () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    try {
      if (callIdRef.current) {
        await endCall(callIdRef.current, currentUserId);
      }
    } catch (e) {
      console.warn('Error updating call status:', e);
    }
    try {
      await leave();
    } catch (e) {
      console.warn('Error leaving meeting:', e);
    }
    try {
      if (onCallEnd) onCallEnd();
    } catch (e) {
      console.warn('Error in onCallEnd:', e);
    }
  };

  const toggleMute = async () => {
    try {
      await toggleMic();
      setIsMuted(prev => !prev);
    } catch (error) {
      console.error('Error toggling mute:', error);
    }
  };

  const toggleVideo = async () => {
    if (callType !== 'video') return;

    try {
      await toggleWebcam();
      setIsVideoEnabled(prev => !prev);
    } catch (error) {
      console.error('Error toggling video:', error);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get remote participants
  const remoteParticipants = Array.from(participants.values()).filter(
    p => p.id !== currentUserId
  );

  return (
    <View style={styles.container}>
      {/* Remote Video Views */}
      {callType === 'video' && remoteParticipants.length > 0 && (
        <View style={styles.remoteVideoContainer}>
          {remoteParticipants.map((participant) => (
            <RemoteParticipantView
              key={participant.id}
              participant={participant}
            />
          ))}
        </View>
      )}

      {/* Local Video View (Picture-in-Picture) */}
      {callType === 'video' && isVideoEnabled && (
        <View style={styles.localVideoContainer}>
          <LocalParticipantView />
        </View>
      )}

      {/* Audio Call UI */}
      {callType === 'audio' && (
        <View style={styles.audioCallContainer}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {remoteParticipants[0]?.displayName?.charAt(0)?.toUpperCase() || 'U'}
              </Text>
            </View>
          </View>
          <Text style={styles.userName}>
            {remoteParticipants[0]?.displayName || 'User'}
          </Text>
          {remoteParticipants.length > 0 && (
            <Text style={styles.callStatus}>Connected</Text>
          )}
          {remoteParticipants.length === 0 && (
            <Text style={styles.callStatus}>Connecting...</Text>
          )}
        </View>
      )}

      {/* Call Info Overlay */}
      <View style={styles.infoOverlay}>
        <Text style={styles.durationText}>{formatDuration(callDuration)}</Text>
      </View>

      {/* Call Controls */}
      <View style={styles.controlsContainer}>
        {/* Mute Button */}
        <TouchableOpacity
          style={[styles.controlButton, isMuted && styles.controlButtonActive]}
          onPress={toggleMute}
        >
          <Text style={styles.controlButtonText}>
            {isMuted ? '🔇' : '🎤'}
          </Text>
        </TouchableOpacity>

        {/* Video Toggle (Video calls only) */}
        {callType === 'video' && (
          <TouchableOpacity
            style={[styles.controlButton, !isVideoEnabled && styles.controlButtonActive]}
            onPress={toggleVideo}
          >
            <Text style={styles.controlButtonText}>
              {isVideoEnabled ? '📹' : '📵'}
            </Text>
          </TouchableOpacity>
        )}

        {/* End Call Button */}
        <TouchableOpacity
          style={[styles.controlButton, styles.endCallButton]}
          onPress={handleCallEnd}
        >
          <Text style={styles.controlButtonText}>📞</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Remote Participant Video Component
const RemoteParticipantView = ({ participant }) => {
  const { webcamStream, webcamOn, displayName } = useParticipant(participant.id);

  if (!webcamOn || !webcamStream) {
    return (
      <View style={styles.remoteVideoPlaceholder}>
        <Text style={styles.placeholderText}>
          {displayName?.charAt(0)?.toUpperCase() || participant.id?.charAt(0)?.toUpperCase() || 'U'}
        </Text>
      </View>
    );
  }

  return (
    <RTCView
      streamURL={webcamStream.toURL()}
      style={styles.remoteVideo}
      objectFit="cover"
      zOrder={0}
    />
  );
};

// Local Participant Video Component
const LocalParticipantView = () => {
  const { localWebcamOn, localWebcamStream } = useMeeting();

  if (!localWebcamOn || !localWebcamStream) {
    return null;
  }

  return (
    <RTCView
      streamURL={localWebcamStream.toURL()}
      style={styles.localVideo}
      objectFit="cover"
      mirror={true}
      zOrder={1}
    />
  );
};

// Main VideoSDK Call Component
const VideoSDKCall = ({
  meetingId,
  callerId,
  receiverId,
  currentUserId,
  callType = 'video',
  callId = null,
  onCallEnd,
  onError,
}) => {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const meetingToken = await getVideoSDKToken(meetingId);
        setToken(meetingToken);
      } catch (error) {
        console.error('Error fetching token:', error);
        // Continue without token (dev mode)
        setToken(null);
      } finally {
        setLoading(false);
      }
    };

    fetchToken();
  }, [meetingId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Connecting...</Text>
        </View>
      </View>
    );
  }

  return (
    <MeetingProvider
      config={{
        meetingId: meetingId,
        micEnabled: VIDEOSDK_CONFIG.meetingSettings.micEnabled,
        webcamEnabled: callType === 'video' && VIDEOSDK_CONFIG.meetingSettings.webcamEnabled,
        name: currentUserId || 'User',
        notification: {
          title: 'VideoSDK Call',
          message: 'You are in a call',
        },
      }}
      token={token || VIDEOSDK_CONFIG.apiKey}
    >
      <VideoSDKCallInner
        meetingId={meetingId}
        currentUserId={currentUserId}
        callType={callType}
        callId={callId}
        onCallEnd={onCallEnd}
        onError={onError}
      />
    </MeetingProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideoContainer: {
    flex: 1,
  },
  remoteVideo: {
    flex: 1,
    width: width,
    height: height,
  },
  remoteVideoPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 64,
    color: '#fff',
    fontWeight: 'bold',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#fff',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  audioCallContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
  },
  avatarContainer: {
    marginBottom: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  userName: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  callStatus: {
    fontSize: 16,
    color: '#999',
  },
  infoOverlay: {
    position: 'absolute',
    top: 50,
    left: 20,
  },
  durationText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  controlButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: 'rgba(255, 0, 0, 0.5)',
  },
  endCallButton: {
    backgroundColor: '#F44336',
  },
  controlButtonText: {
    fontSize: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
});

export default VideoSDKCall;

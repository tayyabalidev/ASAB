import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, Alert } from 'react-native';
import { useGlobalContext } from '../context/GlobalProvider';
import { subscribeLiveStreamUpdates, followStreamer, unfollowStreamer, isFollowing, getFollowerCount } from '../lib/livestream';
import AgoraViewerWrapper from './AgoraViewerWrapper';

const { width, height } = Dimensions.get('window');

const LiveStreamPlayer = ({ stream, onClose }) => {
  const { user } = useGlobalContext();
  const [viewerCount, setViewerCount] = useState(stream?.viewerCount || 0);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);

  useEffect(() => {
    let unsubscribe;

    // Check follow status
    if (stream?.hostId && user?.$id && user.$id !== stream.hostId) {
      isFollowing(user.$id, stream.hostId)
        .then(setIsFollowingUser)
        .catch(console.error);
      
      getFollowerCount(stream.hostId)
        .then(setFollowerCount)
        .catch(console.error);
    }

    // Subscribe to stream updates
    if (stream?.$id) {
      unsubscribe = subscribeLiveStreamUpdates(stream.$id, (response) => {
        if (response.payload) {
          setViewerCount(response.payload.viewerCount || 0);
          
          // Check if stream ended
          if (response.payload.isLive === false) {
            if (onClose) onClose();
          }
        }
      });
    }

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [stream?.$id, user?.$id]);

  const handleFollowToggle = async () => {
    if (!user?.$id) {
      Alert.alert('Error', 'Please login to follow streamers');
      return;
    }

    if (!stream?.hostId) {
      Alert.alert('Error', 'Invalid stream host');
      return;
    }

    try {
      if (isFollowingUser) {
        await unfollowStreamer(user.$id, stream.hostId);
        setIsFollowingUser(false);
        setFollowerCount(prev => Math.max(0, prev - 1));
        Alert.alert('Success', `Unfollowed ${stream.hostUsername}`);
      } else {
        await followStreamer(user.$id, stream.hostId, stream.hostUsername);
        setIsFollowingUser(true);
        setFollowerCount(prev => prev + 1);
        Alert.alert('Success', `Following ${stream.hostUsername}`);
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      Alert.alert('Error', 'Failed to update follow status');
    }
  };

  if (!stream || !user?.$id) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Stream not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Use Agora Viewer wrapper (handles missing SDK gracefully) */}
      <AgoraViewerWrapper 
        stream={stream}
        userId={user.$id}
        onClose={onClose}
      />
      
      {/* Bottom Overlay - Stream Details */}
      <View style={styles.bottomOverlay}>
        <View style={styles.hostInfoContainer}>
          <View style={styles.hostInfo}>
            <Image 
              source={{ uri: stream.hostAvatar }} 
              style={styles.hostAvatarSmall}
            />
            <View style={styles.hostDetails}>
              <Text style={styles.hostName}>{stream.hostUsername}</Text>
              <Text style={styles.followerCountText}>
                {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
              </Text>
              <Text style={styles.streamTitle} numberOfLines={2}>{stream.title}</Text>
            </View>
          </View>

          {/* Follow Button */}
          {stream.hostId && user.$id !== stream.hostId && (
            <TouchableOpacity 
              style={[styles.followButton, isFollowingUser && styles.followingButton]}
              onPress={handleFollowToggle}
            >
              <Text style={[styles.followButtonText, isFollowingUser && styles.followingButtonText]}>
                {isFollowingUser ? '✓ Following' : '+ Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 15,
    paddingBottom: 120,
  },
  hostInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 10,
    borderRadius: 10,
  },
  hostInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  hostAvatarSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },
  hostDetails: {
    flex: 1,
  },
  hostName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  followerCountText: {
    color: '#aaa',
    fontSize: 11,
    marginBottom: 4,
  },
  streamTitle: {
    color: '#ddd',
    fontSize: 12,
  },
  followButton: {
    backgroundColor: '#a77df8',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginLeft: 10,
  },
  followingButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: '#a77df8',
  },
  followButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  followingButtonText: {
    color: '#a77df8',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
});

export default LiveStreamPlayer;


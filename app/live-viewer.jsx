import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions, TouchableOpacity, Alert, Text, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { LiveStreamPlayer, LiveChatPanel, LiveReactions } from '../components';
import { useGlobalContext } from '../context/GlobalProvider';
import { getLiveStreamById } from '../lib/livestream';
import { useTranslation } from 'react-i18next';

const { width, height } = Dimensions.get('window');

const LiveViewer = () => {
  const { streamId } = useLocalSearchParams();
  const { user } = useGlobalContext();
  const [stream, setStream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [isPiP, setIsPiP] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!streamId) {
      router.replace('/home');
      return;
    }

    const loadStream = async () => {
      try {
        const streamData = await getLiveStreamById(streamId);
        
        if (!streamData.isLive) {
          Alert.alert(t('liveViewer.streamEndedTitle'), t('liveViewer.streamEndedMessage'));
          router.replace('/live-streams');
          return;
        }

        setStream(streamData);
      } catch (error) {
        console.error('Error loading stream:', error);
        Alert.alert(t('common.error'), t('liveViewer.loadError'));
        router.replace('/live-streams');
      } finally {
        setLoading(false);
      }
    };

    loadStream();
  }, [streamId]);

  const handleClose = () => {
    router.replace('/home');
  };

  const toggleChat = () => {
    setShowChat(prev => !prev);
  };

  const handlePiPToggle = () => {
    setIsPiP(prev => !prev);
    Alert.alert(
      t('liveViewer.pip.title'),
      isPiP ? t('liveViewer.pip.exit') : t('liveViewer.pip.enter'),
      [{ text: t('common.ok') }]
    );
  };

  if (loading || !stream) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('liveViewer.loading')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.container}>
          {/* Video Player - Agora will work after EAS build */}
          <LiveStreamPlayer 
            stream={stream}
            onClose={handleClose}
          />

          {/* Live Reactions Overlay */}
          <LiveReactions streamId={streamId} isHost={false} />

          {/* Live Chat Panel */}
          {showChat && (
            <View style={styles.chatPanel}>
              <LiveChatPanel streamId={streamId} isHost={false} />
            </View>
          )}

          {/* Chat Toggle Button */}
          <TouchableOpacity 
            style={styles.chatToggle}
            onPress={toggleChat}
          >
            <View style={styles.chatToggleIcon}>
              <View style={styles.chatBubble1} />
              <View style={styles.chatBubble2} />
            </View>
          </TouchableOpacity>

          {/* Picture-in-Picture Toggle Button */}
          <TouchableOpacity 
            style={styles.pipToggle}
            onPress={handlePiPToggle}
          >
            <Text style={styles.pipIcon}>{isPiP ? '📺' : '📱'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
  },
  chatPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
    backgroundColor: 'transparent',
  },
  chatToggle: {
    position: 'absolute',
    bottom: height * 0.42,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatToggleIcon: {
    width: 24,
    height: 24,
    position: 'relative',
  },
  chatBubble1: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    top: 0,
    left: 0,
  },
  chatBubble2: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#a77df8',
    bottom: 0,
    right: 0,
  },
  pipToggle: {
    position: 'absolute',
    bottom: height * 0.42,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipIcon: {
    fontSize: 24,
  },
});

export default LiveViewer;


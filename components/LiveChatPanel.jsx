import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useGlobalContext } from '../context/GlobalProvider';
import { addLiveComment, getLiveComments, subscribeLiveComments } from '../lib/livestream';
import { images } from '../constants';

function isValidStreamId(streamId) {
  if (!streamId || typeof streamId !== 'string') return false;
  const trimmedId = streamId.trim();
  if (trimmedId === '' || trimmedId === 'null' || trimmedId === 'undefined') return false;
  if (trimmedId.length < 16 || trimmedId.length > 24 || !/^[a-zA-Z0-9]+$/.test(trimmedId)) {
    return false;
  }
  return true;
}

const LiveChatPanel = ({ streamId, isHost = false }) => {
  const { user } = useGlobalContext();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const flatListRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);
  }, []);

  useEffect(() => {
    if (!isValidStreamId(streamId)) return undefined;

    let cancelled = false;

    const loadComments = async () => {
      try {
        const initialComments = await getLiveComments(streamId);
        if (cancelled) return;
        setComments(initialComments);
        scrollToBottom();
      } catch (_) {
        /* ignore */
      }
    };

    loadComments();

    const unsubscribe = subscribeLiveComments(streamId, (response) => {
      const newItem = response?.payload;
      if (!newItem?.$id) return;
      setComments((prev) => {
        if (prev.some((c) => c.$id === newItem.$id)) return prev;
        return [...prev, newItem];
      });
      scrollToBottom();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [streamId, scrollToBottom]);

  const handleSendComment = async () => {
    const text = newComment.trim();
    if (!text || !user?.$id || posting) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic = {
      $id: tempId,
      streamId,
      userId: user.$id,
      username: user.username || 'You',
      avatar: user.avatar,
      content: text,
      $createdAt: new Date().toISOString(),
      _optimistic: true,
    };

    setPosting(true);
    setNewComment('');
    setComments((prev) => [...prev, optimistic]);
    scrollToBottom();

    try {
      const saved = await addLiveComment(
        streamId,
        user.$id,
        user.username,
        user.avatar,
        text
      );
      setComments((prev) =>
        prev.map((c) => (c.$id === tempId ? saved : c))
      );
    } catch (error) {
      setComments((prev) => prev.filter((c) => c.$id !== tempId));
      setNewComment(text);
      Alert.alert(
        'Chat',
        error?.message || 'Could not send message. Check your connection and try again.'
      );
    } finally {
      setPosting(false);
    }
  };

  const renderComment = ({ item }) => (
    <View style={styles.commentItem}>
      <Image source={{ uri: item.avatar || images.profile }} style={styles.commentAvatar} />
      <View style={styles.commentContent}>
        <Text style={styles.commentUsername}>
          {item.userId === user?.$id ? 'You' : item.username}
          {isHost && item.userId === user?.$id ? ' (Host)' : ''}
        </Text>
        <Text style={styles.commentText}>{item.content}</Text>
      </View>
    </View>
  );

  if (!isValidStreamId(streamId)) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>Chat unavailable for this stream.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={comments}
        keyExtractor={(item) => item.$id}
        renderItem={renderComment}
        contentContainerStyle={styles.commentsContainer}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToBottom}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No messages yet. Say hello!</Text>
        }
      />

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder={isHost ? 'Message viewers…' : 'Say something…'}
          placeholderTextColor="#888"
          value={newComment}
          onChangeText={setNewComment}
          editable={!posting}
          multiline
          maxLength={200}
        />
        <TouchableOpacity
          style={[styles.sendButton, posting && styles.sendButtonDisabled]}
          onPress={handleSendComment}
          disabled={posting || !newComment.trim()}
        >
          <Text style={styles.sendButtonText}>{posting ? '…' : '➤'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  commentsContainer: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexGrow: 1,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 8,
    borderRadius: 10,
  },
  commentAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    color: '#a77df8',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  commentText: {
    color: '#fff',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 14,
    maxHeight: 80,
  },
  sendButton: {
    marginLeft: 8,
    backgroundColor: '#a77df8',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#666',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default LiveChatPanel;

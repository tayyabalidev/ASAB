import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useMeeting, usePubSub } from '@videosdk.live/react-native-sdk';

/**
 * In-meeting chat via VideoSDK PubSub (topic CHAT). Must render inside MeetingProvider.
 */
export default function LiveMeetingChat({
  displayName = 'User',
  showRaiseHand = false,
  onRaiseHand,
  style,
}) {
  const { localParticipant } = useMeeting();
  const localParticipantId = localParticipant?.id;
  const chat = usePubSub('CHAT', {});
  const { publish: publishRaiseHand } = usePubSub('RAISE_HAND');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const messages = chat?.messages || [];

  useEffect(() => {
    if (!messages.length) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await Promise.resolve(chat.publish(text, { persist: true }));
      setMessage('');
    } catch (_) {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const handleRaiseHand = () => {
    if (!localParticipantId) return;
    try {
      publishRaiseHand(
        {
          senderName: displayName,
          participantId: localParticipantId,
        },
        { persist: false }
      );
      onRaiseHand?.();
    } catch (_) {
      /* ignore */
    }
  };

  const renderItem = ({ item, index }) => {
    const text = item?.message ?? '';
    const senderId = item?.senderId;
    const senderName = item?.senderName || 'Viewer';
    const isLocal = senderId && senderId === localParticipantId;
    const time = item?.timestamp
      ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <View
        key={`${index}-${senderId}`}
        style={[styles.bubble, isLocal ? styles.bubbleLocal : styles.bubbleRemote]}
      >
        <Text style={styles.sender}>{isLocal ? 'You' : senderName}</Text>
        <Text style={styles.body}>{text}</Text>
        {time ? <Text style={styles.time}>{time}</Text> : null}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(_, index) => `chat-${index}`}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No messages yet. Say hello!</Text>
        }
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Message…"
          placeholderTextColor="#888"
          value={message}
          onChangeText={setMessage}
          editable={!sending}
          multiline
          maxLength={300}
        />
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={sending || !message.trim()}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
        {showRaiseHand ? (
          <TouchableOpacity style={styles.raiseBtn} onPress={handleRaiseHand}>
            <Text style={styles.raiseText}>✋</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  list: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexGrow: 1,
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
  bubble: {
    maxWidth: '85%',
    padding: 10,
    borderRadius: 12,
    marginVertical: 4,
  },
  bubbleLocal: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(167, 125, 248, 0.35)',
  },
  bubbleRemote: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sender: {
    color: '#a77df8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  body: {
    color: '#fff',
    fontSize: 14,
  },
  time: {
    color: '#999',
    fontSize: 10,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    fontSize: 14,
    maxHeight: 80,
  },
  sendBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#a77df8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#666',
  },
  sendText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  raiseBtn: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  raiseText: {
    fontSize: 20,
  },
});

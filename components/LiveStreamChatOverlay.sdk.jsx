import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Keyboard,
  Platform,
} from 'react-native';
import { useMeeting, usePubSub } from '@videosdk.live/react-native-sdk';
import { useGlobalContext } from '../context/GlobalProvider';
import { addLiveComment, getLiveComments } from '../lib/livestream';

const USERNAME_COLORS = ['#7dd3fc', '#a77df8', '#f9a8d4', '#86efac', '#fcd34d', '#fda4af'];

function messageKey(msg) {
  if (msg.id) return `id:${msg.id}`;
  return `${msg.senderId || ''}|${msg.text || ''}|${msg.timestamp || ''}`;
}

function pickUsernameColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USERNAME_COLORS[Math.abs(hash) % USERNAME_COLORS.length];
}

/**
 * TikTok-style live chat overlay — VideoSDK PubSub for instant delivery + Appwrite persistence.
 * Must render inside MeetingProvider.
 */
export default function LiveStreamChatOverlay({
  streamId,
  displayName = 'Viewer',
  visible = true,
  bottomOffset = 110,
  compact = false,
}) {
  const { user } = useGlobalContext();
  const { localParticipant } = useMeeting();
  const localParticipantId = localParticipant?.id;
  const chat = usePubSub('CHAT', {});
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [displayMessages, setDisplayMessages] = useState([]);
  const scrollRef = useRef(null);
  const seenRef = useRef(new Set());
  const lastChatIndexRef = useRef(0);
  const historyLoadedRef = useRef(false);

  const appendMessage = useCallback((msg) => {
    const text = (msg.text || '').trim();
    if (!text) return;
    const key = messageKey(msg);
    if (seenRef.current.has(key)) return;

    setDisplayMessages((prev) => {
      const msgTime = msg.timestamp ? new Date(msg.timestamp).getTime() : 0;
      const isNearDuplicate = prev.some((m) => {
        if (m.senderId !== msg.senderId || m.text !== text) return false;
        if (!msgTime || !m.timestamp) return true;
        return Math.abs(new Date(m.timestamp).getTime() - msgTime) < 5000;
      });
      if (isNearDuplicate) return prev;
      seenRef.current.add(key);
      return [...prev.slice(-49), { ...msg, text }];
    });
  }, []);

  useEffect(() => {
    if (!streamId || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    getLiveComments(streamId, 40)
      .then((comments) => {
        comments.forEach((c) => {
          appendMessage({
            id: c.$id,
            senderId: c.userId,
            senderName: c.username || 'Viewer',
            text: c.content,
            timestamp: c.$createdAt,
          });
        });
      })
      .catch(() => {});
  }, [streamId, appendMessage]);

  useEffect(() => {
    const msgs = chat?.messages || [];
    for (let i = lastChatIndexRef.current; i < msgs.length; i += 1) {
      const item = msgs[i];
      if (item?.senderId && item.senderId === localParticipantId) {
        continue;
      }
      appendMessage({
        senderId: item?.senderId,
        senderName: item?.senderName || 'Viewer',
        text: item?.message ?? '',
        timestamp: item?.timestamp,
      });
    }
    lastChatIndexRef.current = msgs.length;
  }, [chat?.messages, appendMessage, localParticipantId]);

  useEffect(() => {
    if (!displayMessages.length) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [displayMessages.length]);

  const sendMessage = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    appendMessage({
      senderId: localParticipantId,
      senderName: displayName || user?.username || 'Viewer',
      text,
      timestamp: new Date().toISOString(),
    });
    setMessage('');
    try {
      if (typeof chat?.publish !== 'function') {
        throw new Error('Chat is unavailable');
      }
      await Promise.resolve(chat.publish(text, { persist: true }));
      Keyboard.dismiss();
      if (streamId && user?.$id) {
        addLiveComment(
          streamId,
          user.$id,
          displayName || user.username || 'Viewer',
          user.avatar || '',
          text
        ).catch(() => {});
      }
    } catch (_) {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  if (!visible) return null;

  return (
    <View
      style={[styles.root, { bottom: bottomOffset }, compact && styles.rootCompact]}
      pointerEvents="box-none"
    >
      <ScrollView
        ref={scrollRef}
        style={[styles.messageList, compact && styles.messageListCompact]}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        pointerEvents="box-none"
      >
        {displayMessages.map((item, index) => {
          const isLocal = item.senderId && item.senderId === localParticipantId;
          const name = isLocal ? 'You' : item.senderName || 'Viewer';
          const nameColor = pickUsernameColor(name);
          return (
            <View key={`${messageKey(item)}-${index}`} style={styles.commentBubble}>
              <Text style={styles.commentText} numberOfLines={3}>
                <Text style={[styles.username, { color: nameColor }]}>{name}: </Text>
                <Text style={styles.body}>{item.text}</Text>
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Say something…"
          placeholderTextColor="rgba(255,255,255,0.45)"
          value={message}
          onChangeText={setMessage}
          editable={!sending}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          maxLength={300}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (sending || !message.trim()) && styles.sendBtnDisabled]}
          onPress={sendMessage}
          disabled={sending || !message.trim()}
          activeOpacity={0.85}
        >
          <Text style={styles.sendIcon}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 12,
    right: 72,
    zIndex: 26,
  },
  rootCompact: {
    right: 68,
  },
  messageList: {
    maxHeight: 220,
    marginBottom: 8,
  },
  messageListCompact: {
    maxHeight: 150,
  },
  messageListContent: {
    paddingTop: 4,
    paddingBottom: 4,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  commentBubble: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 19,
  },
  username: {
    fontWeight: '700',
  },
  body: {
    color: '#fff',
    fontWeight: '400',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 24,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 8,
    maxHeight: 72,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#a77df8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  sendIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});

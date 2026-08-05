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
  Alert,
  Image,
} from 'react-native';
import { useMeeting, usePubSub } from '@videosdk.live/react-native-sdk';
import { useGlobalContext } from '../context/GlobalProvider';
import { addLiveComment, getLiveComments } from '../lib/livestream';
import { encodePubSubPayload, decodePubSubMessage } from '../lib/livePubSubPayload';
import { getPhotoUrl } from '../lib/appwrite';
import images from '../constants/images';

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

function resolveAvatarUri(avatar) {
  if (!avatar) return null;
  const url = getPhotoUrl(avatar);
  if (url) return url;
  if (typeof avatar === 'string' && avatar.startsWith('http')) return avatar;
  return null;
}

/** Support plain-text legacy chat + JSON payloads with avatar. */
function parseChatEnvelope(item) {
  const decoded = decodePubSubMessage(item);
  const raw = item?.message;
  let text = '';
  let avatar = '';
  let senderName = item?.senderName || decoded.senderName || '';

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{')) {
      text = String(decoded.text || decoded.message || '').trim();
      avatar = decoded.avatar || '';
      if (decoded.senderName) senderName = decoded.senderName;
    } else {
      text = trimmed;
    }
  } else if (raw && typeof raw === 'object') {
    text = String(raw.text || raw.message || decoded.text || '').trim();
    avatar = raw.avatar || decoded.avatar || '';
    if (raw.senderName) senderName = raw.senderName;
  } else {
    text = String(decoded.text || decoded.message || '').trim();
    avatar = decoded.avatar || '';
  }

  return {
    text,
    avatar,
    senderName: senderName || 'Viewer',
    senderId: item?.senderId || decoded.senderId || null,
    timestamp: item?.timestamp,
  };
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
  messageMaxHeight,
  compact = false,
  showRaiseHand = false,
}) {
  const { user } = useGlobalContext();
  const { localParticipant } = useMeeting();
  const localParticipantId = localParticipant?.id;
  const chat = usePubSub('CHAT', {});
  const { publish: publishRaiseHand } = usePubSub('RAISE_HAND', {});
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [raiseSent, setRaiseSent] = useState(false);
  const [raiseBusy, setRaiseBusy] = useState(false);
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
            avatar: c.avatar || '',
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
      const parsed = parseChatEnvelope(item);
      appendMessage({
        senderId: parsed.senderId,
        senderName: parsed.senderName,
        avatar: parsed.avatar,
        text: parsed.text,
        timestamp: parsed.timestamp,
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
    const avatar = user?.avatar || '';
    appendMessage({
      senderId: localParticipantId,
      senderName: displayName || user?.username || 'Viewer',
      avatar,
      text,
      timestamp: new Date().toISOString(),
    });
    setMessage('');
    try {
      if (typeof chat?.publish !== 'function') {
        throw new Error('Chat is unavailable');
      }
      const payload = encodePubSubPayload({
        text,
        senderName: displayName || user?.username || 'Viewer',
        avatar,
        senderId: user?.$id || localParticipantId || '',
      });
      await Promise.resolve(chat.publish(payload, { persist: true }));
      Keyboard.dismiss();
      if (streamId && user?.$id) {
        addLiveComment(
          streamId,
          user.$id,
          displayName || user.username || 'Viewer',
          avatar,
          text
        ).catch(() => {});
      }
    } catch (_) {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  const handleRaiseHand = async () => {
    if (raiseSent || raiseBusy) return;
    if (!localParticipantId) {
      Alert.alert(
        'Not connected yet',
        'Wait until the live connection finishes, then tap ✋ again.'
      );
      return;
    }
    if (typeof publishRaiseHand !== 'function') {
      Alert.alert('Unavailable', 'Could not send join request. Try again in a moment.');
      return;
    }
    setRaiseBusy(true);
    try {
      const payload = encodePubSubPayload({
        senderName: displayName || user?.username || 'Viewer',
        participantId: localParticipantId,
      });
      await Promise.resolve(publishRaiseHand(payload, { persist: false }));
      setRaiseSent(true);
      // Do NOT use Alert.alert here — it blocks the later host-invite UI on iOS/Android.
      setTimeout(() => setRaiseSent(false), 8000);
    } catch (_) {
      Alert.alert('Request failed', 'Could not reach the host. Check your connection and try again.');
    } finally {
      setRaiseBusy(false);
    }
  };

  if (!visible) {
    if (!showRaiseHand) return null;
    return (
      <View style={[styles.raiseFabWrap, { bottom: bottomOffset + 8 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.raiseFab, (raiseSent || raiseBusy) && styles.raiseBtnSent]}
          onPress={handleRaiseHand}
          disabled={raiseSent || raiseBusy}
          activeOpacity={0.85}
          accessibilityLabel="Request to join stage"
        >
          <Text style={styles.raiseIcon}>✋</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const resolvedMessageMaxHeight =
    messageMaxHeight ?? (compact ? 140 : 180);

  return (
    <View
      style={[styles.root, { bottom: bottomOffset }, compact && styles.rootCompact]}
      pointerEvents="box-none"
      collapsable={false}
    >
      <ScrollView
        ref={scrollRef}
        style={[styles.messageList, { maxHeight: resolvedMessageMaxHeight }]}
        contentContainerStyle={styles.messageListContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        pointerEvents="box-none"
      >
        {displayMessages.map((item, index) => {
          const isLocal = item.senderId && item.senderId === localParticipantId;
          const name = isLocal ? 'You' : item.senderName || 'Viewer';
          const nameColor = pickUsernameColor(name);
          const avatarUri = resolveAvatarUri(item.avatar);
          return (
            <View key={`${messageKey(item)}-${index}`} style={styles.commentBubble}>
              <Image
                source={avatarUri ? { uri: avatarUri } : images.profile}
                style={styles.commentAvatar}
              />
              <Text style={styles.commentText} numberOfLines={3}>
                <Text style={[styles.username, { color: nameColor }]}>{name}: </Text>
                <Text style={styles.body}>{item.text}</Text>
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {raiseSent ? (
        <Text style={styles.raiseHint}>Request sent — wait for the host to invite you.</Text>
      ) : null}

      <View style={styles.inputRow} collapsable={false}>
        <TextInput
          style={styles.input}
          placeholder="Say something…"
          placeholderTextColor="rgba(255,255,255,0.65)"
          value={message}
          onChangeText={setMessage}
          editable={!sending}
          returnKeyType="send"
          onSubmitEditing={sendMessage}
          maxLength={300}
          keyboardAppearance="dark"
          underlineColorAndroid="transparent"
          selectionColor="#a77df8"
          cursorColor="#ffffff"
          autoCorrect
        />
        {showRaiseHand ? (
          <TouchableOpacity
            style={[styles.raiseBtn, (raiseSent || raiseBusy) && styles.raiseBtnSent]}
            onPress={handleRaiseHand}
            disabled={raiseSent || raiseBusy}
            activeOpacity={0.85}
            accessibilityLabel="Request to join stage"
          >
            <Text style={styles.raiseIcon}>✋</Text>
          </TouchableOpacity>
        ) : null}
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
    zIndex: 40,
    elevation: 40,
  },
  rootCompact: {
    right: 68,
  },
  messageList: {
    marginBottom: 8,
  },
  messageListContent: {
    paddingTop: 4,
    paddingBottom: 4,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  raiseHint: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginBottom: 6,
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  commentBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 6,
    gap: 8,
  },
  commentAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginTop: 1,
  },
  commentText: {
    flexShrink: 1,
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
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 24,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 41,
    elevation: 41,
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    paddingVertical: 8,
    maxHeight: 72,
    backgroundColor: 'transparent',
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
  raiseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  raiseBtnSent: {
    opacity: 0.45,
  },
  raiseIcon: {
    fontSize: 16,
  },
  raiseFabWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 40,
    elevation: 40,
  },
  raiseFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

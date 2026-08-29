import { useFocusEffect } from "expo-router";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Image, FlatList, TouchableOpacity, Text, Alert, TextInput, Platform, StyleSheet } from "react-native";
import { Swipeable, GestureHandlerRootView } from "react-native-gesture-handler";
import { Feather } from "@expo/vector-icons";

import { icons, images } from "../../constants";
import { databases, appwriteConfig, toggleFollowUser, markNotificationAsRead } from "../../lib/appwrite";
import { refreshNotificationUpdates } from "../../lib/notificationService";
import { refreshMessageUpdates } from "../../lib/messageService";
import { navigateFromInboxNotification } from "../../lib/notificationNavigation";
import { useNotifications } from "../../hooks/useNotifications";
import { useUserMessages } from "../../hooks/useUserMessages";
import { getCallById } from "../../lib/calls";
import { CallState } from "../../lib/callHelper";
import { useGlobalContext } from "../../context/GlobalProvider";
import { useTranslation } from "react-i18next";

// Helper function to get proper avatar URL
const getAvatarUrl = (avatarField) => {
  if (!avatarField) return images.profile;
  
  // If it's already a full URL, return it
  if (avatarField.startsWith('http')) {
    return avatarField;
  }
  
  // If it's just a file ID, construct the full URL
  if (avatarField.length < 50 && !avatarField.includes('/')) {
    return `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.storageId}/files/${avatarField}/preview?width=2000&height=2000&gravity=top&quality=100&project=${appwriteConfig.projectId}`;
  }
  
  // If it's truncated, try to use the original avatar or fallback
  return images.profile;
};

const getNotificationMessage = (item, t) => {
  if (!item) return '';
  const key = `inbox.notifications.${item.type}`;
  const translated = t(key, { defaultValue: '' });
  if (translated && translated !== key) return translated;

  switch (item.type) {
    case 'follow':
      return 'started following you';
    case 'profile_like':
      return 'liked your profile';
    case 'like':
      return 'liked your post';
    case 'comment':
      return 'commented on your post';
    case 'message':
      return 'sent you a message';
    case 'live':
      return 'is going live';
    case 'video_post':
      return 'posted a new video';
    case 'photo_post':
      return 'posted a new photo';
    case 'call':
      return 'is calling you';
    case 'location_invite':
      return 'invited you to share live location';
    case 'location_share':
      return 'started sharing their live location';
    default:
      return 'interacted with you';
  }
};

const Inbox = () => {
  const { t } = useTranslation();
  const { user: currentUser, theme, isDarkMode, followStatus, updateFollowStatus } = useGlobalContext();
  const { notifications, setNotifications, loading: notificationsLoading } = useNotifications();
  const { messages: allUserMessages, loading: messagesLoading } = useUserMessages();
  const [followingStates, setFollowingStates] = useState({});
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mountedRef = useRef(true);

  const recentMessages = useMemo(() => {
    if (!currentUser?.$id || !allUserMessages.length) return [];

    const partnerMap = new Map();
    allUserMessages.forEach((msg) => {
      const otherUserId = msg.senderId === currentUser.$id ? msg.receiverId : msg.senderId;
      if (!otherUserId || otherUserId === currentUser.$id) return;
      if (!partnerMap.has(otherUserId)) partnerMap.set(otherUserId, []);
      partnerMap.get(otherUserId).push(msg);
    });

    return [...partnerMap.entries()]
      .map(([otherUserId, messages]) => ({
        $id: otherUserId,
        otherUserId,
        otherUsername: 'User',
        otherUserAvatar: images.profile,
        messages,
        _needsProfile: true,
      }))
      .sort((a, b) => {
        const aLast = Math.max(...a.messages.map((m) => new Date(m.$createdAt).getTime()));
        const bLast = Math.max(...b.messages.map((m) => new Date(m.$createdAt).getTime()));
        return bLast - aLast;
      });
  }, [allUserMessages, currentUser?.$id]);

  const [recentMessagesEnriched, setRecentMessagesEnriched] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const enrich = async () => {
      if (!recentMessages.length) {
        if (!cancelled) setRecentMessagesEnriched([]);
        return;
      }

      const enriched = await Promise.all(
        recentMessages.map(async (chat) => {
          let otherUsername = 'User';
          let otherUserAvatar = images.profile;
          try {
            const user = await databases.getDocument(
              appwriteConfig.databaseId,
              appwriteConfig.userCollectionId,
              chat.otherUserId
            );
            otherUsername = user.username || user.email || 'User';
            otherUserAvatar = getAvatarUrl(user.avatar);
          } catch (_) {}
          return { ...chat, otherUsername, otherUserAvatar };
        })
      );

      if (!cancelled) setRecentMessagesEnriched(enriched);
    };

    enrich();
    return () => {
      cancelled = true;
    };
  }, [recentMessages]);

  const displayRecentMessages = recentMessagesEnriched.length
    ? recentMessagesEnriched
    : recentMessages;

  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );

  const loading = notificationsLoading || messagesLoading;

  // Pull latest notifications + messages as soon as Inbox is opened
  useFocusEffect(
    useCallback(() => {
      refreshNotificationUpdates();
      refreshMessageUpdates();
    }, [])
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, [currentUser]);

  // Initialize follow states from notifications
  useEffect(() => {
    if (notifications.length > 0 && currentUser) {
      const followNotifications = notifications.filter(n => n.type === 'follow');
      const states = {};
      followNotifications.forEach(notif => {
        // Check if already following
        const isFollowing = followStatus[notif.fromUserId] !== undefined 
          ? followStatus[notif.fromUserId]
          : currentUser.following?.includes(notif.fromUserId) || false;
        states[notif.fromUserId] = isFollowing;
      });
      setFollowingStates(states);
    }
  }, [notifications, currentUser, followStatus]);

  const getUnreadCount = (chat) => {
    if (!chat.messages) return 0;
    return chat.messages.filter(
      m => m.receiverId === currentUser.$id && m.is_read === false
    ).length;
  };

  const handleNotificationPress = async (notification) => {
    // Mark notification as read when user taps on it
    if (!notification.isRead || notification.isRead === false) {
      try {
        await markNotificationAsRead(notification.$id);
        setNotifications(prev =>
          prev.map(n => n.$id === notification.$id ? { ...n, isRead: true } : n)
        );
      } catch (error) {
        // Silent fail
      }
    }

    if (notification.type === 'call') {
      const callId = notification.postId;
      if (!callId) {
        Alert.alert('Call unavailable', 'This notification is missing call details.');
        return;
      }
      try {
        const call = await getCallById(callId);
        if (
          call.status === CallState.CALLING ||
          call.status === CallState.CONNECTING ||
          call.status === CallState.CONNECTED
        ) {
          navigateFromInboxNotification(router, { type: 'call', postId: callId });
        } else {
          Alert.alert('Call ended', 'This call is no longer active.');
        }
      } catch (_) {
        Alert.alert('Call unavailable', 'Could not open this call.');
      }
      return;
    }

    if (
      (notification.type === 'like' ||
        notification.type === 'comment' ||
        notification.type === 'video_post' ||
        notification.type === 'photo_post') &&
      !notification.postId
    ) {
      Alert.alert('Post unavailable', 'This notification is missing post details.');
      return;
    }

    if (
      (notification.type === 'follow' || notification.type === 'profile_like' || notification.type === 'message') &&
      !notification.fromUserId
    ) {
      Alert.alert('Unavailable', 'This notification is missing user details.');
      return;
    }

    navigateFromInboxNotification(router, notification);
  };

  const handleMessagePress = (message) => {
    navigateFromInboxNotification(router, {
      type: 'message',
      fromUserId: message.otherUserId,
    });
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const time = new Date(timestamp);
    const now = new Date();
    
    // Check if date is today
    const isToday = time.toDateString() === now.toDateString();
    
    // Check if date is yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = time.toDateString() === yesterday.toDateString();
    
    // Check if date is within current year
    const isCurrentYear = time.getFullYear() === now.getFullYear();
    
    if (isToday) {
      // Today: Show time only (e.g., "2:30 PM")
      return time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } else if (isYesterday) {
      // Yesterday: Show "Yesterday" with time
      return `Yesterday ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    } else if (isCurrentYear) {
      // This year: Show date and time (e.g., "Jan 15, 2:30 PM")
      return time.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
             ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } else {
      // Previous year: Show full date with time (e.g., "Jan 15, 2024, 2:30 PM")
      return time.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) + 
             ' ' + time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    }
  };

  const filteredNotifications = useMemo(() => {
    if (!searchQuery.trim()) return notifications;
    const query = searchQuery.toLowerCase();
    return notifications.filter((item) => {
      const username = item.fromUsername?.toLowerCase() || '';
      const type = item.type?.toLowerCase() || '';
      const messageText = getNotificationMessage(item, t).toLowerCase();
      return (
        username.includes(query) ||
        type.includes(query) ||
        messageText.includes(query)
      );
    });
  }, [notifications, searchQuery]);

  const filteredRecentMessages = useMemo(() => {
    if (!searchQuery.trim()) return displayRecentMessages;
    const query = searchQuery.toLowerCase();
    return displayRecentMessages.filter((chat) => {
      const username = chat.otherUsername?.toLowerCase() || '';
      const messageMatch = chat.messages?.some((msg) =>
        (msg.content || '').toLowerCase().includes(query)
      );
      return username.includes(query) || messageMatch;
    });
  }, [displayRecentMessages, searchQuery]);

  const followNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'follow'),
    [filteredNotifications]
  );
  const activityNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'like' || n.type === 'comment'),
    [filteredNotifications]
  );
  const subscriptionNotifications = useMemo(
    () =>
      filteredNotifications.filter((n) =>
        n.type === 'live' ||
        n.type === 'video_post' ||
        n.type === 'photo_post' ||
        n.type === 'location_invite' ||
        n.type === 'location_share'
      ),
    [filteredNotifications]
  );
  const messageNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'message'),
    [filteredNotifications]
  );
  const callNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'call'),
    [filteredNotifications]
  );

  const followUnreadCount = followNotifications.filter((n) => !n.isRead).length;
  const activityUnreadCount = activityNotifications.filter((n) => !n.isRead).length;
  const subscriptionUnreadCount = subscriptionNotifications.filter((n) => !n.isRead).length;
  const messageUnreadCount = messageNotifications.filter((n) => !n.isRead).length;
  const callUnreadCount = callNotifications.filter((n) => !n.isRead).length;

  const toggleSearch = () => {
    setSearchActive((prev) => {
      const next = !prev;
      if (!next) {
        setSearchQuery('');
      }
      return next;
    });
  };

  const deleteNotification = useCallback(async (item) => {
    if (!item?.$id) return;
    try {
      await databases.deleteDocument(
        appwriteConfig.databaseId,
        appwriteConfig.notificationsCollectionId,
        item.$id
      );
      setNotifications((prev) => prev.filter((n) => n.$id !== item.$id));
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('common.deleteError'));
    }
  }, [setNotifications, t]);

  const renderNotificationItem = ({ item }) => {
    const isFollow = item.type === 'follow';
    const isLive = item.type === 'live';
    const notificationText = getNotificationMessage(item, t);

    const renderRightActions = () => (
      <TouchableOpacity
        onPress={() => deleteNotification(item)}
        activeOpacity={0.85}
        style={styles.swipeDelete}
      >
        <Feather name="trash-2" size={22} color="#fff" />
        <Text style={styles.swipeDeleteText}>{t('delete', { defaultValue: 'Delete' })}</Text>
      </TouchableOpacity>
    );

    return (
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
        friction={2}
        rightThreshold={40}
        containerStyle={styles.swipeContainer}
      >
        <TouchableOpacity
          onPress={() => handleNotificationPress(item)}
          activeOpacity={0.85}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: item.isRead ? theme.surface : theme.accentSoft,
            borderBottomWidth: 0.5,
            borderBottomColor: theme.divider,
            borderRadius: 12,
            marginHorizontal: 16,
            marginBottom: 8,
          }}
        >
          {/* User Avatar */}
          <Image
            source={{ uri: getAvatarUrl(item.fromUserAvatar) }}
            style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
            resizeMode="cover"
          />

          {/* Notification Content */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '600' }}>
              {item.fromUsername}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
              {notificationText}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
              {formatTime(item.createdAt)}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isFollow && (() => {
              const isFollowingUser = followingStates[item.fromUserId] || false;
              return (
                <TouchableOpacity
                  onPress={async () => {
                    if (!currentUser?.$id || !item.fromUserId || currentUser.$id === item.fromUserId) return;
                    
                    // Immediate visual feedback
                    const newFollowState = !isFollowingUser;
                    setFollowingStates(prev => ({ ...prev, [item.fromUserId]: newFollowState }));
                    updateFollowStatus(item.fromUserId, newFollowState);
                    
                    try {
                      await toggleFollowUser(currentUser.$id, item.fromUserId);
                      refreshNotificationUpdates();
                    } catch (error) {
                      // Revert on error
                      setFollowingStates(prev => ({ ...prev, [item.fromUserId]: !newFollowState }));
                      updateFollowStatus(item.fromUserId, !newFollowState);
                      Alert.alert(t('common.error'), error.message || t('profile.alerts.followError'));
                    }
                  }}
                  style={{
                    backgroundColor: isFollowingUser ? theme.cardSoft : theme.accent,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 16
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
                    {isFollowingUser ? 'Following' : 'Follow Back'}
                  </Text>
                </TouchableOpacity>
              );
            })()}
            {isLive && (
              <View style={{
                backgroundColor: '#ff4757',
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 12,
                flexDirection: 'row',
                alignItems: 'center'
              }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 6 }} />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                  LIVE
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  const renderMessageItem = ({ item }) => {
    const unreadCount = getUnreadCount(item);
    // Find the latest message from item.messages
    const latestMsg = item.messages && item.messages.length > 0
      ? item.messages.reduce((a, b) => new Date(a.$createdAt) > new Date(b.$createdAt) ? a : b)
      : null;
    return (
      <TouchableOpacity
        onPress={() => handleMessagePress(item)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.divider,
          marginHorizontal: 16,
          marginBottom: 8,
          backgroundColor: theme.surface,
          borderRadius: 12,
        }}
      >
        {/* User Avatar */}
        <Image
          source={{ uri: item.otherUserAvatar || images.profile }}
          style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
          resizeMode="cover"
        />
        {/* Message Content */}
        <View style={{ flex: 1, flexShrink: 1 }}>
          <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '600' }}>
            {item.otherUsername}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14, flexWrap: 'wrap' }}>
            {latestMsg ? latestMsg.content : ''}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {latestMsg ? formatTime(latestMsg.$createdAt) : ''}
          </Text>
        </View>
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <View style={{
            backgroundColor: theme.accent,
            borderRadius: 10,
            minWidth: 20,
            paddingHorizontal: 6,
            paddingVertical: 2,
            marginLeft: 8,
            alignItems: 'center'
          }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold' }}>
              {unreadCount}
            </Text>
          </View>
        )}
        {/* Camera Icon */}
        <TouchableOpacity style={{ marginLeft: 8 }}>
          <Image
            source={icons.camera}
            style={{ width: 24, height: 24, tintColor: theme.textMuted }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ title, count }) => (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      backgroundColor: theme.surface,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.border,
    }}>
      <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: 'bold' }}>
        {title}
      </Text>
      {count > 0 && (
        <View style={{
          backgroundColor: theme.accent,
          borderRadius: 10,
          paddingHorizontal: 8,
          paddingVertical: 2
        }}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
            {count}
          </Text>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: theme.textPrimary, fontSize: 18 }}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.divider
      }}>
        {searchActive ? (
          <>
            <View style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.surface,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === 'ios' ? 8 : 4,
              borderWidth: 1,
              borderColor: theme.border,
            }}>
              <Image
                source={icons.search}
                style={{ width: 18, height: 18, tintColor: theme.textMuted }}
                resizeMode="contain"
              />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search notifications"
                placeholderTextColor={theme.textMuted}
                style={{
                  flex: 1,
                  marginLeft: 8,
                  color: theme.textPrimary,
                  fontSize: 16,
                }}
                autoFocus
              />
            </View>
            <TouchableOpacity onPress={toggleSearch} style={{ marginLeft: 12 }}>
              <Text style={{ color: theme.accent, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{ flex: 1, color: theme.textPrimary, fontSize: 24, fontWeight: 'bold' }}>
              Notification
            </Text>
            <TouchableOpacity onPress={toggleSearch}>
              <Image
                source={icons.search}
                style={{ width: 24, height: 24, tintColor: theme.textPrimary }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Content */}
      <FlatList
        data={[
          { type: 'header', title: t('inbox.sections.newFollowers'), count: followUnreadCount },
          ...followNotifications,
          { type: 'header', title: t('inbox.sections.activity'), count: activityUnreadCount },
          ...activityNotifications,
          { type: 'header', title: t('inbox.sections.subscriptions'), count: subscriptionUnreadCount },
          ...subscriptionNotifications,
          { type: 'header', title: 'Messages', count: messageUnreadCount },
          ...messageNotifications,
          { type: 'header', title: 'Calls', count: callUnreadCount },
          ...callNotifications,
          { type: 'header', title: t('inbox.sections.recentMessages'), count: filteredRecentMessages.length },
          ...filteredRecentMessages
        ]}
        keyExtractor={(item, index) => item.type === 'header' ? `header-${index}` : item.$id || `item-${index}`}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return renderSectionHeader({ title: item.title, count: item.count });
          } else if (
            item.type === 'follow' ||
            item.type === 'like' ||
            item.type === 'comment' ||
            item.type === 'message' ||
            item.type === 'call' ||
            item.type === 'live' ||
            item.type === 'video_post' ||
            item.type === 'photo_post' ||
            item.type === 'location_invite' ||
            item.type === 'location_share'
          ) {
            return renderNotificationItem({ item });
          } else {
            return renderMessageItem({ item });
          }
        }}
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: 'hidden',
  },
  swipeDelete: {
    backgroundColor: '#E53935',
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    marginBottom: 8,
    marginRight: 16,
    borderRadius: 12,
  },
  swipeDeleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
});

export default Inbox; 
import { useState, useEffect, useCallback, useMemo } from "react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Image, FlatList, TouchableOpacity, Text, Alert, TextInput, Platform } from "react-native";
import { Query } from 'react-native-appwrite';

import { icons } from "../../constants";
import { databases, appwriteConfig, getNotifications, toggleFollowUser, markNotificationAsRead } from "../../lib/appwrite";
import { useGlobalContext } from "../../context/GlobalProvider";
import { images } from "../../constants/images";
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

const getNotificationMessage = (item) => {
  if (!item) return '';
  switch (item.type) {
    case 'follow':
      return 'started following you';
    case 'like':
      return 'liked your post';
    case 'comment':
      return 'commented on your post';
    case 'message':
      return 'sent you a message';
    case 'live':
      return 'is going live';
    default:
      return 'interacted with you';
  }
};

const Inbox = () => {
  const { t } = useTranslation();
  const { user: currentUser, theme, isDarkMode, followStatus, updateFollowStatus } = useGlobalContext();
  const [notifications, setNotifications] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followingStates, setFollowingStates] = useState({}); // Track follow states for notifications
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );

  useEffect(() => {
    fetchNotifications();
    fetchRecentMessages();

    // Add polling for real-time updates
    const intervalId = setInterval(() => {
      fetchNotifications();
      fetchRecentMessages();
    }, 2000); // every 2 seconds

    return () => clearInterval(intervalId);
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

  const fetchNotifications = async () => {
    try {
      const notificationsData = await getNotifications(currentUser.$id);
      setNotifications(notificationsData);
      
      // Auto-mark notifications as read when user views the notification page
      const unreadNotifications = notificationsData.filter(n => !n.isRead || n.isRead === false);
      if (unreadNotifications.length > 0) {
        // Mark all unread notifications as read in parallel
        Promise.all(
          unreadNotifications.map(async (notification) => {
            try {
              await markNotificationAsRead(notification.$id);
              return notification.$id;
            } catch (error) {
              // Silent fail - don't interrupt user experience
              return null;
            }
          })
        ).then((readIds) => {
          // Update local state for all successfully marked notifications
          const successfulIds = readIds.filter(id => id !== null);
          if (successfulIds.length > 0) {
            setNotifications(prev => 
              prev.map(n => successfulIds.includes(n.$id) ? { ...n, isRead: true } : n)
            );
          }
        });
      }
    } catch (error) {
     
    }
  };

  const getUnreadCount = (chat) => {
    if (!chat.messages) return 0;
    return chat.messages.filter(
      m => m.receiverId === currentUser.$id && m.is_read === false
    ).length;
  };

  const fetchRecentMessages = async () => {
    try {
      const messagesQuery = Query.equal('participants', currentUser.$id);
      const messagesResponse = await databases.listDocuments(
        appwriteConfig.databaseId,
        'chats',
        [messagesQuery]
      );

      // For each chat, fetch its messages
      const chatsWithMessages = await Promise.all(
        messagesResponse.documents.map(async (chat) => {
          const chatMessagesRes = await databases.listDocuments(
            appwriteConfig.databaseId,
            appwriteConfig.messagesCollectionId,
            [Query.equal('chatId', chat.$id)]
          );
          return { ...chat, messages: chatMessagesRes.documents };
        })
      );

      setRecentMessages(chatsWithMessages);
    } catch (error) {
      
    } finally {
      setLoading(false);
    }
  };
    
  const handleNotificationPress = async (notification) => {
    // Mark notification as read when user clicks on it
    if (!notification.isRead || notification.isRead === false) {
      try {
        await markNotificationAsRead(notification.$id);
        // Update local state
        setNotifications(prev => 
          prev.map(n => n.$id === notification.$id ? { ...n, isRead: true } : n)
        );
      } catch (error) {
        // Silent fail
      }
    }

    if (notification.type === 'follow') {
      // Navigate to user profile
      router.push(`/profile/${notification.fromUserId}`);
    } else if (notification.type === 'like' || notification.type === 'comment') {
      // Navigate to specific post if available
      if (notification.postId) {
        router.push(`/post/${notification.postId}`);
      } else {
        Alert.alert('Post unavailable', 'This notification is missing post details.');
      }
    } else if (notification.type === 'message') {
      // Navigate to chat with the sender
      router.push({ pathname: '/chat', params: { userId: notification.fromUserId } });
    } else if (notification.type === 'live') {
      // Navigate to live stream viewer
      if (notification.postId) {
        router.push({
          pathname: '/live-viewer',
          params: { streamId: notification.postId }
        });
      }
    }
  };

  const handleMessagePress = (message) => {
    // Navigate to chat
    router.push({ pathname: '/chat', params: { userId: message.otherUserId } });
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
      const messageText = getNotificationMessage(item).toLowerCase();
      return (
        username.includes(query) ||
        type.includes(query) ||
        messageText.includes(query)
      );
    });
  }, [notifications, searchQuery]);

  const filteredRecentMessages = useMemo(() => {
    if (!searchQuery.trim()) return recentMessages;
    const query = searchQuery.toLowerCase();
    return recentMessages.filter((chat) => {
      const username = chat.otherUsername?.toLowerCase() || '';
      const messageMatch = chat.messages?.some((msg) =>
        (msg.content || '').toLowerCase().includes(query)
      );
      return username.includes(query) || messageMatch;
    });
  }, [recentMessages, searchQuery]);

  const followNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'follow'),
    [filteredNotifications]
  );
  const activityNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'like' || n.type === 'comment'),
    [filteredNotifications]
  );
  const messageNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'message'),
    [filteredNotifications]
  );
  const liveNotifications = useMemo(
    () => filteredNotifications.filter((n) => n.type === 'live'),
    [filteredNotifications]
  );

  const followUnreadCount = followNotifications.filter((n) => !n.isRead).length;
  const activityUnreadCount = activityNotifications.filter((n) => !n.isRead).length;
  const messageUnreadCount = messageNotifications.filter((n) => !n.isRead).length;
  const liveUnreadCount = liveNotifications.filter((n) => !n.isRead).length;

  const toggleSearch = () => {
    setSearchActive((prev) => {
      const next = !prev;
      if (!next) {
        setSearchQuery('');
      }
      return next;
    });
  };

  const renderNotificationItem = ({ item }) => {
    const isFollow = item.type === 'follow';
    const isLive = item.type === 'live';
    const notificationText = getNotificationMessage(item);

    return (
      <TouchableOpacity
        onPress={() => handleNotificationPress(item)}
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

        {/* Action Button */}
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
                  // Refresh notifications to update UI
                  fetchNotifications();
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
      </TouchableOpacity>
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
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '600' }}>
            {item.otherUsername}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
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
          { type: 'header', title: 'New Followers', count: followUnreadCount },
          ...followNotifications,
          { type: 'header', title: 'Activity', count: activityUnreadCount },
          ...activityNotifications,
          { type: 'header', title: 'Messages', count: messageUnreadCount },
          ...messageNotifications,
          { type: 'header', title: 'Live Streams', count: liveUnreadCount },
          ...liveNotifications,
          { type: 'header', title: 'Recent Messages', count: filteredRecentMessages.length },
          ...filteredRecentMessages
        ]}
        keyExtractor={(item, index) => item.type === 'header' ? `header-${index}` : item.$id || `item-${index}`}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return renderSectionHeader({ title: item.title, count: item.count });
          } else if (item.type === 'follow' || item.type === 'like' || item.type === 'comment' || item.type === 'message' || item.type === 'live') {
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
  );
};

export default Inbox; 
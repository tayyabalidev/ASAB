import { useState, useEffect, useCallback } from "react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Image, FlatList, TouchableOpacity, Text, Alert } from "react-native";
import { Query } from 'react-native-appwrite';

import { icons } from "../../constants";
import { databases, appwriteConfig, getNotifications } from "../../lib/appwrite";
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

const Inbox = () => {
  const { t } = useTranslation();
  const { user: currentUser, theme, isDarkMode } = useGlobalContext();
  const [notifications, setNotifications] = useState([]);
  const [recentMessages, setRecentMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );

  useEffect(() => {
    fetchNotifications();
    fetchRecentMessages();

    // Add polling for real-time updates
    const intervalId = setInterval(() => {
      fetchRecentMessages();
    }, 2000); // every 2 seconds

    return () => clearInterval(intervalId);
  }, [currentUser]);

  const fetchNotifications = async () => {
    try {
      const notificationsData = await getNotifications(currentUser.$id);
      setNotifications(notificationsData);
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
    
  const handleNotificationPress = (notification) => {
    if (notification.type === 'follow') {
      // Navigate to user profile
      router.push(`/profile/${notification.fromUserId}`);
    } else if (notification.type === 'like' || notification.type === 'comment') {
      // Navigate to the post
      router.push(`/post/${notification.postId}`);
    }
  };

  const handleMessagePress = (message) => {
    // Navigate to chat
    router.push({ pathname: '/chat', params: { userId: message.otherUserId } });
  };

  const formatTime = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = (now - time) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return t('inbox.time.justNow');
    } else if (diffInHours < 24) {
      return t('inbox.time.hoursAgo', { count: Math.floor(diffInHours) });
    } else {
      return t('inbox.time.daysAgo', { count: Math.floor(diffInHours / 24) });
    }
  };

  const renderNotificationItem = ({ item }) => {
    const isFollow = item.type === 'follow';
    const isLike = item.type === 'like';
    const isComment = item.type === 'comment';
    const messageKey = isFollow
      ? 'inbox.notifications.follow'
      : isLike
        ? 'inbox.notifications.like'
        : 'inbox.notifications.comment';

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
            {t(messageKey)}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
            {formatTime(item.createdAt)}
          </Text>
        </View>

        {/* Action Button */}
        {isFollow && (
          <TouchableOpacity
            style={{
              backgroundColor: theme.accent,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 16
            }}
          >
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>
              {t('inbox.actions.followBack')}
            </Text>
          </TouchableOpacity>
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
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: theme.divider
      }}>
          <Text style={{ color: theme.textPrimary, fontSize: 24, fontWeight: 'bold' }}>
            {t('nav.inbox')}
          </Text>
        <TouchableOpacity>
          <Image
            source={icons.search}
            style={{ width: 24, height: 24, tintColor: theme.textPrimary }}
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <FlatList
        data={[
          { type: 'header', title: t('inbox.sections.newFollowers'), count: notifications.filter(n => n.type === 'follow' && !n.isRead).length },
          ...notifications.filter(n => n.type === 'follow'),
          { type: 'header', title: t('inbox.sections.activity'), count: notifications.filter(n => (n.type === 'like' || n.type === 'comment') && !n.isRead).length },
          ...notifications.filter(n => n.type === 'like' || n.type === 'comment'),
          { type: 'header', title: t('inbox.sections.recentMessages'), count: recentMessages.length },
          ...recentMessages
        ]}
        keyExtractor={(item, index) => item.type === 'header' ? `header-${index}` : item.$id || `item-${index}`}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return renderSectionHeader({ title: item.title, count: item.count });
          } else if (item.type === 'follow' || item.type === 'like' || item.type === 'comment') {
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
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Image, FlatList, TouchableOpacity, Modal, Text, TextInput, Alert, Platform, ScrollView, ActivityIndicator, KeyboardAvoidingView, Share } from "react-native";
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { icons } from "../../constants";
import useAppwrite from "../../lib/useAppwrite";
import { getUserPosts, signOut, updateUserProfile, uploadFile, handleProfileAccessRequest, getFollowers, getFollowing, getUserBookmarks, toggleLikePost, getComments, addComment, getPostLikes, toggleBookmark, isVideoBookmarked, getShareCount, incrementShareCount, getNotifications, databases, appwriteConfig, getVideoById, toggleFollowUser, getUserPhotos, getPhotoById, deleteVideoPost, deletePhotoPost } from "../../lib/appwrite";
import { useGlobalContext } from "../../context/GlobalProvider";
import { EmptyState, InfoBox, VideoCard, ThemeToggle } from "../../components";
import { images } from "../../constants";
import { useTranslation } from "react-i18next";

// Get CSS filter string based on filter type and adjustments (same as in create.jsx and home.jsx)
const getFilterCSS = (filterId, adjustmentsData = null) => {
  if (!filterId || filterId === 'none') {
    // Apply adjustments only if no filter
    if (adjustmentsData) {
      const parts = [];
      if (adjustmentsData.brightness !== 0) {
        parts.push(`brightness(${1 + (adjustmentsData.brightness / 100)})`);
      }
      if (adjustmentsData.contrast !== 1) {
        parts.push(`contrast(${adjustmentsData.contrast})`);
      }
      if (adjustmentsData.saturation !== 1) {
        parts.push(`saturate(${adjustmentsData.saturation})`);
      }
      if (adjustmentsData.hue !== 0) {
        parts.push(`hue-rotate(${adjustmentsData.hue}deg)`);
      }
      return parts.length > 0 ? parts.join(' ') : 'none';
    }
    return 'none';
  }
  
  let filterCSS = '';
  
  // Apply filter effects
  switch (filterId) {
    case 'vintage':
      filterCSS += 'brightness(1.1) contrast(0.9) saturate(0.8) sepia(0.2)';
      break;
    case 'blackwhite':
      filterCSS += 'grayscale(100%)';
      break;
    case 'sepia':
      filterCSS += 'sepia(1) brightness(1.1) contrast(0.9)';
      break;
    case 'cool':
      filterCSS += 'hue-rotate(30deg) saturate(0.9)';
      break;
    case 'warm':
      filterCSS += 'hue-rotate(-30deg) saturate(1.1)';
      break;
    case 'contrast':
      filterCSS += 'contrast(1.3)';
      break;
    case 'bright':
      filterCSS += 'brightness(1.2) contrast(1.1)';
      break;
    default:
      break;
  }
  
  // Apply manual adjustments on top of filter
  if (adjustmentsData) {
    const parts = [];
    if (adjustmentsData.brightness !== 0) {
      parts.push(`brightness(${1 + (adjustmentsData.brightness / 100)})`);
    }
    if (adjustmentsData.contrast !== 1) {
      parts.push(`contrast(${adjustmentsData.contrast})`);
    }
    if (adjustmentsData.saturation !== 1) {
      parts.push(`saturate(${adjustmentsData.saturation})`);
    }
    if (adjustmentsData.hue !== 0) {
      parts.push(`hue-rotate(${adjustmentsData.hue}deg)`);
    }
    if (parts.length > 0) {
      filterCSS = filterCSS ? `${filterCSS} ${parts.join(' ')}` : parts.join(' ');
    }
  }
  
  return filterCSS || 'none';
};

// Component to display pending request with user details
const PendingRequestItem = ({ requestingUserId, onApprove, onDeny }) => {
  const { t } = useTranslation();
  const { theme, isDarkMode } = useGlobalContext();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true);
        
        const user = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userCollectionId,
          requestingUserId
        );
        
        setUserData(user);
      } catch (error) {
       
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [requestingUserId]);

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: theme.surface,
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: theme.border,
        shadowColor: isDarkMode ? "rgba(0,0,0,0.35)" : "rgba(15,23,42,0.12)",
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
        {/* User Avatar */}
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: theme.accentSoft,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          {userData?.avatar ? (
            <Image
              source={{ uri: userData.avatar }}
              style={{ width: 40, height: 40, borderRadius: 20 }}
              resizeMode="cover"
            />
          ) : (
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "bold" }}>
              {userData?.username ? userData.username.charAt(0).toUpperCase() : t('profile.general.defaultInitial')}
            </Text>
          )}
        </View>

        {/* User Info */}
        <View style={{ flex: 1 }}>
          {loading ? (
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>{t('common.loading')}</Text>
          ) : (
            <>
              <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "bold" }}>
                {userData?.username || t('profile.general.unknownUser')}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                @{userData?.username || t('profile.general.unknownHandle')}
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          onPress={onApprove}
          style={{
            backgroundColor: theme.success,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>{t('profile.pending.approve')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onDeny}
          style={{
            backgroundColor: theme.danger,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>{t('profile.pending.deny')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const Profile = () => {
  const { t } = useTranslation();
  const { user, setUser, setIsLogged, theme, isDarkMode } = useGlobalContext();
  const SUPPORT_REQUIREMENT = 1000;
  const { data: posts, refetch: refetchPosts } = useAppwrite(() => getUserPosts(user.$id), [user?.$id]);
  const { data: photos, refetch: refetchPhotos } = useAppwrite(() => getUserPhotos(user.$id), [user?.$id]);
  const { data: followers } = useAppwrite(() => getFollowers(user?.$id), [user?.$id]);
  const { data: following } = useAppwrite(() => getFollowing(user?.$id), [user?.$id]);
  const { data: bookmarks, loading: bookmarksLoading, error: bookmarksError, refetch: refetchBookmarks } = useAppwrite(() => {
   
    if (!user?.$id) {
    
      return Promise.resolve([]);
    }
    
    return getUserBookmarks(user.$id);
  }, [user?.$id]);
  
  // Debug: Log bookmarks hook data
  

  // Refresh bookmarks when screen comes into focus (with debounce)
  const lastRefreshTimeRef = useRef(0);
  const isRefreshingRef = useRef(false);
  
  useFocusEffect(
    React.useCallback(() => {
      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshTimeRef.current;
      
      // Refresh posts and photos when profile screen comes into focus
      if (refetchPosts) {
        refetchPosts();
      }
      if (refetchPhotos) {
        refetchPhotos();
      }
      
      // Only refresh bookmarks if it's been more than 2 seconds since last refresh
      // and we're not already refreshing
      if (timeSinceLastRefresh > 2000 && !isRefreshingRef.current) {
        if (user?.$id && refetchBookmarks) {
          isRefreshingRef.current = true;
          setIsRefreshingBookmarks(true);
          refetchBookmarks().finally(() => {
            setIsRefreshingBookmarks(false);
            isRefreshingRef.current = false;
            lastRefreshTimeRef.current = now;
          });
        }
      }
    }, [user?.$id, refetchBookmarks, refetchPosts, refetchPhotos])
  );

  // Stop videos when profile loses focus
  useFocusEffect(
    useCallback(() => {
      // When profile gains focus, do nothing (videos can play)
      return () => {
        // When profile loses focus, stop all videos
        if (modalVideoRef.current) {
          modalVideoRef.current.pauseAsync();
        }
        setIsVideoPlaying(false);
        setModalVisible(false);
      };
    }, [])
  );

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [newUsername, setNewUsername] = useState(user?.username || "");
  const [newAvatar, setNewAvatar] = useState(user?.avatar || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Re-enable privacy states
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate || false);
  const [pendingRequests, setPendingRequests] = useState(user?.pendingRequests || []);

  // Video playback state
  const [playingVideo, setPlayingVideo] = useState(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  
  // TikTok-style video modal state
  const [modalVideo, setModalVideo] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalIndex, setModalIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const modalVideoRef = useRef(null);
  
  // Modal interaction states
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsCount, setCommentsCount] = useState(0);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [likesModalVisible, setLikesModalVisible] = useState(false);
  const [likesList, setLikesList] = useState([]);
  const [loadingLikes, setLoadingLikes] = useState(false);
    const [shareCount, setShareCount] = useState(0);
  
  // Bookmark videos state
  const [bookmarkVideos, setBookmarkVideos] = useState({});
  const [bookmarkVideosLoading, setBookmarkVideosLoading] = useState(false);
  const lastProcessedBookmarkIdsRef = useRef('');
 
  // Following/Followers modal state
  const [followModalVisible, setFollowModalVisible] = useState(false);
  const [followModalType, setFollowModalType] = useState(''); // 'following' or 'followers'
  const [followModalData, setFollowModalData] = useState([]);

  // Profile section state
  const [activeSection, setActiveSection] = useState('videos'); // 'videos', 'pics', or 'bookmarks'
  const [isRefreshingBookmarks, setIsRefreshingBookmarks] = useState(false);
  
  // Photo modal state
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  
  // Notification count state
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  
  // Delete handlers
  const handleDeleteVideo = async (videoId, index, e) => {
    e?.stopPropagation?.(); // Prevent opening modal when clicking delete
    Alert.alert(
      t('profile.alerts.deleteVideoTitle', 'Delete Video'),
      t('profile.alerts.deleteVideoMessage', 'Are you sure you want to delete this video? This action cannot be undone.'),
      [
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel'
        },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteVideoPost(videoId);
              // Close modal if it's open for this video
              if (modalVisible && modalIndex === index) {
                setModalVisible(false);
              }
              // Refresh the posts list
              if (refetchPosts) {
                await refetchPosts();
              }
              Alert.alert(t('common.success', 'Success'), t('profile.alerts.videoDeleted', 'Video deleted successfully'));
            } catch (error) {
              Alert.alert(t('common.error', 'Error'), error.message || t('profile.alerts.deleteVideoError', 'Failed to delete video'));
            }
          }
        }
      ]
    );
  };

  const handleDeletePhoto = async (photoId, index, e) => {
    e?.stopPropagation?.(); // Prevent opening modal when clicking delete
    Alert.alert(
      t('profile.alerts.deletePhotoTitle', 'Delete Photo'),
      t('profile.alerts.deletePhotoMessage', 'Are you sure you want to delete this photo? This action cannot be undone.'),
      [
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel'
        },
        {
          text: t('common.delete', 'Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePhotoPost(photoId);
              // Close modal if it's open for this photo
              if (photoModalVisible && photoIndex === index) {
                setPhotoModalVisible(false);
              }
              // Refresh the photos list
              if (refetchPhotos) {
                await refetchPhotos();
              }
              Alert.alert(t('common.success', 'Success'), t('profile.alerts.photoDeleted', 'Photo deleted successfully'));
            } catch (error) {
              Alert.alert(t('common.error', 'Error'), error.message || t('profile.alerts.deletePhotoError', 'Failed to delete photo'));
            }
          }
        }
      ]
    );
  };

  // Function to handle section change and refresh bookmarks if needed
  const handleSectionChange = (section) => {
    setActiveSection(section);
    // If switching to bookmarks, refresh the data only if not already on bookmarks
    // and not currently refreshing
    if (section === 'bookmarks' && activeSection !== 'bookmarks' && user?.$id && refetchBookmarks && !isRefreshingRef.current) {
      isRefreshingRef.current = true;
      setIsRefreshingBookmarks(true);
      refetchBookmarks().finally(() => {
        setIsRefreshingBookmarks(false);
        isRefreshingRef.current = false;
      });
    }
  };

  // Calculate total likes from all posts
  const totalLikes = posts?.reduce((total, post) => total + (post.likes?.length || 0), 0) || 0;

  const logout = async () => {
    await signOut();
    setUser(null);
    setIsLogged(false);
    router.replace("/sign-in");
  };

  const openEditModal = () => {
    setNewUsername(user?.username || "");
    setNewAvatar(user?.avatar || "");
    // Re-enable privacy states
    setIsPrivate(user?.isPrivate || false);
    setPendingRequests(user?.pendingRequests || []);
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
  };

  const pickAvatarImage = async () => {
    try {
      setUploadingAvatar(true);
      
      // Request permissions
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('profile.alerts.permissionTitle'), t('profile.alerts.permissionMessage'));
        setUploadingAvatar(false);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.7,
        aspect: [1, 1], // Square aspect ratio for avatar
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedAsset = result.assets[0];
        const fileName = selectedAsset.fileName || selectedAsset.name || selectedAsset.uri.split('/').pop() || `avatar_${Date.now()}.jpg`;
        const fileType = 'image/jpeg';
        const fileSize = selectedAsset.fileSize || selectedAsset.size;
        const file = {
          uri: selectedAsset.uri,
          name: fileName,
          type: fileType,
          size: fileSize,
        };
        
        // Upload image to Appwrite storage
        const avatarUrl = await uploadFile(file, "image");
        
        setNewAvatar(avatarUrl);
        Alert.alert(t('common.success'), t('profile.alerts.uploadAvatarSuccess'));
      }
    } catch (error) {
      Alert.alert(t('common.error'), t('profile.alerts.uploadAvatarError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfileChanges = async () => {
    if (!newUsername.trim()) {
      Alert.alert(t('common.error'), t('profile.alerts.usernameEmpty'));
      return;
    }
    setSaving(true);
    try {
      // Re-enable isPrivate parameter
      const updatedUser = await updateUserProfile(user.$id, newUsername, newAvatar, isPrivate);
      setUser(updatedUser);
      Alert.alert(t('common.success'), t('profile.alerts.saveProfileSuccess'));
      setEditModalVisible(false);
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('profile.alerts.saveProfileError'));
    } finally {
      setSaving(false);
    }
  };

  // Re-enable access request handler
  const handleAccessRequest = async (requestingUserId, action) => {
    try {
      const updatedUser = await handleProfileAccessRequest(user.$id, requestingUserId, action);
      setUser(updatedUser);
      setPendingRequests(updatedUser.pendingRequests || []);
      const successKey = action === 'approve' ? 'profile.alerts.requestApproved' : 'profile.alerts.requestDenied';
      Alert.alert(t('common.success'), t(successKey));
    } catch (error) {
      Alert.alert(t('common.error'), error.message || t('profile.alerts.requestFailed'));
    }
  };

  // Get user initials for avatar
  const getUserInitials = (username) => {
    if (!username) return "U";
    return username.split(' ').map(name => name.charAt(0).toUpperCase()).join('').slice(0, 2);
  };

  // Handle video playback with actual video player
  const handleVideoPress = async (post) => {
    try {
      // If this is a bookmark (has postId but no video), fetch the actual video data
      if (post.postId && !post.video) {
        
        
        try {
          const videoData = await getVideoById(post.postId);
   
          
          // Create a complete post object with the fetched data
          const completePost = {
            $id: post.postId,
            title: videoData.title || post.title,
            video: videoData.video,
            thumbnail: videoData.thumbnail || post.thumbnail,
            creator: videoData.creator || post.creator
          };
          
          setPlayingVideo(completePost);
          setVideoModalVisible(true);
        } catch (error) {
          
          Alert.alert(t('common.error'), t('profile.alerts.videoLoadError'));
        }
      } else {
        // Regular post, play directly
        setPlayingVideo(post);
        setVideoModalVisible(true);
      }
    } catch (error) {
     
      Alert.alert(t('common.error'), t('profile.alerts.videoPlayError'));
    }
  };

  const closeVideoModal = () => {
    setVideoModalVisible(false);
    setPlayingVideo(null);
  };

  // TikTok-style video modal functions
  const openVideoModal = (item, index) => {
  
    
    // Ensure we have the correct data structure
    const videoData = {
      ...item,
      thumbnail: item.thumbnail || 'https://via.placeholder.com/300x300',
      video: item.video,
      title: item.title || 'Untitled Video',
      creator: item.creator || { username: user?.username || t('profile.general.unknownUser') }
    };
    
    setModalVideo(videoData);
    setModalIndex(index);
    setModalVisible(true);
    setIsVideoPlaying(true);
  };

  const navigateToNextVideo = () => {
    if (modalIndex < posts.length - 1) {
      const nextVideo = posts[modalIndex + 1];
      setModalVideo(nextVideo);
      setModalIndex(modalIndex + 1);
      setIsVideoPlaying(true);
      // Reset modal states for new video
      setLiked(nextVideo.likes?.includes(user?.$id));
      setLikesCount(nextVideo.likes ? nextVideo.likes.length : 0);
      setCommentsCount(nextVideo.comments ? nextVideo.comments.length : 0);
      setBookmarked(false);
      setComments([]);
      setNewComment("");
    }
  };

  const navigateToPreviousVideo = () => {
    if (modalIndex > 0) {
      const prevVideo = posts[modalIndex - 1];
      setModalVideo(prevVideo);
      setModalIndex(modalIndex - 1);
      setIsVideoPlaying(true);
      // Reset modal states for new video
      setLiked(prevVideo.likes?.includes(user?.$id));
      setLikesCount(prevVideo.likes ? prevVideo.likes.length : 0);
      setCommentsCount(prevVideo.comments ? prevVideo.comments.length : 0);
      setBookmarked(false);
      setComments([]);
      setNewComment("");
    }
  };

  const onGestureEvent = (event) => {
    const { translationY } = event.nativeEvent;
    
    if (translationY > 50) {
      // Swipe down - go to previous video
      navigateToPreviousVideo();
    } else if (translationY < -50) {
      // Swipe up - go to next video
      navigateToNextVideo();
    }
  };

  const handleLike = async () => {
    if (!user?.$id || !modalVideo) return;
    setLiked((prev) => !prev);
    setLikesCount((prev) => (liked ? prev - 1 : prev + 1));
    try {
      await toggleLikePost(modalVideo.$id, user.$id);
    } catch {}
  };

  const handleBookmark = async () => {
    if (!user?.$id || !modalVideo) {
      Alert.alert(t('common.error'), t('profile.alerts.bookmarkLogin'));
      return;
    }

    try {
      const videoData = {
        title: modalVideo.title,
        creator: modalVideo.creator.username,
        avatar: modalVideo.creator.avatar,
        thumbnail: modalVideo.thumbnail,
        video: modalVideo.video,
        videoId: modalVideo.$id
      };

      const newBookmarkStatus = await toggleBookmark(user.$id, modalVideo.$id, videoData);
      setBookmarked(newBookmarkStatus);
    } catch (error) {
     
      Alert.alert(t('common.error'), t('profile.alerts.bookmarkError'));
    }
  };

  const handleShare = async () => {
    if (!modalVideo) return;
    
    try {
      const result = await Share.share({
        message: t('profile.share.message', {
          title: modalVideo.title,
          username: modalVideo.creator.username,
          video: modalVideo.video,
        }),
        title: modalVideo.title,
      });
      
      if (result.action === Share.sharedAction) {
        // Increment share count
        const newShareCount = await incrementShareCount(modalVideo.$id);
        setShareCount(newShareCount);
        
      }
    } catch (error) {
     
      Alert.alert(t('common.error'), t('profile.alerts.shareError'));
    }
  };

  const handleCommentPress = () => {
    setCommentsModalVisible(true);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user?.$id || !modalVideo) return;
    setPosting(true);
    try {
      const comment = await addComment(modalVideo.$id, user.$id, newComment.trim());
      setComments([comment, ...comments]);
      setNewComment("");
      setCommentsCount((prev) => prev + 1);
    } catch {}
    setPosting(false);
  };

  const handleOpenLikesModal = () => {
    setLikesModalVisible(true);
  };

  const handleUserPress = (userId) => {
    setLikesModalVisible(false);
    if (userId && userId !== user?.$id) {
      router.push(`/profile/${userId}`);
    }
  };

  // Real-time follow toggle function
  const handleFollowToggle = async (targetUserId) => {
    if (!user?.$id || !targetUserId || user.$id === targetUserId) return;
    
    try {
      await toggleFollowUser(user.$id, targetUserId);
      
      // Update local state immediately for real-time feedback
      // Refresh the follow modal data if it's currently open
      if (followModalVisible) {
        if (followModalType === 'followers') {
          const updatedFollowers = await getFollowers(user.$id);
          setFollowModalData(updatedFollowers || []);
        } else if (followModalType === 'following') {
          const updatedFollowing = await getFollowing(user.$id);
          setFollowModalData(updatedFollowing || []);
        }
      }
      
     
    } catch (error) {
      
      Alert.alert(t('common.error'), t('profile.alerts.followError'));
    }
  };

  const formatCount = (count) => {
    if (!count || count === undefined || count === null) {
      return '0';
    }
    if (count >= 1000000) {
      return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'K';
    }
    return count.toString();
  };

  // When modalVideo changes, set up like/comment state
  useEffect(() => {
    if (modalVideo) {
      setLiked(modalVideo.likes?.includes(user?.$id));
      setLikesCount(modalVideo.likes ? modalVideo.likes.length : 0);
      setBookmarked(false); // TODO: implement bookmark logic
      setCommentsCount(modalVideo.comments ? modalVideo.comments.length : 0);
    }
  }, [modalVideo, user]);

  // Comments logic for modal
  useEffect(() => {
    if (commentsModalVisible && modalVideo) {
      setLoadingComments(true);
      getComments(modalVideo.$id)
        .then((res) => setComments(res))
        .catch(() => setComments([]))
        .finally(() => setLoadingComments(false));
    }
  }, [commentsModalVisible, modalVideo]);

  // Likes list logic for modal
  useEffect(() => {
    if (likesModalVisible && modalVideo) {
      setLoadingLikes(true);
      getPostLikes(modalVideo.$id)
        .then(async (userIds) => {
          const users = await Promise.all(
            userIds.map(async (uid) => {
              try {
                const u = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, uid);
                return { $id: u.$id, username: u.username, avatar: u.avatar };
              } catch {
                return { $id: uid, username: t('profile.general.unknownUser'), avatar: images.profile };
              }
            })
          );
          setLikesList(users);
        })
        .catch(() => setLikesList([]))
        .finally(() => setLoadingLikes(false));
    }
  }, [likesModalVisible, modalVideo]);

  // Check bookmark status and share count when modal video changes
  useEffect(() => {
    if (modalVideo && user?.$id) {
      // Check bookmark status
      const checkBookmarkStatus = async () => {
        try {
          const isBookmarked = await isVideoBookmarked(user.$id, modalVideo.$id);
          setBookmarked(isBookmarked);
        } catch (error) {
          
        }
      };

      // Get share count
      const fetchShareCount = async () => {
        try {
          const shares = await getShareCount(modalVideo.$id);
          setShareCount(shares);
        } catch (error) {
          
        }
      };

      checkBookmarkStatus();
      fetchShareCount();
    }
  }, [modalVideo, user?.$id]);

  // Memoize bookmark IDs to prevent unnecessary re-renders
  const bookmarkIdsString = useMemo(() => {
    if (!bookmarks || bookmarks.length === 0) return '';
    return bookmarks.map(b => b.$id).sort().join(',');
  }, [bookmarks]);

  // Fetch bookmark videos when bookmarks change
  const isFetchingVideosRef = useRef(false);
  
  useEffect(() => {
    // Early return if no bookmarks
    if (!bookmarkIdsString || !bookmarks || bookmarks.length === 0) {
      if (bookmarkIdsString === '') {
        setBookmarkVideos({});
        lastProcessedBookmarkIdsRef.current = '';
      }
      return;
    }

    // Check if we've already processed these exact bookmarks
    if (bookmarkIdsString === lastProcessedBookmarkIdsRef.current) {
      return;
    }
    
    // Prevent concurrent fetches
    if (isFetchingVideosRef.current) {
      return;
    }
    
    // Mark as processing immediately to prevent duplicate calls
    lastProcessedBookmarkIdsRef.current = bookmarkIdsString;
    isFetchingVideosRef.current = true;
    
    const fetchBookmarkVideos = async () => {
      setBookmarkVideosLoading(true);
      const newBookmarkVideos = {};
      
      try {
        // Process bookmarks sequentially to avoid overwhelming the API
        for (const bookmark of bookmarks) {
          if (bookmark.postId) {
            try {
              const videoData = await getVideoById(bookmark.postId);
              newBookmarkVideos[bookmark.$id] = {
                title: videoData.title || t('profile.general.bookmarkedVideo'),
                thumbnail: videoData.thumbnail || 'https://via.placeholder.com/300x300',
                creator: videoData.creator || { username: t('profile.general.unknownUser') },
                video: videoData.video
              };
            } catch (error) {
              // Use fallback data on error
              newBookmarkVideos[bookmark.$id] = {
                title: t('profile.general.bookmarkedVideo'),
                thumbnail: 'https://via.placeholder.com/300x300',
                creator: { username: t('profile.general.unknownUser') },
                video: null
              };
            }
          }
        }
        
        // Only update if we still have the same bookmarks (prevent race conditions)
        if (lastProcessedBookmarkIdsRef.current === bookmarkIdsString) {
          setBookmarkVideos(prev => {
            // Only update if data actually changed to prevent unnecessary re-renders
            const hasChanged = Object.keys(newBookmarkVideos).some(
              key => JSON.stringify(prev[key]) !== JSON.stringify(newBookmarkVideos[key])
            ) || Object.keys(prev).length !== Object.keys(newBookmarkVideos).length;
            
            return hasChanged ? newBookmarkVideos : prev;
          });
        }
      } finally {
        setBookmarkVideosLoading(false);
        isFetchingVideosRef.current = false;
      }
    };
    
    fetchBookmarkVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkIdsString]); // Only depend on bookmarkIdsString to prevent unnecessary re-runs

  // Fetch unread notification count
  useEffect(() => {
    const fetchNotificationCount = async () => {
      if (!user?.$id) return;
      
      try {
        const notifications = await getNotifications(user.$id);
        const unreadCount = notifications.filter(n => !n.isRead || n.isRead === false).length;
        setUnreadNotificationCount(unreadCount);
      } catch (error) {
        console.error('Error fetching notification count:', error);
      }
    };

    fetchNotificationCount();
    
    // Poll for new notifications every 3 seconds
    const intervalId = setInterval(fetchNotificationCount, 3000);
    
    return () => clearInterval(intervalId);
  }, [user?.$id]);

  // Handle following/followers modal
  const openFollowModal = async (type) => {
    try {
      setFollowModalType(type);
      setFollowModalVisible(true);
      
      if (type === 'following') {
        setFollowModalData(following || []);
      } else if (type === 'followers') {
        setFollowModalData(followers || []);
      }
    } catch (error) {
      
    }
  };

  const closeFollowModal = () => {
    setFollowModalVisible(false);
    setFollowModalType('');
    setFollowModalData([]);
  };

  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );

  const supportGradient = useMemo(
    () => (isDarkMode ? ["#34D399", "#059669"] : ["#4ADE80", "#22C55E"]),
    [isDarkMode]
  );

  const goLiveGradient = useMemo(
    () => (isDarkMode ? ["#F97316", "#EA580C"] : ["#FB923C", "#F97316"]),
    [isDarkMode]
  );

  const liveStreamsGradient = useMemo(
    () => (isDarkMode ? ["#8B5CF6", "#6366F1"] : ["#A855F7", "#6366F1"]),
    [isDarkMode]
  );

  const profileBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.textBackgroundLight),
    [isDarkMode]
  );

  return (
    <SafeAreaView style={{ backgroundColor: theme.background, flex: 1 }}>
      <ScrollView style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Profile Section with Background Image */}
        <View style={{ flex: 1, position: 'relative' }}>
          {/* Background Image */}
          <Image
            source={profileBackgroundImage || images.backgroundImage}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              resizeMode: 'cover'
            }}
          />
          {/* Overlay for better text readability */}
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: themedColor('rgba(0, 0, 0, 0.45)', 'rgba(255, 255, 255, 0.85)')
          }} />
          {/* Header with logout, notification and menu */}
          <View className="flex-row justify-between items-center px-4 pt-4 pb-6">
            <TouchableOpacity onPress={logout}>
              <Image
                source={icons.logout}
                resizeMode="contain"
                className="w-6 h-6"
              />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => router.push('/chat')} style={{ position: 'relative' }}>
                <Image
                  source={icons.messages}
                  resizeMode="contain"
                  style={{ width: 66, height: 66, tintColor: theme.textPrimary }}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/inbox')} style={{ position: 'relative' }}>
                <Feather name="bell" size={24} color={theme.textPrimary} />
                {unreadNotificationCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    backgroundColor: '#ff4757',
                    borderRadius: 10,
                    minWidth: 20,
                    height: 20,
                    paddingHorizontal: 6,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 2,
                    borderColor: theme.background,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                      {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={openEditModal}>
                <Image
                  source={icons.menu}
                  resizeMode="contain"
                  className="w-6 h-6"
                />
              </TouchableOpacity>
            </View>
          </View>

         {/* Profile Section */}
          <View style={{ alignItems: 'center', paddingHorizontal: 16, marginBottom: 32, marginTop: 24 }}>
            {/* Profile Picture */}
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 24,
                borderWidth: 2,
                borderColor: theme.accent,
                backgroundColor: theme.surface,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                overflow: 'hidden',
              }}
            >
              {user?.avatar ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={{ width: '92%', height: '92%', borderRadius: 18 }}
                  resizeMode="cover"
                />
              ) : (
                <Text style={{ color: theme.textPrimary, fontSize: 24, fontWeight: '700' }}>
                  {getUserInitials(user?.username)}
                </Text>
              )}
            </View>

            {/* Username and Handle */}
            <Text
              style={{
                color: theme.textPrimary,
                fontSize: 22,
                fontWeight: '700',
                marginBottom: 6,
                textAlign: 'center',
              }}
            >
              {user?.username || t('profile.general.userPlaceholder')}
            </Text>
            <Text
              style={{
                color: theme.textSecondary,
                fontSize: 14,
                marginBottom: 20,
              }}
            >
              @{user?.username || t('profile.general.handlePlaceholder')}
            </Text>

            {/* Statistics */}
            <View style={{ flexDirection: 'row', gap: 28, marginBottom: 24 }}>
              <TouchableOpacity
                style={{ alignItems: 'center' }}
                onPress={() => openFollowModal('following')}
              >
                <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '700' }}>
                  {following?.length || 0}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {t('profile.stats.following')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ alignItems: 'center' }}
                onPress={() => openFollowModal('followers')}
              >
                <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '700' }}>
                  {followers?.length || 0}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {t('profile.stats.followers')}
                </Text>
              </TouchableOpacity>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: '700' }}>
                  {totalLikes}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {t('profile.stats.likes')}
                </Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 16, marginBottom: 16, paddingHorizontal: 16 }}>
            <TouchableOpacity 
              onPress={() => {
                const followerCount = followers?.length || 0;
                if (followerCount < SUPPORT_REQUIREMENT) {
                  Alert.alert(
                    t('profile.alerts.supportNotAvailableTitle'),
                    t('profile.alerts.supportNotAvailableMessage', { required: SUPPORT_REQUIREMENT, count: followerCount })
                  );
                } else {
                  router.push('/donation');
                }
              }}
              style={{
                borderRadius: 8,
                shadowColor: themedColor("rgba(52,211,153,0.35)", "rgba(34,197,94,0.35)"),
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 3,
                opacity: (followers?.length || 0) < SUPPORT_REQUIREMENT ? 0.5 : 1,
              }}
              disabled={(followers?.length || 0) < SUPPORT_REQUIREMENT}
            >
              <LinearGradient
                colors={supportGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                  {(followers?.length || 0) < SUPPORT_REQUIREMENT
                    ? t('profile.actions.supportWithProgress', { current: followers?.length || 0, required: SUPPORT_REQUIREMENT })
                    : t('profile.actions.support')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => router.push('/go-live')}
              style={{
                borderRadius: 8,
                shadowColor: themedColor("rgba(239,68,68,0.35)", "rgba(220,38,38,0.35)"),
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <LinearGradient
                colors={goLiveGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{t('profile.actions.goLive')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity 
              onPress={() => router.push('/live-streams')}
              style={{
                borderRadius: 8,
                shadowColor: themedColor("rgba(139,92,246,0.35)", "rgba(99,102,241,0.35)"),
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <LinearGradient
                colors={liveStreamsGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderRadius: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{t('profile.actions.liveStreams')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Advertisement Button - Second Row */}
          <View style={{ flexDirection: 'row', marginBottom: 16, paddingHorizontal: 16 }}>
            <TouchableOpacity
              onPress={() => router.push('/advertisements')}
              style={{
                flex: 1,
                borderRadius: 8,
                shadowColor: themedColor("rgba(127,90,240,0.35)", "rgba(99,102,241,0.35)"),
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.3,
                shadowRadius: 4,
                elevation: 3,
                backgroundColor: theme.accentSoft,
              }}
            >
              <View style={{
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderRadius: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{ color: theme.accent, fontWeight: 'bold', fontSize: 14 }}>Advertisements</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

          {/* Section Tabs */}
          <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                borderRadius: 14,
                padding: 4,
                backgroundColor: themedColor('rgba(15,23,42,0.6)', theme.surface),
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  backgroundColor: activeSection === 'videos' ? theme.accentSoft : 'transparent',
                }}
                onPress={() => handleSectionChange('videos')}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontFamily: 'Poppins-Medium',
                    color: activeSection === 'videos' ? theme.textPrimary : theme.textSecondary,
                  }}
                >
                  {t('profile.sections.videos')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  backgroundColor: activeSection === 'pics' ? theme.accentSoft : 'transparent',
                }}
                onPress={() => handleSectionChange('pics')}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontFamily: 'Poppins-Medium',
                    color: activeSection === 'pics' ? theme.textPrimary : theme.textSecondary,
                  }}
                >
                  Pics
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  backgroundColor: activeSection === 'bookmarks' ? theme.accentSoft : 'transparent',
                }}
                onPress={() => handleSectionChange('bookmarks')}
              >
                <Text
                  style={{
                    textAlign: 'center',
                    fontFamily: 'Poppins-Medium',
                    color: activeSection === 'bookmarks' ? theme.textPrimary : theme.textSecondary,
                  }}
                >
                  {t('profile.sections.bookmarks')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

        {/* Content Sections */}
        <View style={{ backgroundColor: theme.background, flex: 1 }}>
          {/* Videos Section */}
          {activeSection === 'videos' && (
            <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 18,
                  fontFamily: 'Poppins-SemiBold',
                  marginBottom: 16,
                }}
              >
                {t('profile.sections.yourVideos')}
              </Text>
              {posts && posts.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
                  {posts.map((post, index) => (
                    <View
                      key={post.$id}
                      style={{
                        width: '48%',
                        aspectRatio: 1,
                        backgroundColor: theme.surface,
                        borderRadius: 16,
                        marginBottom: 12,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: theme.border,
                        position: 'relative',
                      }}
                    >
                      <TouchableOpacity
                        style={{ width: '100%', height: '100%' }}
                        onPress={() => openVideoModal(post, index)}
                      >
                        <View style={{ width: '100%', height: '100%' }}>
                          {post.video ? (
                            <Video
                              source={{ uri: post.video }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                              shouldPlay={false}
                              isMuted={true}
                              useNativeControls={false}
                              posterSource={post.thumbnail && !post.thumbnail.includes('placeholder') ? { uri: post.thumbnail } : undefined}
                            />
                          ) : (
                            <Image
                              source={{ uri: post.thumbnail || 'https://via.placeholder.com/300x300' }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                          )}
                          {/* Play Icon */}
                        </View>
                      </TouchableOpacity>
                      {/* Delete Button */}
                      <TouchableOpacity
                        onPress={(e) => handleDeleteVideo(post.$id, index, e)}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          backgroundColor: 'rgba(255, 58, 48, 0.5)',
                          borderRadius: 20,
                          width: 32,
                          height: 32,
                          justifyContent: 'center',
                          alignItems: 'center',
                          zIndex: 10,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 16 }}>
                    {t('profile.sections.noVideosTitle')}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                    {t('profile.sections.noVideosSubtitle')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Pics Section */}
          {activeSection === 'pics' && (
            <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 18,
                  fontFamily: 'Poppins-SemiBold',
                  marginBottom: 16,
                }}
              >
                Your Photos
              </Text>
              {photos && photos.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
                  {photos.map((photo, index) => (
                    <View
                      key={photo.$id}
                      style={{
                        width: '48%',
                        aspectRatio: 1,
                        backgroundColor: theme.surface,
                        borderRadius: 16,
                        marginBottom: 12,
                        overflow: 'hidden',
                        borderWidth: 1,
                        borderColor: theme.border,
                        position: 'relative',
                      }}
                    >
                      <TouchableOpacity
                        style={{ width: '100%', height: '100%' }}
                        onPress={() => {
                          setSelectedPhoto(photo);
                          setPhotoIndex(index);
                          setPhotoModalVisible(true);
                        }}
                      >
                        {(() => {
                          // Get filter and adjustments from photo
                          const filterId = photo.filter || 'none';
                          let adjustments = null;
                          if (photo.edits) {
                            try {
                              const edits = typeof photo.edits === 'string' ? JSON.parse(photo.edits) : photo.edits;
                              adjustments = edits.adjustments || null;
                            } catch (e) {
                              console.log('Error parsing edits:', e);
                            }
                          }
                          const filterCSS = getFilterCSS(filterId, adjustments);
                          
                          // Apply filter using WebView for photos
                          if (filterCSS !== 'none') {
                            return (
                              <View style={{ width: '100%', height: '100%' }}>
                                <WebView
                                  source={{
                                    html: `
                                      <!DOCTYPE html>
                                      <html>
                                        <head>
                                          <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                          <style>
                                            * {
                                              margin: 0;
                                              padding: 0;
                                              box-sizing: border-box;
                                            }
                                            body {
                                              width: 100%;
                                              height: 100%;
                                              overflow: hidden;
                                            }
                                            img {
                                              width: 100%;
                                              height: 100%;
                                              object-fit: cover;
                                              filter: ${filterCSS};
                                            }
                                          </style>
                                        </head>
                                        <body>
                                          <img src="${photo.photo || 'https://via.placeholder.com/300x300'}" alt="Filtered Photo" />
                                        </body>
                                      </html>
                                    `
                                  }}
                                  style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                                  scrollEnabled={false}
                                  showsVerticalScrollIndicator={false}
                                  showsHorizontalScrollIndicator={false}
                                />
                              </View>
                            );
                          }
                          
                          // No filter, use regular Image
                          return (
                            <Image
                              source={{ uri: photo.photo || 'https://via.placeholder.com/300x300' }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                          );
                        })()}
                      </TouchableOpacity>
                      {/* Delete Button */}
                      <TouchableOpacity
                        onPress={(e) => handleDeletePhoto(photo.$id, index, e)}
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          backgroundColor: 'rgba(255, 58, 48, 0.56)',
                          borderRadius: 20,
                          width: 32,
                          height: 32,
                          justifyContent: 'center',
                          alignItems: 'center',
                          zIndex: 10,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 16 }}>
                    No photos yet
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                    Create your first photo post
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/create')}
                    style={{
                      marginTop: 16,
                      backgroundColor: theme.accent,
                      paddingHorizontal: 24,
                      paddingVertical: 12,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold' }}>Create Post</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Bookmarks Section */}
          {activeSection === 'bookmarks' && (
            <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 18,
                  fontFamily: 'Poppins-SemiBold',
                  marginBottom: 16,
                }}
              >
                {t('profile.sections.yourBookmarks')}
              </Text>
            
              {bookmarksLoading || isRefreshingBookmarks ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>
                    {isRefreshingBookmarks ? t('profile.sections.bookmarksRefreshing') : t('profile.sections.bookmarksLoading')}
                  </Text>
                </View>
              ) : bookmarksError ? (
               <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                 <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('profile.sections.bookmarksError')}</Text>
                 <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 }}>{bookmarksError.message}</Text>
               </View>
             ) : bookmarks && bookmarks.length > 0 ? (
               <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
                 {bookmarks.map((bookmark, index) => {
                    // Get the fetched video data for this bookmark
                    const videoData = bookmarkVideos[bookmark.$id];
                    
                    // Use stable thumbnail URI
                    const thumbnailUri = videoData?.thumbnail || 'https://via.placeholder.com/300x300';
                    const hasVideo = !!videoData?.video;
                    
                    return (
                      <TouchableOpacity 
                         key={`bookmark-${bookmark.$id}`}
                        style={{
                          width: '48%',
                          aspectRatio: 1,
                          backgroundColor: theme.surface,
                          borderRadius: 16,
                          marginBottom: 12,
                          overflow: 'hidden',
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                         onPress={() => {
                           // For bookmarks, we need to fetch the actual video data first
                           if (bookmark.postId) {
                             // Get video by ID using the already imported function
                             getVideoById(bookmark.postId)
                               .then((videoData) => {
                                 const completePost = {
                                   $id: bookmark.postId,
                                   title: videoData.title || videoData.title || t('profile.general.bookmarkedVideo'),
                                   video: videoData.video,
                                  
                                   creator: videoData.creator || videoData.creator || { username: t('profile.general.unknownUser') }
                                 };
                                 openVideoModal(completePost, index);
                               })
                               .catch((error) => {
                                
                                 Alert.alert(t('common.error'), t('profile.alerts.videoLoadError'));
                               });
                           }
                         }}
                       >
                        <View style={{ width: '100%', height: '100%', position: 'relative' }}>
                          {/* Always show thumbnail image instead of Video component to prevent glitching */}
                          <Image
                            source={{ uri: thumbnailUri }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                          {/* Play icon overlay to indicate it's a video */}
                          {hasVideo && (
                            <View
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                justifyContent: 'center',
                                alignItems: 'center',
                                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                              }}
                            >
                              <View
                                style={{
                                  width: 48,
                                  height: 48,
                                  borderRadius: 24,
                                  backgroundColor: 'rgba(255, 255, 255, 0.9)',
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                }}
                              >
                                <Text style={{ fontSize: 20, marginLeft: 4 }}>▶</Text>
                              </View>
                            </View>
                          )}
                          {/* Bookmark Icon */}
                          <View
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              backgroundColor: themedColor('rgba(0,0,0,0.5)', 'rgba(255,255,255,0.65)'),
                              borderRadius: 12,
                              paddingHorizontal: 6,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ color: themedColor('#fff', theme.textPrimary), fontSize: 12 }}>🔖</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
               </View>
             ) : (
               <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                 <Text style={{ color: theme.textSecondary, textAlign: 'center' }}>{t('profile.sections.noBookmarksTitle')}</Text>
                 <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 }}>{t('profile.sections.noBookmarksSubtitle')}</Text>
               </View>
             )}
            </View>
          )}
        </View>

        {/* Pending Requests Section */}
        {isPrivate && pendingRequests && pendingRequests.length > 0 && (
          <View style={{ backgroundColor: theme.background }}>
            <View
              style={{
                marginHorizontal: 16,
                marginBottom: 32,
                backgroundColor: theme.surface,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.textPrimary, fontWeight: '600', marginBottom: 8 }}>
                {t('profile.pending.bannerTitle', { count: pendingRequests.length })}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {t('profile.pending.bannerSubtitle')}
              </Text>
              <TouchableOpacity
                onPress={() => setEditModalVisible(true)}
                style={{
                  marginTop: 12,
                  backgroundColor: theme.accent,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                  {t('profile.pending.manage')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* TikTok-style Video Modal */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setModalVisible(false)}
          style={{ backgroundColor: theme.background }}
        >
          {modalVideo && (
            <GestureHandlerRootView style={{ flex: 1 }}>
              <PanGestureHandler
                onGestureEvent={onGestureEvent}
                onHandlerStateChange={(event) => {
                  if (event.nativeEvent.state === State.END) {
                    onGestureEvent(event);
                  }
                }}
              >
                <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
                  {/* Close Button */}
                  <TouchableOpacity onPress={() => setModalVisible(false)} style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}>
                    <Text style={{ color: theme.textPrimary, fontSize: 28 }}>×</Text>
                  </TouchableOpacity>
                  
                  {/* Video */}
                  <View style={{ flex: 1, backgroundColor: theme.background, position: 'relative' }}>
                    <Video
                      ref={modalVideoRef}
                      source={{ uri: modalVideo.video }}
                      style={{ flex: 1, width: '100%', height: '100%' }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={isVideoPlaying}
                      isMuted={false}
                      useNativeControls={false}
                      posterSource={modalVideo.thumbnail && !modalVideo.thumbnail.includes('placeholder') ? { uri: modalVideo.thumbnail } : undefined}
                      onPlaybackStatusUpdate={status => {
                        
                        if (status.didJustFinish) setModalVisible(false);
                      }}
                      onError={(error) => {
                       
                      }}
                      onLoadStart={() => {
                       
                      }}
                      onLoad={() => {
                        
                      }}
                      onReadyForDisplay={() => {
                        
                      }}
                    />
                    
                    {/* Video Control Overlay */}
                    <TouchableOpacity
                      onPress={() => {
                        if (isVideoPlaying) {
                          modalVideoRef.current?.pauseAsync();
                          setIsVideoPlaying(false);
                        } else {
                          modalVideoRef.current?.playAsync();
                          setIsVideoPlaying(true);
                        }
                      }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        justifyContent: 'center',
                        alignItems: 'center',
                        backgroundColor: 'rgba(0, 0, 0, 0.3)',
                        opacity: 0
                      }}
                      activeOpacity={1}
                    />
                    
                    {/* Play/Pause Button */}
                    <TouchableOpacity
                      onPress={() => {
                        if (isVideoPlaying) {
                          modalVideoRef.current?.pauseAsync();
                          setIsVideoPlaying(false);
                        } else {
                          modalVideoRef.current?.playAsync();
                          setIsVideoPlaying(true);
                        }
                      }}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: [{ translateX: -25 }, { translateY: -25 }],
                        width: 50,
                        height: 50,
                        borderRadius: 25,
                        backgroundColor: themedColor('rgba(255, 255, 255, 0.2)', 'rgba(15,23,42,0.2)'),
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 5
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontSize: 24 }}>
                        {isVideoPlaying ? '❚❚' : '▶'}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Fallback thumbnail if video doesn't load - only show if video fails to load */}
                    {modalVideo.thumbnail && (
                      <Image
                        source={{ uri: modalVideo.thumbnail }}
                        style={{ 
                          position: 'absolute', 
                          top: 0, 
                          left: 0, 
                          width: '100%', 
                          height: '100%',
                          opacity: 0.1
                        }}
                        resizeMode="cover"
                      />
                    )}
                  </View>
                  
                  {/* Right Side Interaction Buttons - TikTok Style */}
                  <View style={{ position: 'absolute', right: 15, bottom: 150, zIndex: 10 }}>
                    {/* Profile Picture - Above Like Button */}
                    <TouchableOpacity style={{ marginBottom: 15, alignItems: 'center' }}>
                      <View style={{ position: 'relative' }}>
                        <Image
                          source={{ uri: modalVideo.creator?.avatar || user?.avatar }}
                          style={{
                            width: 50,
                            height: 50,
                            borderRadius: 25,
                            borderWidth: 2,
                            borderColor: themedColor('#fff', theme.border),
                          }}
                          resizeMode="cover"
                        />
                        <View
                          style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            backgroundColor: theme.accent,
                            width: 20,
                            height: 20,
                            borderRadius: 10,
                            justifyContent: 'center',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>+</Text>
                        </View>
                      </View>
                    </TouchableOpacity>

                    {/* Like Button */}
                    <TouchableOpacity onPress={handleLike} style={{ marginBottom: 20, alignItems: 'center' }}>
                      <View style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: liked
                          ? themedColor('rgba(255, 71, 87, 0.2)', 'rgba(248,113,113,0.18)')
                          : themedColor('rgba(255, 255, 255, 0.1)', theme.cardSoft),
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 5
                      }}>
                        <Image 
                          source={liked ? icons.heartCheck : icons.heartUncheck} 
                          style={{ width: 60, height: 60 }} 
                          resizeMode="contain" 
                        />
                      </View>
                      <TouchableOpacity onPress={handleOpenLikesModal}>
                        <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{formatCount(likesCount)}</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                    
                    {/* Comments Button */}
                    <TouchableOpacity onPress={handleCommentPress} style={{ marginBottom: 20, alignItems: 'center' }}>
                      <View style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: themedColor('rgba(255, 255, 255, 0.1)', theme.cardSoft),
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 5
                      }}>
                        <Image 
                          source={icons.messages} 
                          style={{ width: 60, height: 60 }} 
                          resizeMode="contain" 
                        />
                      </View>
                      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{formatCount(commentsCount)}</Text>
                    </TouchableOpacity>
                    
                    {/* Bookmark Button */}
                    <TouchableOpacity onPress={handleBookmark} style={{ marginBottom: 20, alignItems: 'center' }}>
                      <View style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: bookmarked
                          ? themedColor('rgba(255, 193, 7, 0.2)', theme.accentSoft)
                          : themedColor('rgba(255, 255, 255, 0.1)', theme.cardSoft),
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 5
                      }}>
                        <Image 
                          source={bookmarked ? icons.saved : icons.unsaved} 
                          style={{ width: 60, height: 60 }} 
                          resizeMode="contain" 
                        />
                      </View>
                      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                        {bookmarked ? t('profile.general.saved') : t('profile.general.save')}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* Share Button */}
                    <TouchableOpacity onPress={handleShare} style={{ marginBottom: 20, alignItems: 'center' }}>
                      <View style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: themedColor('rgba(255, 255, 255, 0.1)', theme.cardSoft),
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginBottom: 5
                      }}>
                        <Image 
                          source={icons.unshared} 
                          style={{ width: 60, height: 60 }} 
                          resizeMode="contain" 
                        />
                      </View>
                      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                        {formatCount(shareCount)}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Bottom Left Video Information - TikTok Style */}
                  <View style={{ position: 'absolute', bottom: 120, left: 15, right: 80, zIndex: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '600', marginRight: 8, maxWidth: '80%' }}
                    >
                      @{modalVideo.creator?.username || user?.username}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    style={{ color: theme.textPrimary, fontSize: 14, marginBottom: 8, lineHeight: 18 }}
                  >
                    {t('profile.general.videoTitle', { title: modalVideo.title || t('profile.general.untitled') })}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: theme.textPrimary, fontSize: 12, marginRight: 5 }}>♫</Text>
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={{ color: theme.textSecondary, fontSize: 12, maxWidth: '75%' }}
                    >
                      {t('profile.general.originalSound', { username: modalVideo.creator?.username || user?.username })}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, opacity: 0.8 }} numberOfLines={1}>
                      {t('profile.general.trendingTags')}
                    </Text>
                  </View>
                  
                  {/* Comments Modal */}
                  <Modal
                    visible={commentsModalVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setCommentsModalVisible(false)}
                  >
                    <KeyboardAvoidingView
                      style={{ flex: 1, justifyContent: 'flex-end' }}
                      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                      <View
                        style={{
                          backgroundColor: theme.surface,
                          borderTopLeftRadius: 18,
                          borderTopRightRadius: 18,
                          width: '100%',
                          maxHeight: '80%',
                          paddingBottom: 0,
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                      >
                        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                          <View
                            style={{
                              width: 40,
                              height: 4,
                              backgroundColor: theme.border,
                              borderRadius: 2,
                              marginBottom: 4,
                            }}
                          />
                          <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>
                            {t('profile.modals.commentsTitle')}
                          </Text>
                        </View>
                        {loadingComments ? (
                          <ActivityIndicator color={theme.accent} size="large" style={{ marginVertical: 24 }} />
                        ) : (
                          <FlatList
                            data={[...comments].reverse()} // Newest at bottom
                            keyExtractor={c => c.$id}
                            renderItem={({ item: c }) => (
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, paddingHorizontal: 16 }}>
                                <Image source={{ uri: c.avatar || images.profile }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: theme.accent, fontWeight: 'bold', fontSize: 15 }}>{c.username || c.userId}</Text>
                                  <Text style={{ color: theme.textPrimary, fontSize: 16 }}>{c.content}</Text>
                                  <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 2 }}>{new Date(c.createdAt).toLocaleString()}</Text>
                                </View>
                              </View>
                            )}
                            style={{ maxHeight: 320, marginBottom: 8 }}
                            showsVerticalScrollIndicator={false}
                            inverted // So newest is at the bottom
                          />
                        )}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingHorizontal: 12,
                            paddingBottom: 12,
                            backgroundColor: theme.surface,
                            borderTopWidth: 1,
                            borderColor: theme.border,
                          }}
                        >
                          <TextInput
                            value={newComment}
                            onChangeText={setNewComment}
                            placeholder={t('profile.modals.addCommentPlaceholder')}
                            placeholderTextColor={theme.inputPlaceholder}
                            style={{
                              flex: 1,
                              backgroundColor: themedColor('#333', theme.inputBackground),
                              color: theme.textPrimary,
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              fontSize: 16,
                              borderWidth: 1,
                              borderColor: theme.border,
                            }}
                            editable={!posting}
                          />
                          <TouchableOpacity
                            onPress={handleAddComment}
                            disabled={posting || !newComment.trim()}
                            style={{
                              marginLeft: 8,
                              backgroundColor: posting ? theme.border : theme.accent,
                              borderRadius: 8,
                              paddingHorizontal: 18,
                              paddingVertical: 12,
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                              {posting ? t('profile.modals.posting') : t('profile.modals.post')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          onPress={() => setCommentsModalVisible(false)}
                          style={{
                            alignSelf: 'center',
                            backgroundColor: theme.card,
                            paddingHorizontal: 32,
                            paddingVertical: 10,
                            borderRadius: 8,
                            marginBottom: 12,
                            marginTop: 2,
                          }}
                        >
                          <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 15 }}>
                            {t('profile.modals.close')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </KeyboardAvoidingView>
                  </Modal>
                  
                  {/* Likes List Modal */}
                  <Modal
                    visible={likesModalVisible}
                    animationType="slide"
                    transparent={true}
                    onRequestClose={() => setLikesModalVisible(false)}
                  >
                    <KeyboardAvoidingView
                      style={{ flex: 1, justifyContent: 'flex-end' }}
                      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                      <View
                        style={{
                          backgroundColor: theme.surface,
                          borderTopLeftRadius: 18,
                          borderTopRightRadius: 18,
                          width: '100%',
                          maxHeight: '70%',
                          borderWidth: 1,
                          borderColor: theme.border,
                        }}
                      >
                        <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                          <View style={{ width: 40, height: 4, backgroundColor: theme.border, borderRadius: 2, marginBottom: 4 }} />
                          <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold' }}>{t('profile.modals.likesTitle')}</Text>
                        </View>
                        {loadingLikes ? (
                          <ActivityIndicator color={theme.accent} size="large" style={{ marginVertical: 24 }} />
                        ) : likesList.length === 0 ? (
                          <Text style={{ color: theme.textSecondary, textAlign: 'center', marginVertical: 24 }}>{t('profile.modals.noLikes')}</Text>
                        ) : (
                          <FlatList
                            data={likesList}
                            keyExtractor={u => u.$id}
                            renderItem={({ item: u }) => (
                              <TouchableOpacity
                                onPress={() => handleUserPress(u.$id)}
                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18 }}
                              >
                                <Image source={{ uri: u.avatar || images.profile }} style={{ width: 38, height: 38, borderRadius: 19, marginRight: 12 }} />
                                <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '600' }}>{u.username}</Text>
                              </TouchableOpacity>
                            )}
                            style={{ maxHeight: 320, marginBottom: 8 }}
                            showsVerticalScrollIndicator={false}
                          />
                        )}
                        <TouchableOpacity
                          onPress={() => setLikesModalVisible(false)}
                          style={{
                            alignSelf: 'center',
                            backgroundColor: theme.card,
                            paddingHorizontal: 32,
                            paddingVertical: 10,
                            borderRadius: 8,
                            marginBottom: 12,
                            marginTop: 2,
                          }}
                        >
                          <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 15 }}>{t('profile.modals.close')}</Text>
                        </TouchableOpacity>
                      </View>
                    </KeyboardAvoidingView>
                  </Modal>
                </SafeAreaView>
              </PanGestureHandler>
            </GestureHandlerRootView>
          )}
        </Modal>

        {/* Following/Followers Modal */}
        <Modal
          visible={followModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={closeFollowModal}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: themedColor("rgba(0,0,0,0.55)", "rgba(15,23,42,0.3)"),
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 20,
            }}
          >
            <View
              style={{
                backgroundColor: theme.surface,
                padding: 24,
                borderRadius: 12,
                width: "100%",
                maxWidth: 350,
                maxHeight: 500,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: "bold" }}>
                  {followModalType === 'following' ? t('profile.modals.followingTitle') : t('profile.modals.followersTitle')}
                </Text>
                <TouchableOpacity onPress={closeFollowModal}>
                  <Text style={{ color: theme.textPrimary, fontSize: 20 }}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }}>
                {followModalData.length > 0 ? (
                  followModalData.map((modalUser, index) => {
                    const isFollowingUser = modalUser.followers?.includes(user?.$id) || false;

                    return (
                      <View
                        key={index}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: theme.divider,
                        }}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: theme.accentSoft,
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 12,
                            overflow: "hidden",
                            borderWidth: 1,
                            borderColor: theme.border,
                          }}
                        >
                          {modalUser.avatar ? (
                            <Image
                              source={{ uri: modalUser.avatar }}
                              style={{ width: 40, height: 40, borderRadius: 20 }}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "bold" }}>
                              {modalUser.username ? modalUser.username.charAt(0).toUpperCase() : 'U'}
                            </Text>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: "bold" }}>
                            {modalUser.username || t('profile.general.unknownUser')}
                          </Text>
                          <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                            @{modalUser.username || 'unknown'}
                          </Text>
                        </View>
                        {modalUser.$id !== user?.$id && (
                          <TouchableOpacity
                            onPress={() => handleFollowToggle(modalUser.$id)}
                            style={{
                              backgroundColor: isFollowingUser ? theme.cardSoft : theme.accent,
                              paddingHorizontal: 16,
                              paddingVertical: 6,
                              borderRadius: 6,
                            }}
                          >
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                              {isFollowingUser ? t('profile.modals.unfollow') : t('profile.modals.follow')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })
                ) : (
                  <View style={{ alignItems: "center", paddingVertical: 40 }}>
                    <Text style={{ color: theme.textSecondary, fontSize: 16 }}>
                      {followModalType === 'following' ? t('profile.modals.notFollowing') : t('profile.modals.noFollowers')}
                    </Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Photo Viewing Modal */}
        <Modal
          visible={photoModalVisible}
          animationType="fade"
          transparent={false}
          onRequestClose={() => setPhotoModalVisible(false)}
          style={{ backgroundColor: theme.background }}
        >
          {selectedPhoto && (
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
              <TouchableOpacity
                onPress={() => setPhotoModalVisible(false)}
                style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}
              >
                <Text style={{ color: theme.textPrimary, fontSize: 28 }}>×</Text>
              </TouchableOpacity>

              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Image
                  source={{ uri: selectedPhoto.photo || 'https://via.placeholder.com/300x300' }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode="contain"
                />
              </View>

              {/* Photo Info Overlay */}
              <View style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(0,0,0,0.7)',
                padding: 20,
              }}>
                {selectedPhoto.title && (
                  <Text style={{
                    color: '#fff',
                    fontSize: 18,
                    fontWeight: 'bold',
                    marginBottom: 8,
                  }}>
                    {selectedPhoto.title}
                  </Text>
                )}
                {selectedPhoto.caption && (
                  <Text style={{
                    color: '#fff',
                    fontSize: 14,
                    marginBottom: selectedPhoto.title ? 4 : 8,
                  }}>
                    {selectedPhoto.caption}
                  </Text>
                )}
                <Text style={{
                  color: '#fff',
                  fontSize: 12,
                  opacity: 0.8,
                }}>
                  Posted {selectedPhoto.$createdAt ? new Date(selectedPhoto.$createdAt).toLocaleDateString() : ''}
                </Text>
              </View>

              {/* Navigation Buttons */}
              {photos && photos.length > 1 && (
                <>
                  {photoIndex > 0 && (
                    <TouchableOpacity
                      onPress={() => {
                        const prevPhoto = photos[photoIndex - 1];
                        setSelectedPhoto(prevPhoto);
                        setPhotoIndex(photoIndex - 1);
                      }}
                      style={{
                        position: 'absolute',
                        left: 20,
                        top: '50%',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        padding: 15,
                        borderRadius: 25,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 24 }}>‹</Text>
                    </TouchableOpacity>
                  )}
                  {photoIndex < photos.length - 1 && (
                    <TouchableOpacity
                      onPress={() => {
                        const nextPhoto = photos[photoIndex + 1];
                        setSelectedPhoto(nextPhoto);
                        setPhotoIndex(photoIndex + 1);
                      }}
                      style={{
                        position: 'absolute',
                        right: 20,
                        top: '50%',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        padding: 15,
                        borderRadius: 25,
                      }}
                    >
                      <Text style={{ color: '#fff', fontSize: 24 }}>›</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </SafeAreaView>
          )}
        </Modal>

        {/* Edit Profile Modal */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={closeEditModal}
        >
          <View style={{ 
            flex: 1, 
            backgroundColor: themedColor("rgba(0,0,0,0.55)", "rgba(15,23,42,0.3)"),
            justifyContent: "center",
            alignItems: "center",
            paddingHorizontal: 20
          }}>
            <View style={{ 
              backgroundColor: theme.surface, 
              padding: 24, 
              borderRadius: 12, 
              width: "100%",
              maxWidth: 350,
              borderWidth: 1,
              borderColor: theme.border,
            }}>
              <Text style={{ color: theme.textPrimary, fontSize: 20, marginBottom: 20, textAlign: "center" }}>
                {t('profile.modals.editTitle')}
              </Text>
              
              {/* Username Input */}
              <Text style={{ color: theme.textPrimary, fontSize: 16, marginBottom: 8 }}>{t('profile.modals.usernameLabel')}</Text>
              <TextInput
                value={newUsername}
                onChangeText={setNewUsername}
                style={{
                  backgroundColor: themedColor('#333', theme.inputBackground),
                  color: theme.textPrimary,
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
                placeholder={t('profile.modals.usernamePlaceholder')}
                placeholderTextColor={theme.inputPlaceholder}
              />

              {/* Avatar Upload */}
              <Text style={{ color: theme.textPrimary, fontSize: 16, marginBottom: 8 }}>{t('profile.modals.avatarLabel')}</Text>
              
              {/* Avatar Preview */}
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <View
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    borderWidth: 2,
                    borderColor: theme.accent,
                    backgroundColor: theme.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    marginBottom: 12,
                  }}
                >
                  {newAvatar ? (
                    <Image
                      source={{ uri: newAvatar }}
                      style={{ width: '100%', height: '100%', borderRadius: 50 }}
                      resizeMode="cover"
                    />
                  ) : user?.avatar ? (
                    <Image
                      source={{ uri: user.avatar }}
                      style={{ width: '100%', height: '100%', borderRadius: 50 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={{ color: theme.textPrimary, fontSize: 32, fontWeight: '700' }}>
                      {getUserInitials(newUsername || user?.username)}
                    </Text>
                  )}
                </View>
                {uploadingAvatar && (
                  <ActivityIndicator color={theme.accent} size="small" style={{ marginBottom: 8 }} />
                )}
              </View>
              
              <TouchableOpacity
                onPress={pickAvatarImage}
                disabled={uploadingAvatar}
                style={{
                  backgroundColor: uploadingAvatar ? theme.border : themedColor('#333', theme.surfaceMuted),
                  padding: 12,
                  borderRadius: 8,
                  marginBottom: 20,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: theme.border,
                  opacity: uploadingAvatar ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.textPrimary }}>
                  {uploadingAvatar ? t('profile.modals.uploadingAvatar') : newAvatar ? t('Change Avatar') : t('profile.modals.uploadAvatar')}
                </Text>
              </TouchableOpacity>
              
              {/* Remove Avatar Option */}
              {newAvatar && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert(
                      t('profile.modals.removeAvatarTitle', 'Remove Avatar'),
                      t('profile.modals.removeAvatarMessage', 'Are you sure you want to remove your avatar?'),
                      [
                        {
                          text: t('common.cancel', 'Cancel'),
                          style: 'cancel'
                        },
                        {
                          text: t('common.remove', 'Remove'),
                          style: 'destructive',
                          onPress: () => setNewAvatar("")
                        }
                      ]
                    );
                  }}
                  style={{
                    backgroundColor: theme.danger || '#ff4757',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 20,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "600" }}>
                    {t('profile.modals.removeAvatar', 'Remove Avatar')}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Theme Toggle */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingVertical: 8 }}>
                <Text style={{ color: theme.textPrimary, fontSize: 16 }}>{t('profile.modals.themeLabel')}</Text>
                <ThemeToggle />
              </View>

              {/* Re-enable privacy toggle */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20, paddingVertical: 8 }}>
                <Text style={{ color: theme.textPrimary, fontSize: 16 }}>{t('profile.modals.privateProfileLabel')}</Text>
                <TouchableOpacity
                  onPress={() => setIsPrivate(!isPrivate)}
                  style={{
                    width: 50,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: isPrivate ? theme.accent : theme.cardSoft,
                    justifyContent: "center",
                    alignItems: isPrivate ? "flex-end" : "flex-start",
                    paddingHorizontal: 4,
                  }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
                </TouchableOpacity>
              </View>

              {/* Re-enable pending requests section in modal */}
              {isPrivate && pendingRequests && pendingRequests.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 16, marginBottom: 12 }}>
                    {t('profile.modals.pendingRequestsTitle', { count: pendingRequests.length })}
                  </Text>
                  <View style={{ maxHeight: 200 }}>
                    {pendingRequests.map((requestingUserId, index) => (
                      <PendingRequestItem 
                        key={index} 
                        requestingUserId={requestingUserId}
                        onApprove={() => handleAccessRequest(requestingUserId, 'approve')}
                        onDeny={() => handleAccessRequest(requestingUserId, 'deny')}
                      />
                    ))}
                  </View>
                </View>
              )}

              {/* Save and Cancel Buttons */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TouchableOpacity
                  onPress={saveProfileChanges}
                  disabled={saving}
                  style={{
                    flex: 1,
                    backgroundColor: saving ? theme.border : theme.accent,
                    padding: 12,
                    borderRadius: 8,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "bold" }}>
                    {saving ? t('profile.modals.saving') : t('profile.modals.save')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={closeEditModal}
                  style={{
                    flex: 1,
                    backgroundColor: theme.cardSoft,
                    padding: 12,
                    borderRadius: 8,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text style={{ color: theme.textPrimary, fontWeight: "bold" }}>{t('profile.modals.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;

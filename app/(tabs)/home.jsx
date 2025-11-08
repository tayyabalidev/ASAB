import { useState, useEffect, useCallback, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { FlatList, Image, RefreshControl, Text, View, TouchableOpacity, Dimensions, Modal, ActivityIndicator, TextInput, KeyboardAvoidingView, Share, Alert, ScrollView } from "react-native";
import { ResizeMode, Video } from "expo-av";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { GestureHandlerRootView, PanGestureHandler, State, Gesture } from "react-native-gesture-handler";
import { LinearGradient } from 'expo-linear-gradient';

import { images, icons } from "../../constants";
import useAppwrite from "../../lib/useAppwrite";
import { getAllPosts, getLatestPosts, toggleLikePost, getComments, addComment, getPostLikes, getFollowingPosts, toggleBookmark, isVideoBookmarked, getShareCount, incrementShareCount, getIOSCompatibleVideoUrl, toggleFollowUser } from "../../lib/appwrite";
import { useGlobalContext } from "../../context/GlobalProvider";
import { databases } from "../../lib/appwrite";
import { appwriteConfig } from "../../lib/appwrite";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const StrollVideoCard = ({ item, index, isVisible, onVideoStateChange, isHomeFocused }) => {
  const { user, followStatus, updateFollowStatus, isRTL } = useGlobalContext();
  const { t } = useTranslation();
  const [play, setPlay] = useState(false);
  const [liked, setLiked] = useState(item.likes?.includes(user?.$id));
  const [likesCount, setLikesCount] = useState(item.likes ? item.likes.length : 0);
  const [bookmarked, setBookmarked] = useState(false);
  const [commentsCount, setCommentsCount] = useState(item.comments ? item.comments.length : 0);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [likesModalVisible, setLikesModalVisible] = useState(false);
  const [likesList, setLikesList] = useState([]);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [shareCount, setShareCount] = useState(item.shares || 0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showProfileHint, setShowProfileHint] = useState(false);

  // Show initial hint when video becomes visible (only once per video)
  useEffect(() => {
    if (isVisible && !showProfileHint) {
      // Show hint after 3 seconds of video being visible
      const timer = setTimeout(() => {
        setShowProfileHint(true);
        setTimeout(() => setShowProfileHint(false), 3000);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, showProfileHint]);

  // Fetch comments count on mount or when item changes
  useEffect(() => {
    async function fetchCommentsCount() {
      try {
        const comments = await getComments(item.$id);
        setCommentsCount(comments.length);
      } catch {}
    }
    fetchCommentsCount();
  }, [item.$id]);

  // Check bookmark status on mount
  useEffect(() => {
    async function checkBookmarkStatus() {
      if (user?.$id) {
        try {
          const isBookmarked = await isVideoBookmarked(user.$id, item.$id);
          setBookmarked(isBookmarked);
        } catch (error) {
          
        }
      }
    }
    checkBookmarkStatus();
  }, [user?.$id, item.$id]);

  // Fetch share count on mount
  useEffect(() => {
    async function fetchShareCount() {
      try {
        const shares = await getShareCount(item.$id);
        setShareCount(shares);
      } catch (error) {
       
      }
    }
    fetchShareCount();
  }, [item.$id]);

  // Check if current user is following the video creator
  useEffect(() => {
    async function checkFollowStatus() {
      if (user?.$id && item.creator?.$id && user.$id !== item.creator.$id) {
        // First check global state
        if (followStatus[item.creator.$id] !== undefined) {
          setIsFollowing(followStatus[item.creator.$id]);
        } else {
          // Fallback to database check
          try {
            const currentUser = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, user.$id);
            const following = currentUser.following || [];
            const isFollowingUser = following.includes(item.creator.$id);
            setIsFollowing(isFollowingUser);
            // Update global state
            updateFollowStatus(item.creator.$id, isFollowingUser);
          } catch (error) {
            
          }
        }
      } else {
        // Reset follow status if it's the same user or no user
        setIsFollowing(false);
      }
    }
    checkFollowStatus();
  }, [user?.$id, item.creator?.$id, followStatus]);

  // Fetch comments when modal opens
  useEffect(() => {
    if (commentsModalVisible) {
      setLoadingComments(true);
      getComments(item.$id)
        .then((res) => setComments(res))
        .catch(() => setComments([]))
        .finally(() => setLoadingComments(false));
    }
  }, [commentsModalVisible, item.$id]);

  // Fetch likes list when modal opens
  useEffect(() => {
    if (likesModalVisible) {
      setLoadingLikes(true);
      getPostLikes(item.$id)
        .then(async (userIds) => {
          // Fetch user info for each userId
          const users = await Promise.all(
            userIds.map(async (uid) => {
              try {
                const u = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, uid);
                return { $id: u.$id, username: u.username, avatar: u.avatar };
              } catch {
                return { $id: uid, username: 'Unknown', avatar: images.profile };
              }
            })
          );
          setLikesList(users);
        })
        .catch(() => setLikesList([]))
        .finally(() => setLoadingLikes(false));
    }
  }, [likesModalVisible, item.$id]);

  // Handle visibility changes and home focus
  useEffect(() => {
    if (isVisible && isHomeFocused) {
      setPlay(true);
    } else {
      setPlay(false);
    }
  }, [isVisible, isHomeFocused]);

  const handleVideoPress = () => {
    setPlay((prev) => !prev);
  };

  const handleLike = async () => {
    if (!user?.$id) return;
    setLiked((prev) => !prev);
    setLikesCount((prev) => (liked ? prev - 1 : prev + 1));
    try {
      await toggleLikePost(item.$id, user.$id);
    } catch {}
  };

  const handleBookmark = async () => {
    if (!user?.$id) {
      Alert.alert(t("common.error"), t("alerts.loginToBookmark"));
      return;
    }

    try {
      const videoData = {
        title: item.title,
        creator: item.creator.username,
        avatar: item.creator.avatar,
        thumbnail: item.thumbnail,
        video: item.video,
        videoId: item.$id
      };

      const newBookmarkStatus = await toggleBookmark(user.$id, item.$id, videoData);
      setBookmarked(newBookmarkStatus);
    } catch (error) {
      
      Alert.alert(t("common.error"), t("alerts.bookmarkFailed"));
    }
  };

  const handleShare = async () => {
    try {
      const result = await Share.share({
        message: `Check out this video: ${item.title} by ${item.creator.username}\n${item.video}`,
        title: item.title,
      });
      
      if (result.action === Share.sharedAction) {
        // Increment share count
        const newShareCount = await incrementShareCount(item.$id);
        setShareCount(newShareCount);
        
      }
    } catch (error) {
      
      Alert.alert(t("common.error"), t("alerts.shareFailed"));
    }
  };

  const handleProfilePress = () => {
    if (item.creator.$id && item.creator.$id !== user?.$id) {
      router.push(`/profile/${item.creator.$id}`);
    }
  };

  // Handle left swipe gesture for profile opening
  const onGestureEvent = (event) => {
    const { translationX, state } = event.nativeEvent;
    
    // Check if it's a left swipe (negative translationX) and gesture is finished
    if (state === State.END && translationX < -100) {
      
      // Only open profile if it's not the current user's video
      if (item.creator?.$id && item.creator.$id !== user?.$id) {
        // Show hint briefly before opening profile
        setShowProfileHint(true);
        setTimeout(() => {
          setShowProfileHint(false);
          router.push(`/profile/${item.creator.$id}`);
        }, 300);
      }
    }
  };

  const handleFollowPress = async () => {
    if (!user?.$id || !item.creator?.$id || user.$id === item.creator.$id) return;
    
    // Immediate visual feedback - no loading state
    const newFollowState = !isFollowing;
    setIsFollowing(newFollowState);
    updateFollowStatus(item.creator.$id, newFollowState);
    
    try {
      await toggleFollowUser(user.$id, item.creator.$id);
      
      // Show success message
      const action = newFollowState ? 'followed' : 'unfollowed';
      
    } catch (error) {
      
      Alert.alert(t("common.error"), t("alerts.followFailed"));
      // Revert the state change on error
      setIsFollowing(!newFollowState);
      updateFollowStatus(item.creator.$id, !newFollowState);
    }
  };

  const handleCommentPress = () => {
    setCommentsModalVisible(true);
  };

  const handleAddComment = async () => {
    
    if (!newComment.trim() || !user?.$id) return;
    setPosting(true);
    try {
      const comment = await addComment(item.$id, user.$id, newComment.trim());
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

  return (
    <View style={{ 
      height: SCREEN_HEIGHT, 
      backgroundColor: '#000', 
      overflow: 'hidden', 
      position: 'relative',
      ...(Platform.OS === 'ios' && { 
        paddingTop: 0,
        marginTop: 0 
      })
    }}>
    
                                         {/* Swipe Gesture Handler for Profile Opening - TikTok Style */}
                   <PanGestureHandler
            onHandlerStateChange={(event) => {
              const { translationX, state } = event.nativeEvent;
              
              if (state === State.END && translationX < -80) {
                // Only open profile if it's not the current user's video
                if (item.creator?.$id && item.creator.$id !== user?.$id) {
                  // Show hint briefly before opening profile
                  setShowProfileHint(true);
                  
                  // Navigate to profile
                  router.push(`/profile/${item.creator.$id}`);
                  
                  setTimeout(() => {
                    setShowProfileHint(false);
                  }, 1000);
                }
              }
            }}
            activeOffsetX={[-20, 20]} // Very sensitive horizontal detection
            activeOffsetY={[-100, 100]} // Allow more vertical movement without canceling
          >
          <View style={{ 
            position: 'absolute', 
            left: 0, 
            top: 0, 
            width: '50%', // Only cover left half of the video
            bottom: 0, 
            zIndex: 15 
          }}>
            
           </View>
        </PanGestureHandler>
      
      {/* Video Background */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleVideoPress}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, backgroundColor: '#000' }}
      >
        {item.video ? (
        <Video
          source={{ 
            uri: getIOSCompatibleVideoUrl(item.video) || item.video
          }}
          style={{ width: '100%', height: '100%' }}
          resizeMode={ResizeMode.COVER}
          shouldPlay={play}
          isLooping
          isMuted={false}
          useNativeControls={false}
          onError={(error) => {
            console.log('Video error:', error);
          }}
          onLoad={() => {
            console.log('Video loaded successfully');
          }}
          onPlaybackStatusUpdate={(status) => {
            if (status.didJustFinish) {
              setPlay(false);
            }
          }}
          {...(Platform.OS === 'ios' && {
            allowsExternalPlayback: false,
            playInSilentModeIOS: true,
            ignoreSilentSwitch: 'ignore'
          })}
        />
        ) : (
          <View style={{ width: '100%', height: '100%', backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>{t("home.noVideoAvailable")}</Text>
          </View>
        )}
        {!play && item.video && (
          <View style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -24 }, { translateY: -24 }] }}>
            <Image source={icons.play} style={{ width: 48, height: 48 }} resizeMode="contain" />
          </View>
        )}
      </TouchableOpacity>



      {/* Right Side Interaction Buttons */}
      <View style={{ position: 'absolute', right: 15, bottom: 150, zIndex: 20 }}>
        {/* Profile Picture */}
        <TouchableOpacity onPress={handleProfilePress} style={{ marginBottom: 20, alignItems: 'center' }}>
          <View style={{ position: 'relative' }}>
            <Image
              source={{ uri: item.creator.avatar }}
              style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#fff' }}
              resizeMode="cover"
            />
                         {/* Follow/Following Icon */}
             {user?.$id !== item.creator?.$id && (
               <TouchableOpacity 
                 onPress={handleFollowPress}
                 style={{ 
                   position: 'absolute', 
                   bottom: -2, 
                   right: -2, 
                   backgroundColor: isFollowing ? '#4CAF50' : '#007AFF', 
                   width: 24, 
                   height: 24, 
                   borderRadius: 12, 
                   justifyContent: 'center', 
                   alignItems: 'center',
                   borderWidth: 2,
                   borderColor: '#fff',
                   shadowColor: '#000',
                   shadowOffset: { width: 0, height: 2 },
                   shadowOpacity: 0.3,
                   shadowRadius: 4,
                   elevation: 4
                 }}
               >
                 <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
                   {isFollowing ? '✓' : '+'}
                 </Text>
               </TouchableOpacity>
             )}
          </View>
        </TouchableOpacity>

        {/* Like Button */}
        <TouchableOpacity onPress={handleLike} style={{ marginBottom: 20, alignItems: 'center' }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: liked ? 'rgba(255, 71, 87, 0.2)' : 'rgba(255, 255, 255, 0.1)',
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
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{formatCount(likesCount)}</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Comments Button */}
        <TouchableOpacity onPress={handleCommentPress} style={{ marginBottom: 20, alignItems: 'center' }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{formatCount(commentsCount)}</Text>
        </TouchableOpacity>

        {/* Bookmark Button */}
        <TouchableOpacity onPress={handleBookmark} style={{ marginBottom: 20, alignItems: 'center' }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: bookmarked ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 255, 255, 0.1)',
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
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
            {bookmarked ? t("home.saved") : t("home.save")}
          </Text>
        </TouchableOpacity>

        {/* Share Button */}
        <TouchableOpacity onPress={handleShare} style={{ marginBottom: 20, alignItems: 'center' }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{formatCount(shareCount)}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Left Video Information */}
      <View style={{ position: 'absolute', bottom: 100, left: 15, right: 80, zIndex: 20 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
          {item.creator.username}
        </Text>
        <Text style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>
          {item.title} ♫ ✨
        </Text>
        <Text style={{ color: '#fff', fontSize: 12, marginBottom: 4 }}>
          …
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 12, marginRight: 5 }}>♫</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>
            {t("home.containsLabel", { title: item.title })}
          </Text>
        </View>
      </View>

      {/* TikTok-style Comments Modal */}
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
          <View style={{ backgroundColor: '#22223b', borderTopLeftRadius: 18, borderTopRightRadius: 18, width: '100%', maxHeight: '80%', paddingBottom: 0 }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ width: 40, height: 4, backgroundColor: '#444', borderRadius: 2, marginBottom: 4 }} />
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t("home.commentsTitle")}</Text>
            </View>
            {loadingComments ? (
              <ActivityIndicator color="#a77df8" size="large" style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={[...comments].reverse()} // Newest at bottom
                keyExtractor={c => c.$id}
                renderItem={({ item: c }) => (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14, paddingHorizontal: 16 }}>
                    <Image source={{ uri: c.avatar || images.profile }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#a77df8', fontWeight: 'bold', fontSize: 15 }}>{c.username || c.userId}</Text>
                      <Text style={{ color: '#fff', fontSize: 16 }}>{c.content}</Text>
                      <Text style={{ color: '#aaa', fontSize: 11, marginTop: 2 }}>{new Date(c.createdAt).toLocaleString()}</Text>
                    </View>
                  </View>
                )}
                style={{ maxHeight: 320, marginBottom: 8 }}
                showsVerticalScrollIndicator={false}
                inverted // So newest is at the bottom
              />
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#22223b' }}>
              <TextInput
                value={newComment}
                onChangeText={setNewComment}
                placeholder={t("home.commentPlaceholder")}
                placeholderTextColor="#aaa"
                style={{ flex: 1, backgroundColor: '#333', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, textAlign: isRTL ? 'right' : 'left' }}
                editable={!posting}
              />
              <TouchableOpacity
                onPress={handleAddComment}
                disabled={posting || !newComment.trim()}
                style={{ marginLeft: 8, backgroundColor: posting ? '#888' : '#a77df8', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12 }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{posting ? '...' : t("home.post")}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => setCommentsModalVisible(false)} style={{ alignSelf: 'center', backgroundColor: '#444', paddingHorizontal: 32, paddingVertical: 10, borderRadius: 8, marginBottom: 12, marginTop: 2 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{t("home.close")}</Text>
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
          <View style={{ backgroundColor: '#22223b', borderTopLeftRadius: 18, borderTopRightRadius: 18, width: '100%', maxHeight: '70%' }}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View style={{ width: 40, height: 4, backgroundColor: '#444', borderRadius: 2, marginBottom: 4 }} />
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t("home.likesTitle")}</Text>
            </View>
            {loadingLikes ? (
              <ActivityIndicator color="#a77df8" size="large" style={{ marginVertical: 24 }} />
            ) : likesList.length === 0 ? (
              <Text style={{ color: '#fff', textAlign: 'center', marginVertical: 24 }}>{t("home.likesEmpty")}</Text>
            ) : (
              <FlatList
                data={likesList}
                keyExtractor={u => u.$id}
                renderItem={({ item: u }) => (
                  <TouchableOpacity onPress={() => handleUserPress(u.$id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18 }}>
                    <Image source={{ uri: u.avatar || images.profile }} style={{ width: 38, height: 38, borderRadius: 19, marginRight: 12 }} />
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{u.username}</Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 320, marginBottom: 8 }}
                showsVerticalScrollIndicator={false}
              />
            )}
            <TouchableOpacity onPress={() => setLikesModalVisible(false)} style={{ alignSelf: 'center', backgroundColor: '#444', paddingHorizontal: 32, paddingVertical: 10, borderRadius: 8, marginBottom: 12, marginTop: 2 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{t("home.close")}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const Home = () => {
  const { user, isRTL } = useGlobalContext();
  const { t } = useTranslation();
  const [selectedTab, setSelectedTab] = useState('forYou'); // 'forYou' or 'following'
  const [refreshing, setRefreshing] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [currentTrendingIndex, setCurrentTrendingIndex] = useState(0);
  const [isHomeFocused, setIsHomeFocused] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchInputRef = useRef(null);
  const [trendingModalVisible, setTrendingModalVisible] = useState(false);
  const [trendingModalVideo, setTrendingModalVideo] = useState(null);
  const [isTrendingVideoPlaying, setIsTrendingVideoPlaying] = useState(true);
  const trendingVideoRef = useRef(null);
  
  // Get posts based on selected tab
  const { data: forYouPosts, refetch: refetchForYou } = useAppwrite(getAllPosts, []);
  const { data: followingPosts, refetch: refetchFollowing } = useAppwrite(
    () => user?.$id ? getFollowingPosts(user.$id) : Promise.resolve([]),
    [user?.$id]
  );
  
  // Get latest posts for trending section
  const { data: latestPosts } = useAppwrite(getLatestPosts, []);
  
 
  
  const posts = selectedTab === 'forYou' ? forYouPosts : followingPosts;
  const refetch = selectedTab === 'forYou' ? refetchForYou : refetchFollowing;

  // Simple search function that maintains focus
  const handleSearch = (query) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const filteredPosts = posts?.filter(post => 
      post.title?.toLowerCase().includes(query.toLowerCase()) ||
      post.creator?.username?.toLowerCase().includes(query.toLowerCase())
    ) || [];
    
    setSearchResults(filteredPosts);
    
    
    // Ensure the input maintains focus
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Use search results if searching, otherwise use normal posts
  const displayPosts = isSearching ? searchResults : posts;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Reset video index when switching tabs
  useEffect(() => {
    setCurrentVideoIndex(0);
  }, [selectedTab]);

  // Handle focus/blur to stop videos when navigating away
  useFocusEffect(
    useCallback(() => {
      setIsHomeFocused(true);
      return () => {
        setIsHomeFocused(false);
      };
    }, [])
  );

  // Handle trending videos scroll to determine center video
  const handleTrendingScroll = (event) => {
    const scrollX = event.nativeEvent.contentOffset.x;
    // Calculate item width: center video (130) + margins (16 total), side videos (110) + margins (16 total)
    // Use average width for calculation
    const averageItemWidth = 126; // Average of 146 (130+16) and 126 (110+16)
    const centerIndex = Math.round(scrollX / averageItemWidth);
    
    // Clamp the index between 0 and the number of videos - 1
    const maxIndex = Math.max(0, (latestPosts?.length || 1) - 1);
    const newIndex = Math.max(0, Math.min(centerIndex, maxIndex));
    
    if (newIndex !== currentTrendingIndex && newIndex < (latestPosts?.length || 0)) {
      setCurrentTrendingIndex(newIndex);
    }
  };

  const handleViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      setCurrentVideoIndex(newIndex);
      
      // Ensure the video starts playing when it becomes visible
      if (__DEV__) {
        
      }
    }
  }, []);

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
    minimumViewTime: 100,
  };

  const renderVideoCard = useCallback(({ item, index }) => (
    <StrollVideoCard
      item={item}
      index={index}
      isVisible={index === currentVideoIndex}
      onVideoStateChange={() => {}} // Empty function since we're not using it anymore
      isHomeFocused={isHomeFocused}
    />
  ), [currentVideoIndex, isHomeFocused]);

  // Render trending video item
  const renderTrendingItem = ({ item, index }) => {
    // Determine if this is the center video based on currentTrendingIndex
    const isCenterVideo = index === currentTrendingIndex;
    
    // Get video dimensions - center video is larger, side videos are smaller
    // Making videos taller and narrower to match the second image
    const getVideoWidth = () => {
      return isCenterVideo ? 130 : 110; // Center video wider but narrower than before
    };
    
    const getVideoHeight = () => {
      return isCenterVideo ? 260 : 220; // Center video taller to match aspect ratio
    };
    
    // Minimal spacing between videos
    const getMarginHorizontal = () => {
      return 8; // Very small margins for minimal spacing
    };
    return (
    <TouchableOpacity 
      key={item.$id}
      style={{ 
        marginHorizontal: getMarginHorizontal(),
        alignItems: 'center'
      }}
      onPress={() => {
        // Open full screen modal instead of toggling play
        setTrendingModalVideo(item);
        setTrendingModalVisible(true);
        setIsTrendingVideoPlaying(true);
      }}
    >
      <View style={{ 
        width: getVideoWidth(), 
        height: getVideoHeight(), 
        borderRadius: 16, 
        marginTop: 18, 
        backgroundColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 8,
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        {item.video ? (
          <View style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Video
              source={{ 
                uri: getIOSCompatibleVideoUrl(item.video) || item.video
              }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
              shouldPlay={false}
              isMuted={true}
              isLooping={false}
              useNativeControls={false}
              posterSource={item.thumbnail ? { uri: item.thumbnail } : undefined}
              onError={(error) => {
                console.log('Trending video error:', error);
              }}
              onLoad={() => {
                console.log('Trending video loaded');
              }}
              {...(Platform.OS === 'ios' && {
                allowsExternalPlayback: false,
                playInSilentModeIOS: true,
                ignoreSilentSwitch: 'ignore'
              })}
            />
            
            {/* Play Icon Overlay */}
            <View style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -24 }, { translateY: -24 }] }}>
              <Image source={icons.play} style={{ width: 48, height: 48 }} resizeMode="contain" />
            </View>
          </View>
        ) : (
          <View style={{ 
            width: '100%', 
            height: '100%', 
            backgroundColor: 'rgba(0,0,0,0.3)', 
            justifyContent: 'center', 
            alignItems: 'center' 
          }}>
            <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>
              {item.title || t("home.noVideo")}
            </Text>
          </View>
        )}
      </View>
      {/* Creator name hidden as requested */}
    </TouchableOpacity>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaView 
        style={{ flex: 1, backgroundColor: '#000'}} 
        edges={Platform.OS === 'ios' ? ['top', 'left', 'right'] : ['top', 'left', 'right']}
      >
        <View style={{ flex: 1, position: 'relative' }}>
          {/* Background Image */}
          <Image
            source={images.backgroundImage || images.empty}
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
            onError={(error) => {
              console.log('Background image failed to load:', error);
            }}
          />
          {/* Dark overlay for better text readability */}
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)'
          }} />


        {/* Combined Scrollable Content with Trending and Videos */}
        <FlatList
            data={displayPosts}
            keyExtractor={(item) => item.$id}
            renderItem={renderVideoCard}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            snapToInterval={SCREEN_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
          getItemLayout={(data, index) => {
            // Calculate exact header height based on actual component heights
            // Welcome section: ~120px, Search: ~80px, Trending: 470px + padding, Tabs: 65px
            const welcomeHeight = 120; // Welcome back + username
            const searchHeight = 80;   // Search bar
            const trendingHeight = 470 + 40; // Trending section + padding
            const tabsHeight = 65; // Tabs section (15px top + 35px content + 15px bottom)
            const totalHeaderHeight = welcomeHeight + searchHeight + trendingHeight + tabsHeight;
            
            return {
              length: SCREEN_HEIGHT,
              offset: totalHeaderHeight + (SCREEN_HEIGHT * index),
              index,
            };
          }}
          ListHeaderComponent={() => (
            // Header Section with User Name and Search
            <View style={{ 
              paddingVertical: 20,
              borderBottomWidth: 1,
              borderBottomColor: 'rgba(255,255,255,0.1)'
            }}>
              {/* Header with Logo and ASAB Badge */}
              <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  {/* Left Logo */}
                  <Image
                    source={images.amedia}
                    style={{ width: 60, height: 60 }}
                    resizeMode="contain"
                  />
                  
                  {/* Right ASAB VIDEOS Badge with Beige Back Background */}
                  <View style={{
                    width: 120,
                    height: 120,
                    borderRadius: 50,
                    overflow: 'hidden',
                  }}>
                    <Image
                      source={require('../../assets/images/Beige Back.png')}
                      style={{
                        width: '100%',
                        height: '100%',
                      }}
                      resizeMode="cover"
                    />
                  </View>
                </View>
                
                {/* Welcome Back and Username */}
                <View>
                  <Text style={{ 
                    color: '#ccc', 
                    fontSize: 14, 
                    marginBottom: 5,
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                    {t("home.welcomeBack")}
                  </Text>
                  <Text style={{ 
                    color: '#fff', 
                    fontSize: 24, 
                    fontWeight: 'bold',
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                    {user?.username || 'jsmastery'}
                  </Text>
                </View>
              </View>

              {/* Search Bar */}
              <View style={{ paddingHorizontal: 20, marginBottom: 10 }}>
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.2)'
                }}>
                  <TextInput
                    ref={searchInputRef}
                    placeholder={t("home.searchPlaceholder")}
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    style={{
                      flex: 1,
                      color: '#fff',
                      fontSize: 16,
                      marginRight: 10,
                      textAlign: isRTL ? 'right' : 'left',
                    }}
                    value={searchQuery}
                    onChangeText={handleSearch}
                    blurOnSubmit={false}
                    returnKeyType="search"
                    autoCorrect={false}
                    autoCapitalize="none"
                    onFocus={() => console.log('Search field focused')}
                    onBlur={() => console.log('Search field blurred')}
                    onSubmitEditing={() => {
                      // Keep focus on the input
                      searchInputRef.current?.focus();
                      
                    }}
                  />
                  <TouchableOpacity onPress={() => {
                    if (searchQuery.trim()) {
                      // Clear search
                      setSearchQuery('');
                      setSearchResults([]);
                      setIsSearching(false);
                    }
                  }}>
                  <Text style={{ color: '#fff', fontSize: 18 }}>
                      {searchQuery.trim() ? '✕' : '🔍'}
                    </Text>
                  </TouchableOpacity>
                  

                </View>
              </View>

              {/* Search Results Indicator */}
              {isSearching && searchQuery.trim() && (
                <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                  <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center' }}>
                    {searchResults.length > 0 
                      ? t("home.searchResults", { count: searchResults.length, query: searchQuery })
                      : t("home.searchNoResults", { query: searchQuery })
                    }
                  </Text>
                </View>
              )}

              {/* Trending Videos Section */}
              {latestPosts && latestPosts.length > 0 ? (
                <View style={{ 
                  backgroundColor: '#020E0D', 
                  paddingVertical: 20,
                  borderBottomWidth: 1,
                  height: 400
                }}>
                  <Text style={{ 
                    color: '#fff', 
                    fontSize: 20, 
                    fontWeight: 'bold', 
                    marginBottom: 15, 
                    paddingHorizontal: 20,
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                    {t("home.trendingTitle")}
              </Text>
                  
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20 }}
                  >
                    {latestPosts.slice(0, 5).map((item, index) => renderTrendingItem({ item, index }))}
                  </ScrollView>
                  
                  {/* Carousel Indicators */}
                  <View style={{ 
                    flexDirection: 'row', 
                    justifyContent: 'center', 
                  }}>
                    {latestPosts.slice(0, 4).map((_, index) => (
                      <View 
                        key={index}
                        style={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: 4, 
                          backgroundColor: index === 1 ? '#FFD700' : 'rgba(255,255,255,0.3)', 
                          marginHorizontal: 4 
                        }} 
                      />
                    ))}
                  </View>
                </View>
               ) : null}
              
              {/* For You / Following Tabs - TikTok Style */}
              <View style={{ paddingVertical: 15, backgroundColor: '#000' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                  <TouchableOpacity 
                    onPress={() => setSelectedTab('forYou')}
                    style={{ 
                      backgroundColor: selectedTab === 'forYou' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', 
                      paddingHorizontal: 24, 
                      paddingVertical: 10, 
                      borderRadius: 20, 
                      marginHorizontal: 5 
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: selectedTab === 'forYou' ? '700' : '400' }}>
                      {t("home.tabForYou")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setSelectedTab('following')}
                    style={{ 
                      backgroundColor: selectedTab === 'following' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)', 
                      paddingHorizontal: 24, 
                      paddingVertical: 10, 
                      borderRadius: 20, 
                      marginHorizontal: 5 
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 15, fontWeight: selectedTab === 'following' ? '700' : '400' }}>
                      {t("home.tabFollowing")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
        )}
        />
        </View>
      </SafeAreaView>

      {/* Full Screen Trending Video Modal */}
      <Modal
        visible={trendingModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setTrendingModalVisible(false)}
        style={{ backgroundColor: '#000' }}
      >
        {trendingModalVideo && (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
              {/* Close Button */}
              <TouchableOpacity 
                onPress={() => setTrendingModalVisible(false)} 
                style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}
              >
                <Text style={{ color: '#fff', fontSize: 28 }}>×</Text>
              </TouchableOpacity>
              
              {/* Video */}
              <View style={{ flex: 1, backgroundColor: '#000', position: 'relative' }}>
                <Video
                  ref={trendingVideoRef}
                  source={{ 
                    uri: getIOSCompatibleVideoUrl(trendingModalVideo.video) || trendingModalVideo.video
                  }}
                  style={{ flex: 1, width: '100%', height: '100%' }}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={isTrendingVideoPlaying}
                  isMuted={false}
                  isLooping={true}
                  useNativeControls={false}
                  posterSource={trendingModalVideo.thumbnail ? { uri: trendingModalVideo.thumbnail } : undefined}
                  {...(Platform.OS === 'ios' && {
                    allowsExternalPlayback: false,
                    playInSilentModeIOS: true,
                    ignoreSilentSwitch: 'ignore'
                  })}
                  onError={(error) => {
                    console.log('Trending modal video error:', error);
                  }}
                  onLoad={() => {
                    console.log('Trending modal video loaded');
                  }}
                />
                
                {/* Play/Pause Button */}
                <TouchableOpacity
                  onPress={() => {
                    if (isTrendingVideoPlaying) {
                      trendingVideoRef.current?.pauseAsync();
                      setIsTrendingVideoPlaying(false);
                    } else {
                      trendingVideoRef.current?.playAsync();
                      setIsTrendingVideoPlaying(true);
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
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 5
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 24 }}>
                    {isTrendingVideoPlaying ? '❚❚' : '▶'}
                  </Text>
                </TouchableOpacity>
                
                {/* Video Info Overlay */}
                <View style={{ 
                  position: 'absolute', 
                  bottom: 50, 
                  left: 20, 
                  right: 20,
                  zIndex: 5
                }}>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
                    {trendingModalVideo.title || t("home.untitledVideo")}
                  </Text>
                  {trendingModalVideo.creator && (
                    <Text style={{ color: '#ccc', fontSize: 14 }}>
                      @{trendingModalVideo.creator.username}
                    </Text>
                  )}
                </View>
              </View>
            </SafeAreaView>
          </GestureHandlerRootView>
        )}
      </Modal>
    </GestureHandlerRootView>
  );
};

export default Home;

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { FlatList, Image, RefreshControl, Text, View, TouchableOpacity, Dimensions, Modal, ActivityIndicator, TextInput, KeyboardAvoidingView, Share, Alert, ScrollView, Linking } from "react-native";
import { ResizeMode, Video } from "expo-av";
import Slider from "@react-native-community/slider";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { GestureHandlerRootView, PanGestureHandler, State, Gesture } from "react-native-gesture-handler";
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';

import { images, icons } from "../../constants";
import useAppwrite from "../../lib/useAppwrite";
import { getAllPosts, getLatestPosts, toggleLikePost, getComments, addComment, getPostLikes, getFollowingPosts, toggleBookmark, isVideoBookmarked, getShareCount, incrementShareCount, getIOSCompatibleVideoUrl, toggleFollowUser, getAllPhotoPosts, getLatestPhotoPosts, getPhotoUrl, getActiveAdvertisements, toggleLikeComment, getCommentLikes } from "../../lib/appwrite";
import AdvertisementCard from "../../components/AdvertisementCard";
import { useGlobalContext } from "../../context/GlobalProvider";
import { databases } from "../../lib/appwrite";
import { appwriteConfig } from "../../lib/appwrite";

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Get CSS filter string based on filter type and adjustments (same as in create.jsx)
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

// Generate video filter CSS with adjustments (same as in create.jsx)
const getVideoFilterCSS = (filterId, adjustmentsData = null) => {
  const baseFilterCSS = getFilterCSS(filterId, null);

  // Add video adjustments to filter CSS
  const adjustmentParts = [];

  if (adjustmentsData) {
    // Brightness, Lux, Highlights, and Shadows combined
    let brightnessValue = 1;
    if (adjustmentsData.brightness !== 0) {
      brightnessValue *= 1 + adjustmentsData.brightness / 200;
    }
    if (adjustmentsData.lux !== 0) {
      brightnessValue *= 1 + adjustmentsData.lux / 300;
    }
    // Highlights and Shadows - combine with brightness
    if (adjustmentsData.highlights !== 0) {
      brightnessValue *= 1 + (adjustmentsData.highlights / 300);
    }
    if (adjustmentsData.shadows !== 0) {
      brightnessValue *= 1 - (adjustmentsData.shadows / 400);
    }
    if (brightnessValue !== 1) {
      adjustmentParts.push(`brightness(${brightnessValue.toFixed(2)})`);
    }

    // Contrast and Structure combined
    let contrastValue = 1.0;
    if (adjustmentsData.contrast !== 0) {
      contrastValue = 0.5 + ((adjustmentsData.contrast + 100) / 200) * 1.0;
    }
    if (adjustmentsData.structure !== 0) {
      const structureValue =
        0.5 + ((adjustmentsData.structure + 100) / 200) * 1.0;
      contrastValue *= structureValue;
    }
    if (contrastValue !== 1.0) {
      adjustmentParts.push(`contrast(${contrastValue.toFixed(2)})`);
    }

    // Saturation
    if (adjustmentsData.saturation !== 0) {
      const saturation = 1 + adjustmentsData.saturation / 100;
      adjustmentParts.push(`saturate(${saturation.toFixed(2)})`);
    }

    // Warmth (hue-rotate)
    if (adjustmentsData.warmth !== 0) {
      const hue = (adjustmentsData.warmth / 100) * 30;
      adjustmentParts.push(`hue-rotate(${hue.toFixed(1)}deg)`);
    }

    // Fade (opacity + desaturate)
    if (adjustmentsData.fade !== 0) {
      const fade = adjustmentsData.fade / 100;
      adjustmentParts.push(`opacity(${(1 - fade * 0.3).toFixed(2)})`);
      adjustmentParts.push(`saturate(${(1 - fade * 0.3).toFixed(2)})`);
    }

  }

  // Combine base filter with adjustments
  const allParts = [];
  if (baseFilterCSS && baseFilterCSS !== "none") {
    allParts.push(baseFilterCSS);
  }
  if (adjustmentParts.length > 0) {
    allParts.push(adjustmentParts.join(" "));
  }

  return allParts.length > 0 ? allParts.join(" ") : "none";
};

const StrollVideoCard = ({ item, index, isVisible, onVideoStateChange, isHomeFocused, theme, isDarkMode }) => {
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
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [commentLikesModalVisible, setCommentLikesModalVisible] = useState(false);
  const [selectedCommentId, setSelectedCommentId] = useState(null);
  const [commentLikesList, setCommentLikesList] = useState([]);
  const [loadingCommentLikes, setLoadingCommentLikes] = useState(false);
  const [likesModalVisible, setLikesModalVisible] = useState(false);
  const [likesList, setLikesList] = useState([]);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [shareCount, setShareCount] = useState(item.shares || 0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showProfileHint, setShowProfileHint] = useState(false);
  const [creatorData, setCreatorData] = useState(null);
  const videoRef = useRef(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPosition, setSeekPosition] = useState(0);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const progressBarTimeoutRef = useRef(null);
  
  // Fetch creator data if creator is a string ID
  // Use a ref to track the creator ID we've already processed to prevent infinite loops
  const processedCreatorIdRef = useRef(null);
  // Track recent like actions to avoid overriding optimistic updates
  const recentLikeActionRef = useRef(false);
  
  // Get stable creator ID for dependency - extract just the ID string
  const creatorIdString = typeof item?.creator === 'object' && item?.creator !== null 
    ? item.creator.$id 
    : (typeof item?.creator === 'string' ? item.creator : null);
  
  useEffect(() => {
    const fetchCreator = async () => {
      if (!item?.creator || !creatorIdString) return;
      
      // If we've already processed this creator ID, skip
      if (processedCreatorIdRef.current === creatorIdString) {
        return;
      }
      
      // If creator is already an object, use it
      if (typeof item.creator === 'object' && item.creator !== null) {
        processedCreatorIdRef.current = creatorIdString;
        setCreatorData(item.creator);
        return;
      }
      
      // If creator is a string ID, fetch the user document
      if (typeof item.creator === 'string') {
        processedCreatorIdRef.current = creatorIdString;
        try {
          const userDoc = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            item.creator
          );
          setCreatorData(userDoc);
        } catch (error) {
          
          setCreatorData({ username: 'Unknown', avatar: images.profile, $id: item.creator });
        }
      }
    };
    
    fetchCreator();
  }, [creatorIdString]);
  
  // Use creatorData if available, otherwise fall back to item.creator
  const creator = creatorData || (typeof item.creator === 'object' ? item.creator : { username: 'Unknown', avatar: images.profile, $id: item.creator });

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

  // Sync liked state and likes count with item data when item changes
  // This ensures the state persists when scrolling away and coming back
  useEffect(() => {
    // Don't sync if we just made a like action (optimistic update)
    if (recentLikeActionRef.current) {
      recentLikeActionRef.current = false;
      return;
    }
    
    if (item.likes) {
      setLiked(item.likes.includes(user?.$id));
      setLikesCount(item.likes.length);
    } else {
      setLiked(false);
      setLikesCount(0);
    }
  }, [item.$id, user?.$id]);

  // Also sync when item becomes visible again (handles case where same item is shown with updated data)
  useEffect(() => {
    if (isVisible && !recentLikeActionRef.current) {
      if (item.likes) {
        setLiked(item.likes.includes(user?.$id));
        setLikesCount(item.likes.length);
      } else {
        setLiked(false);
        setLikesCount(0);
      }
    }
  }, [isVisible, item.$id, user?.$id]);

  // Check if current user is following the video/photo creator
  useEffect(() => {
    async function checkFollowStatus() {
      const creatorId = creator?.$id || (typeof item.creator === 'string' ? item.creator : item.creator?.$id);
      if (user?.$id && creatorId && user.$id !== creatorId) {
        // First check global state
        if (followStatus[creatorId] !== undefined) {
          setIsFollowing(followStatus[creatorId]);
        } else {
          // Fallback to database check
          try {
            const currentUser = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, user.$id);
            const following = currentUser.following || [];
            const isFollowingUser = following.includes(creatorId);
            setIsFollowing(isFollowingUser);
            // Update global state
            updateFollowStatus(creatorId, isFollowingUser);
          } catch (error) {
            
          }
        }
      } else {
        // Reset follow status if it's the same user or no user
        setIsFollowing(false);
      }
    }
    checkFollowStatus();
  }, [user?.$id, creator?.$id, item.creator, followStatus]);

  // Fetch comments when modal opens
  useEffect(() => {
    if (commentsModalVisible) {
      setLoadingComments(true);
      getComments(item.$id)
        .then((res) => {
          // getComments now returns structured comments with replies and likes
          setComments(res);
        })
        .catch((err) => {
          
          setComments([]);
        })
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

  // Reset video ready state when item changes
  useEffect(() => {
    setIsVideoReady(false);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
    setSeekPosition(0);
  }, [item.$id]);

  // Handle visibility changes and home focus
  useEffect(() => {
    if (isVisible && isHomeFocused) {
      setPlay(true);
      // Show progress bar briefly when video starts
      if (item.video && item.postType !== 'photo') {
        setShowProgressBar(true);
        if (progressBarTimeoutRef.current) {
          clearTimeout(progressBarTimeoutRef.current);
        }
        progressBarTimeoutRef.current = setTimeout(() => {
          setShowProgressBar(false);
        }, 3000);
      }
    } else {
      setPlay(false);
      setShowProgressBar(false);
    }
  }, [isVisible, isHomeFocused]);

  // Cleanup progress bar timeout on unmount
  useEffect(() => {
    return () => {
      if (progressBarTimeoutRef.current) {
        clearTimeout(progressBarTimeoutRef.current);
      }
    };
  }, []);

  const handleVideoPress = () => {
    setPlay((prev) => !prev);
    // Show progress bar when video is tapped
    if (item.video && item.postType !== 'photo') {
      setShowProgressBar(true);
      // Hide progress bar after 3 seconds
      if (progressBarTimeoutRef.current) {
        clearTimeout(progressBarTimeoutRef.current);
      }
      progressBarTimeoutRef.current = setTimeout(() => {
        setShowProgressBar(false);
      }, 3000);
    }
  };

  const handleSeekStart = () => {
    setIsSeeking(true);
  };

  const handleSeekChange = (position) => {
    if (playbackDuration > 0) {
      const newPosition = Math.floor((position / 100) * playbackDuration);
      setSeekPosition(newPosition);
    }
  };

  const handleSeekComplete = async (position) => {
    
   
    
    if (!videoRef.current) {
      
      setIsSeeking(false);
      return;
    }
    
    if (!isVideoReady) {
      
      setIsSeeking(false);
      return;
    }
    
    if (playbackDuration <= 0) {
    
      setIsSeeking(false);
      return;
    }

    try {
      const seekPositionMillis = Math.max(0, Math.floor((position / 100) * playbackDuration));
      
      
      // Perform the seek
      await videoRef.current.setPositionAsync(seekPositionMillis);
      
      // Update position state immediately for visual feedback
      setPlaybackPosition(seekPositionMillis);
      setSeekPosition(seekPositionMillis);
      
      // Ensure video continues playing after seek if it should be playing
      if (play) {
        try {
          await videoRef.current.playAsync();
        } catch (playError) {
          // Video might already be playing, ignore error
          
        }
      }
    } catch (error) {
      
      // On error, try to get current position and update state
      try {
        const status = await videoRef.current.getStatusAsync();
        if (status.isLoaded) {
          setPlaybackPosition(status.positionMillis || 0);
        }
      } catch (e) {
       
      }
    } finally {
      // Reset seeking state after a short delay to allow position update
      setTimeout(() => {
        setIsSeeking(false);
      }, 200);
    }
  };

  const formatTime = (milliseconds) => {
    if (!milliseconds || isNaN(milliseconds)) return '0:00';
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleLike = async () => {
    if (!user?.$id) return;
    // Mark that we just made a like action to prevent sync from overriding optimistic update
    recentLikeActionRef.current = true;
    setLiked((prev) => !prev);
    setLikesCount((prev) => (liked ? prev - 1 : prev + 1));
    try {
      await toggleLikePost(item.$id, user.$id);
      // Reset the flag after a short delay to allow future syncs
      setTimeout(() => {
        recentLikeActionRef.current = false;
      }, 1000);
    } catch {
      // On error, reset the flag immediately so state can sync
      recentLikeActionRef.current = false;
    }
  };

  const handleBookmark = async () => {
    if (!user?.$id) {
      Alert.alert(t("common.error"), t("alerts.loginToBookmark"));
      return;
    }

    try {
      const postData = {
        title: item.title,
        creator: creator?.username || (typeof item.creator === 'string' ? 'Unknown' : item.creator?.username || 'Unknown'),
        avatar: creator?.avatar || (typeof item.creator === 'string' ? images.profile : item.creator?.avatar || images.profile),
        thumbnail: item.thumbnail || (item.postType === 'photo' ? item.photo : null),
        video: item.video || (item.postType === 'photo' ? item.photo : null),
        videoId: item.$id,
        postType: item.postType || 'video'
      };

      const newBookmarkStatus = await toggleBookmark(user.$id, item.$id, postData);
      setBookmarked(newBookmarkStatus);
    } catch (error) {
      
      Alert.alert(t("common.error"), t("alerts.bookmarkFailed"));
    }
  };

  const handleShare = async () => {
    try {
      const shareUrl = item.postType === 'photo' ? (item.photo && typeof item.photo === 'string' ? item.photo : '') : item.video;
      const shareType = item.postType === 'photo' ? 'photo' : 'video';
      const creatorName = creator?.username || (typeof item.creator === 'string' ? 'Unknown' : item.creator?.username || 'Unknown');
      
      if (!shareUrl || (typeof shareUrl !== 'string')) {
        Alert.alert(t("common.error"), "Cannot share: Invalid URL");
        return;
      }
      
      const result = await Share.share({
        message: `Check out this ${shareType}: ${item.title} by ${creatorName}\n${shareUrl}`,
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
    const creatorId = creator?.$id || (typeof item.creator === 'string' ? item.creator : item.creator?.$id);
    if (creatorId && creatorId !== user?.$id) {
      router.push(`/profile/${creatorId}`);
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
    const creatorId = creator?.$id || (typeof item.creator === 'string' ? item.creator : item.creator?.$id);
    if (!user?.$id || !creatorId || user.$id === creatorId) return;
    
    // Immediate visual feedback - no loading state
    const newFollowState = !isFollowing;
    setIsFollowing(newFollowState);
    updateFollowStatus(creatorId, newFollowState);
    
    try {
      await toggleFollowUser(user.$id, creatorId);
      
      // Show success message
      const action = newFollowState ? 'followed' : 'unfollowed';
      
    } catch (error) {
      
      Alert.alert(t("common.error"), t("alerts.followFailed"));
      // Revert the state change on error
      setIsFollowing(!newFollowState);
      updateFollowStatus(creatorId, !newFollowState);
    }
  };

  const handleCommentPress = () => {
    setCommentsModalVisible(true);
  };

  const handleAddComment = async () => {
    if (!newComment.trim() || !user?.$id) return;
    setPosting(true);
    try {
      await addComment(item.$id, user.$id, newComment.trim());
      // Refresh comments to get structured data with likes
      const updatedComments = await getComments(item.$id);
      setComments(updatedComments);
      setNewComment("");
      setCommentsCount((prev) => prev + 1);
    } catch (error) {
      
    } finally {
      setPosting(false);
    }
  };

  const handleAddReply = async (parentCommentId) => {
    if (!replyText.trim() || !user?.$id) return;
    setPostingReply(true);
    try {
      await addComment(item.$id, user.$id, replyText.trim(), parentCommentId);
      // Refresh comments to get structured data
      const updatedComments = await getComments(item.$id);
      setComments(updatedComments);
      setReplyText("");
      setReplyingTo(null);
    } catch (error) {
    } finally {
      setPostingReply(false);
    }
  };

  const handleLikeComment = async (commentId, currentLikes) => {
    if (!user?.$id) return;
    const isLiked = Array.isArray(currentLikes) ? currentLikes.includes(user.$id) : false;
    const newLikedState = !isLiked;
    
    // Optimistic update
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.$id === commentId) {
          const currentLikesArray = Array.isArray(comment.likes) ? comment.likes : [];
          const updatedLikes = newLikedState
            ? [...currentLikesArray, user.$id]
            : currentLikesArray.filter((id) => id !== user.$id);
          return { ...comment, likes: updatedLikes };
        }
        // Also update in replies
        if (comment.replies && Array.isArray(comment.replies)) {
          const updatedReplies = comment.replies.map((reply) => {
            if (reply.$id === commentId) {
              const replyLikesArray = Array.isArray(reply.likes) ? reply.likes : [];
              const updatedLikes = newLikedState
                ? [...replyLikesArray, user.$id]
                : replyLikesArray.filter((id) => id !== user.$id);
              return { ...reply, likes: updatedLikes };
            }
            return reply;
          });
          return { ...comment, replies: updatedReplies };
        }
        return comment;
      })
    );
    
    try {
      await toggleLikeComment(commentId, user.$id);
    } catch (error) {
      // Revert on error
      const updatedComments = await getComments(item.$id);
      setComments(updatedComments);
    }
  };

  const handleShowCommentLikes = async (commentId, commentAuthorId) => {
    // Only show likes modal if current user is the comment author
    if (user?.$id !== commentAuthorId) {
      return;
    }
    
    setSelectedCommentId(commentId);
    setCommentLikesModalVisible(true);
    setLoadingCommentLikes(true);
    
    try {
      const userIds = await getCommentLikes(commentId);
      // Fetch user info for each userId
      const users = await Promise.all(
        userIds.map(async (uid) => {
          try {
            const u = await databases.getDocument(
              appwriteConfig.databaseId,
              appwriteConfig.userCollectionId,
              uid
            );
            return { $id: u.$id, username: u.username, avatar: u.avatar };
          } catch {
            return { $id: uid, username: "Unknown", avatar: images.profile };
          }
        })
      );
      setCommentLikesList(users);
    } catch (error) {
      setCommentLikesList([]);
    } finally {
      setLoadingCommentLikes(false);
    }
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

  const themedColor = useCallback(
    (darkColor, lightColor) => (isDarkMode ? darkColor : lightColor),
    [isDarkMode]
  );

  return (
    <View style={{ 
      height: SCREEN_HEIGHT, 
      backgroundColor: themedColor('#000', theme.background), 
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
                // Only open profile if it's not the current user's video/photo
                const creatorId = creator?.$id || (typeof item.creator === 'string' ? item.creator : item.creator?.$id);
                if (creatorId && creatorId !== user?.$id) {
                  // Show hint briefly before opening profile
                  setShowProfileHint(true);
                  
                  // Navigate to profile
                  router.push(`/profile/${creatorId}`);
                  
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
            width: '50%', // Only contain left half of the video
            bottom: 0, 
            zIndex: 15 
          }}>
            
           </View>
        </PanGestureHandler>
      
      {/* Video/Photo Background */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={handleVideoPress}
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          top: 0,
          left: 0,
          backgroundColor: themedColor('#000', theme.surface),
        }}
      >
        {item.postType === 'photo' && item.photo && typeof item.photo === 'string' && item.photo.trim() !== '' ? (
          (() => {
            // Get filter and adjustments from item
            const filterId = item.filter || 'none';
            let adjustments = null;
            let textOverlays = [];
            let imageOverlays = [];
            
            if (item.edits) {
              try {
                const edits = typeof item.edits === 'string' ? JSON.parse(item.edits) : item.edits;
                
                // Handle both compressed and uncompressed formats for backward compatibility
                if (edits.a !== undefined || edits.t !== undefined || edits.i !== undefined) {
                  // Compressed format
                  adjustments = edits.a || null;
                  textOverlays = (edits.t || []).map(overlay => ({
                    text: overlay.txt,
                    style: {
                      fontSize: overlay.stl?.fs,
                      fontFamily: overlay.stl?.ff,
                      color: overlay.stl?.c,
                      backgroundColor: overlay.stl?.bc,
                      alignment: overlay.stl?.al,
                      textStyle: overlay.stl?.ts
                    },
                    x: overlay.x,
                    y: overlay.y,
                    id: overlay.id
                  }));
                  imageOverlays = (edits.i || []).map(overlay => ({
                    uri: overlay.u,
                    x: overlay.x,
                    y: overlay.y,
                    width: overlay.w,
                    height: overlay.h,
                    rotation: overlay.r
                  }));
                } else {
                  // Legacy uncompressed format
                  adjustments = edits.adjustments || null;
                  textOverlays = edits.textOverlays || [];
                  imageOverlays = edits.imageOverlays || [];
                }
              } catch (e) {
                // Silently handle parse errors
              }
            }
            
            const filterCSS = getFilterCSS(filterId, adjustments);
            const hasOverlays = textOverlays.length > 0 || imageOverlays.length > 0;
            
            // Use WebView if there are filters or overlays
            if (filterCSS !== 'none' || hasOverlays) {
              const photoUri = String(item.photo);
              // Create stable key based on photo URI, filter, and overlays to prevent unnecessary re-renders
              const overlayKey = `${textOverlays.length}-${imageOverlays.length}-${JSON.stringify(textOverlays).length}-${JSON.stringify(imageOverlays).length}`;
              const webViewKey = `photo-${item.$id || photoUri}-${filterCSS}-${overlayKey}`;
              
              return (
                <View style={{ width: '100%', height: '100%' }}>
                  <WebView
                    key={webViewKey}
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
                              html {
                                width: 100%;
                                height: 100%;
                              }
                              body {
                                width: 100%;
                                height: 100%;
                                overflow: hidden;
                                position: relative;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                margin: 0;
                                padding: 0;
                              }
                              img {
                                max-width: 100%;
                                max-height: 100%;
                                width: auto;
                                height: auto;
                                object-fit: contain;
                                filter: ${filterCSS};
                                display: block;
                              }
                              ${textOverlays.map((overlay, index) => {
                                const textStyle = overlay.style || {};
                                const alignment = textStyle.alignment || 'center';
                                
                                // Use x/y from overlay if set, otherwise use alignment-based positioning
                                let leftPos, transformValue;
                                if (overlay.x !== undefined && overlay.y !== undefined) {
                                  // Dragged position - use center transform
                                  leftPos = overlay.x + '%';
                                  transformValue = 'translate(-50%, -50%)';
                                } else {
                                  // Initial position based on alignment
                                  if (alignment === 'left') {
                                    leftPos = '5%';
                                    transformValue = 'translateY(-50%)';
                                  } else if (alignment === 'right') {
                                    leftPos = '95%';
                                    transformValue = 'translate(-100%, -50%)';
                                  } else {
                                    // center
                                    leftPos = '50%';
                                    transformValue = 'translate(-50%, -50%)';
                                  }
                                }
                                
                                const hasBackgroundColor = textStyle.backgroundColor && 
                                  textStyle.backgroundColor !== 'transparent' && 
                                  textStyle.backgroundColor !== '' && 
                                  textStyle.backgroundColor !== null && 
                                  textStyle.backgroundColor !== undefined;
                                const isGradient = textStyle.textStyle === 'gradient';
                                
                                let containerCSS = `
                                  position: absolute;
                                  top: ${overlay.y !== undefined ? overlay.y : 50}%;
                                  left: ${leftPos};
                                  transform: ${transformValue};
                                  font-size: ${textStyle.fontSize || 24}px;
                                  font-family: '${textStyle.fontFamily || 'Poppins-Bold'}', sans-serif;
                                  text-align: ${alignment};
                                  white-space: nowrap;
                                  z-index: ${index + 1};
                                  pointer-events: none;
                                  user-select: none;
                                `;
                                
                                let textInnerCSS = `
                                  color: ${textStyle.color || '#FFFFFF'};
                                `;
                                
                                if (hasBackgroundColor) {
                                  containerCSS += `background-color: ${textStyle.backgroundColor}; padding: 4px 8px; border-radius: 4px;`;
                                }
                                
                                if (textStyle.textStyle === 'outline') {
                                  textInnerCSS += `-webkit-text-stroke: 2px ${textStyle.color || '#FFFFFF'}; -webkit-text-fill-color: transparent;`;
                                } else if (textStyle.textStyle === 'shadow') {
                                  textInnerCSS += `text-shadow: 2px 2px 4px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.8);`;
                                } else if (textStyle.textStyle === 'neon') {
                                  textInnerCSS += `text-shadow: 0 0 5px ${textStyle.color || '#FFFFFF'}, 0 0 10px ${textStyle.color || '#FFFFFF'}, 0 0 15px ${textStyle.color || '#FFFFFF'};`;
                                } else if (isGradient) {
                                  textInnerCSS += `background: linear-gradient(45deg, ${textStyle.color || '#FFFFFF'}, #FF6B6B); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;`;
                                }
                                
                                return `.text-overlay-${index} { ${containerCSS} } .text-overlay-${index} span { ${textInnerCSS} }`;
                              }).join('\n')}
                              ${imageOverlays.map((overlay, index) => {
                                return `.image-overlay-${index} {
                                  position: absolute;
                                  top: ${overlay.y}%;
                                  left: ${overlay.x}%;
                                  width: ${overlay.width}%;
                                  height: ${overlay.height}%;
                                  transform: translate(-50%, -50%) rotate(${overlay.rotation}deg);
                                  z-index: ${100 + index};
                                  pointer-events: none;
                                }`;
                              }).join('\n')}
                            </style>
                          </head>
                          <body>
                            <img src="${photoUri}" alt="Photo with overlays" />
                            ${textOverlays.map((overlay, index) => 
                              `<div class="text-overlay-${index}"><span>${overlay.text}</span></div>`
                            ).join('')}
                            ${imageOverlays.map((overlay, index) => 
                              `<img src="${overlay.uri}" class="image-overlay-${index}" alt="Overlay ${index}" />`
                            ).join('')}
                          </body>
                        </html>
                      `
                    }}
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    javaScriptEnabled={false}
                    domStorageEnabled={false}
                    onError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent;
                    }}
                  />
                </View>
              );
            }
            
            // No filter or overlays, use regular Image
            return (
              <Image
                source={{ uri: String(item.photo) }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                onError={(error) => {
                }}
              />
            );
          })()
        ) : item.video ? (
          (() => {
            // Get filter and video adjustments from item
            const filterId = item.filter || 'none';
            let videoAdjustments = null;
            
            if (item.edits) {
              try {
                const edits = typeof item.edits === 'string' ? JSON.parse(item.edits) : item.edits;
                // Get video adjustments from edits
                if (edits.adjustments) {
                  videoAdjustments = edits.adjustments;
                }
              } catch (e) {
                // Silently handle parse errors
              }
            }
            
            const videoFilterCSS = getVideoFilterCSS(filterId, videoAdjustments);
            const videoUrl = getIOSCompatibleVideoUrl(item.video) || item.video;
            
           
            
            // Use WebView if there are filters or adjustments to apply CSS filters
            if (videoFilterCSS !== 'none') {
              return (
                <View style={{ width: '100%', height: '100%' }}>
                  <WebView
                    key={`video-${item.$id || videoUrl}-${videoFilterCSS}`}
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
                                position: relative;
                                background: #000;
                              }
                              video {
                                width: 100%;
                                height: 100%;
                                object-fit: contain;
                                filter: ${videoFilterCSS};
                              }
                            </style>
                          </head>
                          <body>
                            <video 
                              src="${videoUrl}" 
                              autoplay 
                              loop 
                              muted
                              playsinline
                              webkit-playsinline
                            ></video>
                          </body>
                        </html>
                      `
                    }}
                    style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                    scrollEnabled={false}
                    showsVerticalScrollIndicator={false}
                    showsHorizontalScrollIndicator={false}
                    javaScriptEnabled={true}
                    domStorageEnabled={false}
                    mediaPlaybackRequiresUserAction={false}
                    allowsInlineMediaPlayback={true}
                    onError={(syntheticEvent) => {
                      const { nativeEvent } = syntheticEvent;
                    }}
                  />
                </View>
              );
            }
            
            // No filters/adjustments, use regular Video component
            return (
              <Video
                ref={videoRef}
                source={{ 
                  uri: videoUrl
                }}
                style={{ width: '100%', height: '100%' }}
                resizeMode={ResizeMode.contain}
                shouldPlay={play}
                isLooping={true}
                isMuted={false}
                useNativeControls={false}
                onError={(error) => {
                }}
                onLoad={(status) => {
                  if (status.isLoaded) {
                    setPlaybackDuration(status.durationMillis || 0);
                    setIsVideoReady(true);
                  }
                }}
                onPlaybackStatusUpdate={(status) => {
                  if (status.isLoaded && !isSeeking) {
                    setPlaybackPosition(status.positionMillis || 0);
                    if (status.durationMillis) {
                      setPlaybackDuration(status.durationMillis);
                    }
                  }
                }}
                {...(Platform.OS === 'ios' && {
                  allowsExternalPlayback: false,
                  playInSilentModeIOS: true,
                  ignoreSilentSwitch: 'ignore'
                })}
              />
            );
          })()
        ) : (
          <View
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: themedColor('#333', theme.surfaceMuted),
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.textPrimary, fontSize: 16 }}>{t("home.noVideoAvailable")}</Text>
          </View>
        )}
        {!play && item.video && item.postType !== 'photo' && (
          <View style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -24 }, { translateY: -24 }] }}>
            <Image source={icons.play} style={{ width: 48, height: 48 }} resizeMode="contain" />
          </View>
        )}
      </TouchableOpacity>

      {/* Progress Bar - Only show for native Video component (not WebView) - Outside TouchableOpacity to receive touches */}
      {showProgressBar && item.video && item.postType !== 'photo' && playbackDuration > 0 && isVideoReady && (
        <View
          style={{
            position: 'absolute',
            bottom: 90,
            left: 0,
            right: 0,
            paddingHorizontal: 15,
            paddingBottom: 20,
            paddingTop: 10,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 30,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
            <Text style={{ color: '#fff', fontSize: 12, marginRight: 10, minWidth: 40 }}>
              {formatTime(isSeeking ? seekPosition : playbackPosition)}
            </Text>
            <View style={{ flex: 1 }}>
              <Slider
                style={{ width: '100%', height: 40 }}
                minimumValue={0}
                maximumValue={100}
                value={playbackDuration > 0 ? (isSeeking ? (seekPosition / playbackDuration) * 100 : (playbackPosition / playbackDuration) * 100) : 0}
                onValueChange={handleSeekChange}
                onSlidingStart={handleSeekStart}
                onSlidingComplete={handleSeekComplete}
                minimumTrackTintColor="#fff"
                maximumTrackTintColor="rgba(255, 255, 255, 0.3)"
                thumbTintColor="#fff"
                step={0.1}
                disabled={!isVideoReady || playbackDuration <= 0}
              />
            </View>
            <Text style={{ color: '#fff', fontSize: 12, marginLeft: 10, minWidth: 40 }}>
              {formatTime(playbackDuration)}
            </Text>
          </View>
        </View>
      )}



      {/* Right Side Interaction Buttons */}
      <View style={{ position: 'absolute', right: 15, bottom: 150, zIndex: 20 }}>
        {/* Profile Picture */}
        <TouchableOpacity onPress={handleProfilePress} style={{ marginBottom: 20, alignItems: 'center' }}>
          <View style={{ position: 'relative' }}>
            <Image
              source={creator?.avatar && typeof creator.avatar === 'string' ? { uri: creator.avatar } : images.profile}
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                borderWidth: 2,
                borderColor: themedColor('#fff', theme.border),
              }}
              resizeMode="contain"
            />
                         {/* Follow/Following Icon */}
             {user?.$id !== (creator?.$id || (typeof item.creator === 'string' ? item.creator : item.creator?.$id)) && (
               <TouchableOpacity 
                 onPress={handleFollowPress}
                 style={{ 
                   position: 'absolute', 
                   bottom: -2, 
                   right: -2, 
                   backgroundColor: isFollowing ? theme.success : '#007AFF', 
                   width: 24, 
                   height: 24, 
                   borderRadius: 12, 
                   justifyContent: 'center', 
                   alignItems: 'center',
                   borderWidth: 2,
                   borderColor: themedColor('#fff', theme.border),
                   shadowColor: themedColor('#000', '#CBD5F5'),
                   shadowOffset: { width: 0, height: 2 },
                   shadowOpacity: 0.3,
                   shadowRadius: 4,
                   elevation: 4
                 }}
               >
                 <Text style={{ color: themedColor('#fff', '#FFFFFF'), fontSize: 12, fontWeight: 'bold' }}>
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
            {bookmarked ? t("home.saved") : t("home.save")}
          </Text>
        </TouchableOpacity>

        {/* Share Button */}
        <TouchableOpacity onPress={handleShare} style={{ marginBottom: 20, alignItems: 'center' }}>
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
           
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
          <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{formatCount(shareCount)}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Left Video/Photo Information */}
      <View style={{ position: 'absolute', bottom: 100, left: 15, right: 80, zIndex: 20 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>
          {creator?.username || (typeof item.creator === 'string' ? 'Unknown' : item.creator?.username || 'Unknown')}
        </Text>
        <Text style={{ color: theme.textPrimary, fontSize: 14, marginBottom: 8 }}>
          {item.title} ♫ ✨
        </Text>
        {/* Link Display */}
        {item.link && item.link.trim() !== '' && (
          <TouchableOpacity
            onPress={async () => {
              try {
                const url = item.link.startsWith('http://') || item.link.startsWith('https://') 
                  ? item.link 
                  : `https://${item.link}`;
                const canOpen = await Linking.canOpenURL(url);
                if (canOpen) {
                  await Linking.openURL(url);
                } else {
                  Alert.alert('Error', 'Cannot open this link');
                }
              } catch (error) {
                Alert.alert('Error', 'Failed to open link');
              }
            }}
            style={{
              backgroundColor: theme.accent,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              marginBottom: 8,
              alignSelf: 'flex-start',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              🔗 Open Link
            </Text>
          </TouchableOpacity>
        )}
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>
          …
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: theme.textPrimary, fontSize: 12, marginRight: 5 }}>♫</Text>
          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
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
          <View
            style={{
              backgroundColor: themedColor('#22223b', theme.surface),
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
                  backgroundColor: themedColor('#444', theme.border),
                  borderRadius: 2,
                  marginBottom: 4,
                }}
              />
              <Text style={{ color: themedColor('#fff', theme.textPrimary), fontSize: 18, fontWeight: 'bold' }}>
                {t("home.commentsTitle")}
              </Text>
            </View>
            {loadingComments ? (
              <ActivityIndicator color="#a77df8" size="large" style={{ marginVertical: 24 }} />
            ) : (
              <FlatList
                data={[...comments].reverse()} // Newest at bottom
                keyExtractor={c => c.$id}
                renderItem={({ item: c }) => {
                  const commentLikes = Array.isArray(c.likes) ? c.likes : [];
                  const isLiked = commentLikes.includes(user?.$id);
                  const isCommentAuthor = c.userId === user?.$id;
                  
                  return (
                    <View style={{ marginBottom: 16, paddingHorizontal: 16 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                        <Image
                          source={c.avatar && typeof c.avatar === 'string' ? { uri: c.avatar } : images.profile}
                          style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: themedColor('#a77df8', theme.accent), fontWeight: 'bold', fontSize: 15 }}>
                            {c.username || c.userId}
                          </Text>
                          <Text style={{ color: themedColor('#fff', theme.textPrimary), fontSize: 16 }}>{c.content}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                            <Text style={{ color: themedColor('#aaa', theme.textMuted), fontSize: 11, marginRight: 12 }}>
                              {new Date(c.createdAt).toLocaleString()}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleLikeComment(c.$id, commentLikes)}
                              style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}
                            >
                              <Image
                                source={isLiked ? icons.heartCheck : icons.heartUncheck}
                                style={{ width: 20, height: 20, marginRight: 4 }}
                                resizeMode="contain"
                              />
                              <Text style={{ color: themedColor('#aaa', theme.textMuted), fontSize: 12 }}>
                                {commentLikes.length}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setReplyingTo(c.$id);
                                setReplyText("");
                              }}
                              style={{ marginRight: 16 }}
                            >
                              <Text style={{ color: theme.accent, fontSize: 12 }}>
                                Reply
                              </Text>
                            </TouchableOpacity>
                            {isCommentAuthor && commentLikes.length > 0 && (
                              <TouchableOpacity
                                onPress={() => handleShowCommentLikes(c.$id, c.userId)}
                              >
                                <Text style={{ color: themedColor('#aaa', theme.textMuted), fontSize: 12 }}>
                                  View {commentLikes.length} {commentLikes.length === 1 ? 'like' : 'likes'}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          
                          {/* Reply input */}
                          {replyingTo === c.$id && (
                            <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center' }}>
                              <Image
                                source={{ uri: user?.avatar || images.profile }}
                                style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                              />
                              <TextInput
                                value={replyText}
                                onChangeText={setReplyText}
                                placeholder="Write a reply..."
                                placeholderTextColor={themedColor('#aaa', theme.textMuted)}
                                style={{
                                  flex: 1,
                                  backgroundColor: themedColor('#333', theme.inputBackground),
                                  color: themedColor('#fff', theme.textPrimary),
                                  borderRadius: 16,
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  fontSize: 13,
                                }}
                              />
                              <TouchableOpacity
                                onPress={() => handleAddReply(c.$id)}
                                disabled={postingReply || !replyText.trim()}
                                style={{
                                  marginLeft: 8,
                                  paddingHorizontal: 12,
                                  paddingVertical: 6,
                                  backgroundColor: postingReply ? themedColor('#888', theme.border) : theme.accent,
                                  borderRadius: 16,
                                }}
                              >
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                                  {postingReply ? '...' : 'Send'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  setReplyingTo(null);
                                  setReplyText("");
                                }}
                                style={{ marginLeft: 8 }}
                              >
                                <Text style={{ color: themedColor('#aaa', theme.textMuted), fontSize: 12 }}>Cancel</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                          
                          {/* Nested replies */}
                          {c.replies && c.replies.length > 0 && (
                            <View style={{ marginTop: 12, marginLeft: 20, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: theme.border }}>
                              {c.replies.map((reply) => {
                                const replyLikes = Array.isArray(reply.likes) ? reply.likes : [];
                                const isReplyLiked = replyLikes.includes(user?.$id);
                                const isReplyAuthor = reply.userId === user?.$id;
                                
                                return (
                                  <View key={reply.$id} style={{ marginBottom: 12 }}>
                                    <View style={{ flexDirection: 'row' }}>
                                      <Image
                                        source={{ uri: reply.avatar || images.profile }}
                                        style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }}
                                      />
                                      <View style={{ flex: 1 }}>
                                        <Text style={{ color: themedColor('#a77df8', theme.accent), fontWeight: '600', fontSize: 13 }}>
                                          {reply.username || reply.userId}
                                        </Text>
                                        <Text style={{ color: themedColor('#fff', theme.textPrimary), fontSize: 13, marginVertical: 2 }}>
                                          {reply.content}
                                        </Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                          <Text style={{ color: themedColor('#aaa', theme.textMuted), fontSize: 10, marginRight: 12 }}>
                                            {new Date(reply.createdAt).toLocaleString()}
                                          </Text>
                                          <TouchableOpacity
                                            onPress={() => handleLikeComment(reply.$id, replyLikes)}
                                            style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}
                                          >
                                            <Image
                                              source={isReplyLiked ? icons.heartCheck : icons.heartUncheck}
                                              style={{ width: 48, height: 48, marginRight: 4 }}
                                              resizeMode="contain"
                                            />
                                            <Text style={{ color: themedColor('#aaa', theme.textMuted), fontSize: 11 }}>
                                              {replyLikes.length}
                                            </Text>
                                          </TouchableOpacity>
                                          {isReplyAuthor && replyLikes.length > 0 && (
                                            <TouchableOpacity
                                              onPress={() => handleShowCommentLikes(reply.$id, reply.userId)}
                                            >
                                              <Text style={{ color: themedColor('#aaa', theme.textMuted), fontSize: 10 }}>
                                                View {replyLikes.length} {replyLikes.length === 1 ? 'like' : 'likes'}
                                              </Text>
                                            </TouchableOpacity>
                                          )}
                                        </View>
                                      </View>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                }}
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
                backgroundColor: themedColor('#22223b', theme.surface),
                borderTopWidth: 1,
                borderColor: theme.border,
              }}
            >
              <TextInput
                value={newComment}
                onChangeText={setNewComment}
                placeholder={t("home.commentPlaceholder")}
                placeholderTextColor={theme.inputPlaceholder}
                style={{
                  flex: 1,
                  backgroundColor: themedColor('#333', theme.inputBackground),
                  color: themedColor('#fff', theme.textPrimary),
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 16,
                  textAlign: isRTL ? 'right' : 'left',
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
                  backgroundColor: posting ? themedColor('#888', theme.border) : theme.accent,
                  borderRadius: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: themedColor('#fff', '#FFFFFF'), fontWeight: 'bold', fontSize: 16 }}>
                  {posting ? '...' : t("home.post")}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setCommentsModalVisible(false)}
              style={{
                alignSelf: 'center',
                backgroundColor: themedColor('#444', theme.card),
                paddingHorizontal: 32,
                paddingVertical: 10,
                borderRadius: 8,
                marginBottom: 12,
                marginTop: 2,
              }}
            >
              <Text style={{ color: themedColor('#fff', theme.textPrimary), fontWeight: 'bold', fontSize: 15 }}>
                {t("home.close")}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Comment Likes Modal */}
      <Modal
        visible={commentLikesModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCommentLikesModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: themedColor("#1c1c2e", theme.surface),
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              maxHeight: "80%",
              paddingTop: 20,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 20,
                paddingBottom: 16,
                borderBottomWidth: 0.5,
                borderBottomColor: theme.border,
              }}
            >
              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 18,
                  fontWeight: "600",
                }}
              >
                People who liked this comment
              </Text>
              <TouchableOpacity onPress={() => setCommentLikesModalVisible(false)}>
                <Text style={{ color: theme.accent, fontSize: 16, fontWeight: "600" }}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>

            {loadingCommentLikes ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <ActivityIndicator color={theme.accent} size="large" />
              </View>
            ) : commentLikesList.length === 0 ? (
              <View style={{ padding: 40, alignItems: "center" }}>
                <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                  No likes yet
                </Text>
              </View>
            ) : (
              <FlatList
                data={commentLikesList}
                keyExtractor={(item) => item.$id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.border,
                    }}
                    onPress={() => {
                      setCommentLikesModalVisible(false);
                      router.push(`/profile/${item.$id}`);
                    }}
                  >
                    <Image
                      source={{ uri: item.avatar || images.profile }}
                      style={{ width: 48, height: 48, borderRadius: 24, marginRight: 12 }}
                    />
                    <Text
                      style={{
                        color: theme.textPrimary,
                        fontSize: 16,
                        fontWeight: "500",
                      }}
                    >
                      {item.username || "Unknown"}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
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
              backgroundColor: themedColor('#22223b', theme.surface),
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              width: '100%',
              maxHeight: '70%',
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <View
                style={{
                  width: 40,
                  height: 4,
                  backgroundColor: themedColor('#444', theme.border),
                  borderRadius: 2,
                  marginBottom: 4,
                }}
              />
              <Text style={{ color: themedColor('#fff', theme.textPrimary), fontSize: 18, fontWeight: 'bold' }}>
                {t("home.likesTitle")}
              </Text>
            </View>
            {loadingLikes ? (
              <ActivityIndicator color="#a77df8" size="large" style={{ marginVertical: 24 }} />
            ) : likesList.length === 0 ? (
              <Text style={{ color: themedColor('#fff', theme.textSecondary), textAlign: 'center', marginVertical: 24 }}>
                {t("home.likesEmpty")}
              </Text>
            ) : (
              <FlatList
                data={likesList}
                keyExtractor={u => u.$id}
                renderItem={({ item: u }) => (
                  <TouchableOpacity onPress={() => handleUserPress(u.$id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 18 }}>
                    <Image source={u.avatar && typeof u.avatar === 'string' ? { uri: u.avatar } : images.profile} style={{ width: 38, height: 38, borderRadius: 19, marginRight: 12 }} />
                    <Text style={{ color: themedColor('#fff', theme.textPrimary), fontSize: 16, fontWeight: '600' }}>{u.username}</Text>
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
                backgroundColor: themedColor('#444', theme.card),
                paddingHorizontal: 32,
                paddingVertical: 10,
                borderRadius: 8,
                marginBottom: 12,
                marginTop: 2,
              }}
            >
              <Text style={{ color: themedColor('#fff', theme.textPrimary), fontWeight: 'bold', fontSize: 15 }}>
                {t("home.close")}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const Home = () => {
  const { user, isRTL, theme, isDarkMode } = useGlobalContext();
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
  const flatListRef = useRef(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  
  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );
  
  // Get posts based on selected tab
  const { data: forYouPosts, refetch: refetchForYou } = useAppwrite(getAllPosts, []);
  const { data: forYouPhotos, refetch: refetchForYouPhotos } = useAppwrite(getAllPhotoPosts, []);
  const { data: followingPosts, refetch: refetchFollowing } = useAppwrite(
    () => user?.$id ? getFollowingPosts(user.$id) : Promise.resolve([]),
    [user?.$id]
  );
  
  // Get latest posts for trending section
  const { data: latestPosts, refetch: refetchLatestPosts } = useAppwrite(getLatestPosts, []);
  const { data: latestPhotos, refetch: refetchLatestPhotos } = useAppwrite(getLatestPhotoPosts, []);
  
  // Get active advertisements
  const { data: activeAds, refetch: refetchAds } = useAppwrite(getActiveAdvertisements, []);
  
  // Combine videos and photos into single feed, sorted by date
  const combinedForYouPosts = useMemo(() => {
    const allPosts = [
      ...(forYouPosts || []).map(post => ({ ...post, postType: 'video' })),
      ...(forYouPhotos || []).map(post => ({ ...post, postType: 'photo' }))
    ];
    // Sort by creation date (newest first)
    return allPosts.sort((a, b) => {
      const dateA = new Date(a.$createdAt || 0);
      const dateB = new Date(b.$createdAt || 0);
      return dateB - dateA;
    });
  }, [forYouPosts, forYouPhotos]);
  
  // Combine latest videos and photos for trending
  const combinedLatestPosts = useMemo(() => {
    const allPosts = [
      ...(latestPosts || []).map(post => ({ ...post, postType: 'video' })),
      ...(latestPhotos || []).map(post => ({ ...post, postType: 'photo' }))
    ];
    // Sort by creation date (newest first)
    return allPosts.sort((a, b) => {
      const dateA = new Date(a.$createdAt || 0);
      const dateB = new Date(b.$createdAt || 0);
      return dateB - dateA;
    });
  }, [latestPosts, latestPhotos]);
  
  const [trendingCreators, setTrendingCreators] = useState({});
  const fetchedTrendingCreatorIds = useRef(new Set());
  const fetchingRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    
    const fetchCreators = async () => {
      // Prevent multiple simultaneous fetches
      if (fetchingRef.current) return;
      
      if (!combinedLatestPosts || combinedLatestPosts.length === 0) {
        setTrendingCreators({});
        fetchedTrendingCreatorIds.current.clear();
        return;
      }
      
      fetchingRef.current = true;
      
      // Process all posts to extract creator IDs and objects
      const missingIds = [];
      const creatorObjects = {};
      
      combinedLatestPosts.forEach((post) => {
        if (!post?.creator) return;
        
        // If creator is already an object, store it directly
        if (typeof post.creator === "object" && post.creator !== null && post.creator.$id) {
          const creatorId = post.creator.$id;
          if (creatorId && !creatorObjects[creatorId]) {
            creatorObjects[creatorId] = post.creator;
          }
        } 
        // If creator is a string ID, check if we need to fetch it
        else if (typeof post.creator === "string" && post.creator.trim() !== '') {
          const creatorId = post.creator.trim();
          // Only fetch if not already in state
          // Check both the ref (attempted) and actual state (successful)
          const alreadyFetched = fetchedTrendingCreatorIds.current.has(creatorId);
          const inState = trendingCreators[creatorId];
          
          // Only add if not attempted yet OR if attempted but not in state (failed fetch)
          if (!alreadyFetched || (alreadyFetched && !inState)) {
            if (!missingIds.includes(creatorId)) {
              missingIds.push(creatorId);
            }
          }
        }
      });

      // First, add any creator objects we found directly
      if (Object.keys(creatorObjects).length > 0) {
        setTrendingCreators((prev) => {
          const updated = { ...prev };
          Object.keys(creatorObjects).forEach((creatorId) => {
            if (creatorId && creatorObjects[creatorId]) {
              updated[creatorId] = creatorObjects[creatorId];
              fetchedTrendingCreatorIds.current.add(creatorId);
            }
          });
          return updated;
        });
      }

      // Then fetch missing creator IDs
      if (missingIds.length === 0) {
        fetchingRef.current = false;
        return;
      }

      // Mark IDs as being fetched to prevent duplicate requests
      missingIds.forEach((id) => fetchedTrendingCreatorIds.current.add(id));

      try {
        const results = await Promise.all(
          missingIds.map(async (creatorId) => {
            try {
              const userDoc = await databases.getDocument(
                appwriteConfig.databaseId,
                appwriteConfig.userCollectionId,
                creatorId
              );
              if (userDoc && userDoc.$id) {
                return { creatorId, data: userDoc };
              }
              return { creatorId, data: null };
            } catch (error) {
              // Remove from fetched set if fetch failed so we can retry later
              fetchedTrendingCreatorIds.current.delete(creatorId);
              return { creatorId, data: null };
            }
          })
        );

        if (!isMounted) {
          fetchingRef.current = false;
          return;
        }

        setTrendingCreators((prev) => {
          const updated = { ...prev };
          results.forEach(({ creatorId, data }) => {
            if (creatorId && data && data.$id) {
              updated[creatorId] = data;
            }
          });
          return updated;
        });
      } catch (error) {
        // Remove failed IDs from fetched set
        missingIds.forEach((id) => fetchedTrendingCreatorIds.current.delete(id));
      } finally {
        fetchingRef.current = false;
      }
    };

    fetchCreators();
    return () => {
      isMounted = false;
    };
  }, [combinedLatestPosts]);

 
  
  const posts = selectedTab === 'forYou' ? combinedForYouPosts : followingPosts;
  const refetch = selectedTab === 'forYou' ? async () => {
    await refetchForYou();
    await refetchForYouPhotos();
  } : refetchFollowing;

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

  // Insert ads into posts every 5 posts
  const displayPostsWithAds = useMemo(() => {
    const basePosts = isSearching ? searchResults : posts;
    if (!activeAds || activeAds.length === 0) return basePosts;
    
    const postsWithAds = [];
    const adInterval = 5; // Show ad every 5 posts
    
    basePosts.forEach((post, index) => {
      postsWithAds.push(post);
      
      // Insert ad after every adInterval posts
      if ((index + 1) % adInterval === 0) {
        const adIndex = Math.floor((index / adInterval) % activeAds.length);
        const ad = activeAds[adIndex];
        if (ad) {
          // Preserve original ad ID for tracking, but use unique ID for FlatList key
          postsWithAds.push({ 
            ...ad, 
            isAd: true, 
            $id: `ad_${ad.$id}_${index}`, // Unique ID for FlatList
            originalAdId: ad.$id // Preserve original ID for tracking
          });
        }
      }
    });
    
    return postsWithAds;
  }, [isSearching ? searchResults : posts, activeAds]);
  
  // Use search results if searching, otherwise use normal posts with ads
  const displayPosts = displayPostsWithAds;

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Reset video index when switching tabs
  useEffect(() => {
    setCurrentVideoIndex(0);
  }, [selectedTab]);

  // Handle focus/blur to stop videos when navigating away and refresh data
  useFocusEffect(
    useCallback(() => {
      setIsHomeFocused(true);
      // Refresh posts when screen comes into focus (including trending)
      if (refetchForYou) {
        refetchForYou();
      }
      if (refetchForYouPhotos) {
        refetchForYouPhotos();
      }
      if (refetchFollowing) {
        refetchFollowing();
      }
      if (refetchLatestPosts) {
        refetchLatestPosts();
      }
      if (refetchLatestPhotos) {
        refetchLatestPhotos();
      }
      return () => {
        setIsHomeFocused(false);
      };
    }, [refetchForYou, refetchForYouPhotos, refetchFollowing, refetchLatestPosts, refetchLatestPhotos])
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
    
    if (newIndex !== currentTrendingIndex && newIndex < (combinedLatestPosts?.length || 0)) {
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

  const renderVideoCard = useCallback(
    ({ item, index }) => {
      // Render advertisement if it's an ad
      if (item.isAd) {
        return (
          <View style={{ height: SCREEN_HEIGHT, justifyContent: 'center', paddingHorizontal: 16 }}>
            <AdvertisementCard advertisement={item} />
          </View>
        );
      }
      
      // Render regular video card
      return (
        <StrollVideoCard
          item={item}
          index={index}
          isVisible={index === currentVideoIndex}
          onVideoStateChange={() => {}} // Empty function since we're not using it anymore
          isHomeFocused={isHomeFocused}
          theme={theme}
          isDarkMode={isDarkMode}
        />
      );
    },
    [currentVideoIndex, isHomeFocused, theme, isDarkMode]
  );

  // Render trending video item - memoized to update when trendingCreators changes
  const renderTrendingItem = useCallback(({ item, index }) => {
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

    const videoWidth = getVideoWidth();
    const videoHeight = getVideoHeight();
    const marginHorizontal = getMarginHorizontal();
    
    // Get creator data - handle both object and string ID cases
    let creatorObject = null;
    let creatorId = null;
    
    if (typeof item.creator === "object" && item.creator !== null && item.creator.$id) {
      // Creator is already an object
      creatorObject = item.creator;
      creatorId = item.creator.$id;
    } else if (typeof item.creator === "string" && item.creator.trim() !== '') {
      // Creator is a string ID - look it up in trendingCreators
      creatorId = item.creator.trim();
      creatorObject = trendingCreators[creatorId] || null;
      
      // Removed debug log to prevent infinite loop
      
      // If not found in trendingCreators, try to get it from the post itself
      if (!creatorObject && item.creatorData) {
        creatorObject = item.creatorData;
      }
    }
    
    // Fallback to empty object if no creator found
    const creator = creatorObject || {};
    
    // Removed debug logs to prevent infinite loop
    
    // Get display name - try multiple fields (prioritize username as it's most common)
    // If no username found but we have a creatorId, show a loading/placeholder state
    const displayName =
      creator.username ||
      creator.fullname ||
      creator.displayName ||
      creator.name ||
      (creatorId ? "Loading..." : "");
    
    // Get handle/username (use username field directly)
    // If we have creatorId but no username yet, show placeholder
    const rawHandle = creator.username || creator.handle || (creatorId ? "user" : "");
    const handleLabel = rawHandle ? (rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`) : "";
    
    // Check if avatar exists and is valid
    // Avatar might be a file ID that needs to be converted to URL, or already a URL
    let avatarUrl = null;
    if (creator.avatar) {
      if (typeof creator.avatar === 'string' && creator.avatar.trim() !== '') {
        const avatarField = creator.avatar.trim();
        // If it's already a full URL (starts with http), use it directly
        if (avatarField.startsWith('http://') || avatarField.startsWith('https://')) {
          avatarUrl = avatarField;
        } 
        // If it's a short string (likely a file ID), construct the preview URL
        else if (avatarField.length < 50 && !avatarField.includes('/')) {
          avatarUrl = `${appwriteConfig.endpoint}/storage/buckets/${appwriteConfig.storageId}/files/${avatarField}/preview?width=2000&height=2000&gravity=top&quality=100&project=${appwriteConfig.projectId}`;
        }
        // Otherwise, try to use it as-is (might be a truncated URL or other format)
        else {
          avatarUrl = avatarField;
        }
      }
    }
    
    const hasAvatar = Boolean(avatarUrl && avatarUrl.trim() !== '');
    const avatarSource = hasAvatar ? { uri: avatarUrl } : null;

    const handleCreatorPress = () => {
      if (creatorId) {
        setTrendingModalVisible(false);
        router.push(`/profile/${creatorId}`);
      }
    };

    return (
      <View
        key={item.$id}
        style={{
          marginHorizontal,
          alignItems: 'center',
          width: videoWidth,
        }}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          style={{ width: '100%' }}
          onPress={() => {
            setTrendingModalVideo(item);
            setTrendingModalVisible(true);
            setIsTrendingVideoPlaying(true);
          }}
        >
          <View
            style={{
              width: videoWidth,
              height: videoHeight,
              borderRadius: 24,
              marginTop: 18,
              backgroundColor: themedColor('rgba(255,255,255,0.06)', theme.surface),
              overflow: 'hidden',
              shadowColor: themedColor('#000', '#CBD5F5'),
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.45,
              shadowRadius: 10,
              elevation: 10,
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {item.postType === 'photo' && item.photo && typeof item.photo === 'string' && item.photo.trim() !== '' ? (
              (() => {
                // Get filter and adjustments from item
                const filterId = item.filter || 'none';
                let adjustments = null;
                let textOverlays = [];
                let imageOverlays = [];
                
                if (item.edits) {
                  try {
                    const edits = typeof item.edits === 'string' ? JSON.parse(item.edits) : item.edits;
                    
                    // Handle both compressed and uncompressed formats for backward compatibility
                    if (edits.a !== undefined || edits.t !== undefined || edits.i !== undefined) {
                      // Compressed format
                      adjustments = edits.a || null;
                      textOverlays = (edits.t || []).map(overlay => ({
                        text: overlay.txt,
                        style: {
                          fontSize: overlay.stl?.fs,
                          fontFamily: overlay.stl?.ff,
                          color: overlay.stl?.c,
                          backgroundColor: overlay.stl?.bc,
                          alignment: overlay.stl?.al,
                          textStyle: overlay.stl?.ts
                        },
                        x: overlay.x,
                        y: overlay.y,
                        id: overlay.id
                      }));
                      imageOverlays = (edits.i || []).map(overlay => ({
                        uri: overlay.u,
                        x: overlay.x,
                        y: overlay.y,
                        width: overlay.w,
                        height: overlay.h,
                        rotation: overlay.r
                      }));
                    } else {
                      // Legacy uncompressed format
                      adjustments = edits.adjustments || null;
                      textOverlays = edits.textOverlays || [];
                      imageOverlays = edits.imageOverlays || [];
                    }
                  } catch (e) {
                    // Silently handle parse errors
                  }
                }
                
                const filterCSS = getFilterCSS(filterId, adjustments);
                const hasOverlays = textOverlays.length > 0 || imageOverlays.length > 0;
                
                // Use WebView if there are filters or overlays
                if (filterCSS !== 'none' || hasOverlays) {
                  const photoUri = String(item.photo);
                  // Create stable key based on photo URI, filter, and overlays to prevent unnecessary re-renders
                  const overlayKey = `${textOverlays.length}-${imageOverlays.length}-${JSON.stringify(textOverlays).length}-${JSON.stringify(imageOverlays).length}`;
                  const webViewKey = `trending-photo-${item.$id || photoUri}-${filterCSS}-${overlayKey}`;
                  
                  return (
                    <View style={{ width: '100%', height: '100%' }}>
                      <WebView
                        key={webViewKey}
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
                                  html {
                                    width: 100%;
                                    height: 100%;
                                  }
                                  body {
                                    width: 100%;
                                    height: 100%;
                                    overflow: hidden;
                                    position: relative;
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    margin: 0;
                                    padding: 0;
                                  }
                                  img {
                                    max-width: 100%;
                                    max-height: 100%;
                                    width: auto;
                                    height: auto;
                                    object-fit: contain;
                                    filter: ${filterCSS};
                                    display: block;
                                  }
                                  ${textOverlays.map((overlay, index) => {
                                    const textStyle = overlay.style || {};
                                    const alignment = textStyle.alignment || 'center';
                                    
                                    // Use x/y from overlay if set, otherwise use alignment-based positioning
                                    let leftPos, transformValue;
                                    if (overlay.x !== undefined && overlay.y !== undefined) {
                                      // Dragged position - use center transform
                                      leftPos = overlay.x + '%';
                                      transformValue = 'translate(-50%, -50%)';
                                    } else {
                                      // Initial position based on alignment
                                      if (alignment === 'left') {
                                        leftPos = '5%';
                                        transformValue = 'translateY(-50%)';
                                      } else if (alignment === 'right') {
                                        leftPos = '95%';
                                        transformValue = 'translate(-100%, -50%)';
                                      } else {
                                        // center
                                        leftPos = '50%';
                                        transformValue = 'translate(-50%, -50%)';
                                      }
                                    }
                                    
                                    const hasBackgroundColor = textStyle.backgroundColor && 
                                      textStyle.backgroundColor !== 'transparent' && 
                                      textStyle.backgroundColor !== '' && 
                                      textStyle.backgroundColor !== null && 
                                      textStyle.backgroundColor !== undefined;
                                    const isGradient = textStyle.textStyle === 'gradient';
                                    
                                    let containerCSS = `
                                      position: absolute;
                                      top: ${overlay.y !== undefined ? overlay.y : 50}%;
                                      left: ${leftPos};
                                      transform: ${transformValue};
                                      font-size: ${textStyle.fontSize || 24}px;
                                      font-family: '${textStyle.fontFamily || 'Poppins-Bold'}', sans-serif;
                                      text-align: ${alignment};
                                      white-space: nowrap;
                                      z-index: ${index + 1};
                                      pointer-events: none;
                                      user-select: none;
                                    `;
                                    
                                    let textInnerCSS = `
                                      color: ${textStyle.color || '#FFFFFF'};
                                    `;
                                    
                                    if (hasBackgroundColor) {
                                      containerCSS += `background-color: ${textStyle.backgroundColor}; padding: 4px 8px; border-radius: 4px;`;
                                    }
                                    
                                    if (textStyle.textStyle === 'outline') {
                                      textInnerCSS += `-webkit-text-stroke: 2px ${textStyle.color || '#FFFFFF'}; -webkit-text-fill-color: transparent;`;
                                    } else if (textStyle.textStyle === 'shadow') {
                                      textInnerCSS += `text-shadow: 2px 2px 4px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.8);`;
                                    } else if (textStyle.textStyle === 'neon') {
                                      textInnerCSS += `text-shadow: 0 0 5px ${textStyle.color || '#FFFFFF'}, 0 0 10px ${textStyle.color || '#FFFFFF'}, 0 0 15px ${textStyle.color || '#FFFFFF'};`;
                                    } else if (isGradient) {
                                      textInnerCSS += `background: linear-gradient(45deg, ${textStyle.color || '#FFFFFF'}, #FF6B6B); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;`;
                                    }
                                    
                                    return `.text-overlay-${index} { ${containerCSS} } .text-overlay-${index} span { ${textInnerCSS} }`;
                                  }).join('\n')}
                                  ${imageOverlays.map((overlay, index) => {
                                    return `.image-overlay-${index} {
                                      position: absolute;
                                      top: ${overlay.y}%;
                                      left: ${overlay.x}%;
                                      width: ${overlay.width}%;
                                      height: ${overlay.height}%;
                                      transform: translate(-50%, -50%) rotate(${overlay.rotation}deg);
                                      z-index: ${100 + index};
                                      pointer-events: none;
                                    }`;
                                  }).join('\n')}
                                </style>
                              </head>
                              <body>
                                <img src="${photoUri}" alt="Photo with overlays" />
                                ${textOverlays.map((overlay, index) => 
                                  `<div class="text-overlay-${index}"><span>${overlay.text}</span></div>`
                                ).join('')}
                                ${imageOverlays.map((overlay, index) => 
                                  `<img src="${overlay.uri}" class="image-overlay-${index}" alt="Overlay ${index}" />`
                                ).join('')}
                              </body>
                            </html>
                          `
                        }}
                        style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
                        scrollEnabled={false}
                        showsVerticalScrollIndicator={false}
                        showsHorizontalScrollIndicator={false}
                        javaScriptEnabled={false}
                        domStorageEnabled={false}
                        onError={(syntheticEvent) => {
                          const { nativeEvent } = syntheticEvent;
                        }}
                      />
                    </View>
                  );
                }
                
                // No filter or overlays, use regular Image
                return (
                  <Image
                    source={{ uri: String(item.photo) }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="contain"
                    onError={(error) => {
                    }}
                  />
                );
              })()
            ) : item.video ? (
              <Video
                source={{
                  uri: getIOSCompatibleVideoUrl(item.video) || item.video,
                }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                shouldPlay={false}
                isMuted={true}
                isLooping={false}
                useNativeControls={false}
                posterSource={item.thumbnail ? { uri: item.thumbnail } : undefined}
                onError={(error) => {
                }}
                onLoad={() => {
                }}
                {...(Platform.OS === 'ios' && {
                  allowsExternalPlayback: false,
                  playInSilentModeIOS: true,
                  ignoreSilentSwitch: 'ignore',
                })}
              />
            ) : (
              <View
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: themedColor('rgba(0,0,0,0.35)', theme.surfaceMuted),
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: theme.textPrimary, fontSize: 16, textAlign: 'center' }}>
                  {item.title || t("home.noVideo")}
                </Text>
              </View>
            )}

            {/* Play Icon Overlay - Only for videos */}
            {item.video && item.postType !== 'photo' && (
              <View style={{ position: 'absolute', top: '50%', left: '50%', transform: [{ translateX: -24 }, { translateY: -24 }] }}>
                <Image source={icons.play} style={{ width: 48, height: 48 }} resizeMode="contain" />
              </View>
            )}

            {/* Avatar Badge - Always show, with fallback */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleCreatorPress}
              style={{
                position: 'absolute',
                top: 14,
                left: 14,
                width: 50,
                height: 50,
                borderRadius: 25,
                borderWidth: 3,
                borderColor: themedColor('#fff', theme.border),
                overflow: 'hidden',
                shadowColor: themedColor('#000', '#CBD5F5'),
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 6,
                elevation: 6,
                backgroundColor: theme.surface,
              }}
            >
              <Image
                source={hasAvatar && avatarSource ? avatarSource : images.profile}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
                onError={() => {
                  // Fallback already handled by default source
                }}
              />
            </TouchableOpacity>

            {/* Name Banner - Always show, with fallback */}
            {(displayName || handleLabel || creatorId) && (
              <LinearGradient
                colors={[
                  themedColor('rgba(0,0,0,0)', 'rgba(255,255,255,0)'),
                  themedColor('rgba(0,0,0,0.75)', 'rgba(15,23,42,0.75)'),
                ]}
                locations={[0, 1]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  paddingHorizontal: 16,
                  paddingVertical: 18,
                }}
              >
                {/* Show username/display name - prioritize username */}
                {(displayName && displayName !== "Loading...") && (
                  <Text
                    style={{
                      color: theme.textPrimary,
                      fontSize: 18,
                      fontWeight: '700',
                      textAlign: 'center',
                      textShadowColor: 'rgba(0,0,0,0.35)',
                      textShadowOffset: { width: 0, height: 2 },
                      textShadowRadius: 6,
                    }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {displayName}
                  </Text>
                )}
                {/* Show handle/username */}
                {handleLabel && (
                  <Text
                    style={{
                      color: themedColor('rgba(255,255,255,0.8)', theme.textSecondary),
                      fontSize: 13,
                      textAlign: 'center',
                      marginTop: (displayName && displayName !== "Loading...") ? 4 : 0,
                    }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {handleLabel}
                  </Text>
                )}
                {/* Fallback if no data loaded yet but we have creatorId */}
                {(!displayName || displayName === "Loading...") && !handleLabel && creatorId && (
                  <Text
                    style={{
                      color: themedColor('rgba(255,255,255,0.8)', theme.textSecondary),
                      fontSize: 13,
                      textAlign: 'center',
                    }}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    Loading user...
                  </Text>
                )}
              </LinearGradient>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  }, [currentTrendingIndex, trendingCreators, theme, isDarkMode, isRTL, themedColor, t, setTrendingModalVisible]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.background }}>
      <SafeAreaView 
        style={{ flex: 1, backgroundColor: theme.background }} 
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
              resizeMode: 'contain'
            }}
            onError={(error) => {
            }}
            resizeMethod="resize"
          />
          {/* Dark overlay for better text readability */}
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: themedColor('rgba(0, 0, 0, 0.35)', 'rgba(255, 255, 255, 0.35)')
          }} />


        {/* Combined Scrollable Content with Trending and Videos */}
        <FlatList
            ref={flatListRef}
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
            onScroll={(event) => {
              const offsetY = event.nativeEvent.contentOffset.y;
              // Show button when scrolled down more than 2 screen heights
              setShowScrollToTop(offsetY > SCREEN_HEIGHT * 2);
            }}
            scrollEventThrottle={400}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1 }}
            removeClippedSubviews={true}
            maxToRenderPerBatch={3}
            updateCellsBatchingPeriod={50}
            initialNumToRender={2}
            windowSize={5}
            ListHeaderComponent={useMemo(() => (
            // Header Section with User Name and Search
            <View style={{ 
              paddingVertical: 20,
              borderBottomWidth: 1,
              borderBottomColor: themedColor('rgba(255,255,255,0.1)', 'rgba(15,23,42,0.1)')
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
                  
                  {/* Right side with Messages button and ASAB Badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {/* Messages List Button */}
                    <TouchableOpacity 
                      onPress={() => router.push('/chat')}
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        backgroundColor: themedColor('rgba(255, 255, 255, 0)', theme.accentSoft),
                        justifyContent: 'center',
                        alignItems: 'center',
                        borderWidth: 1,
                        borderColor: themedColor('rgba(255, 255, 255, 0)', theme.border),
                      }}
                    >
                      <Image
                        source={icons.messages}
                        style={{ width: 75, height: 75, tintColor: theme.textPrimary }}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                    
                    {/* ASAB VIDEOS Badge with Beige Back Background */}
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
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                </View>
                
                {/* Welcome Back and Username */}
                <View>
                  <Text style={{ 
                    color: theme.textSecondary, 
                    fontSize: 14, 
                    marginBottom: 5,
                    textAlign: isRTL ? 'right' : 'left',
                  }}>
                    {t("home.welcomeBack")}
                  </Text>
                  <Text style={{ 
                    color: theme.textPrimary, 
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
                  backgroundColor: themedColor('rgba(255,255,255,0.1)', theme.surface),
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderWidth: 1,
                  borderColor: themedColor('rgba(255,255,255,0.2)', theme.border),
                  borderRadius: 14,
                }}>
                  <TextInput
                    ref={searchInputRef}
                    placeholder={t("home.searchPlaceholder")}
                    placeholderTextColor={themedColor('rgba(255,255,255,0.6)', theme.textSecondary)}
                    style={{
                      flex: 1,
                      color: theme.textPrimary,
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
                  <Text style={{ color: theme.textPrimary, fontSize: 18 }}>
                      {searchQuery.trim() ? '✕' : '🔍'}
                    </Text>
                  </TouchableOpacity>
                  

                </View>
              </View>

              {/* Search Results Indicator */}
              {isSearching && searchQuery.trim() && (
                <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 16, textAlign: 'center' }}>
                    {searchResults.length > 0 
                      ? t("home.searchResults", { count: searchResults.length, query: searchQuery })
                      : t("home.searchNoResults", { query: searchQuery })
                    }
                  </Text>
                </View>
              )}

              {/* Trending Videos and Photos Section */}
              {combinedLatestPosts && combinedLatestPosts.length > 0 ? (
                <View style={{ 
                  backgroundColor: themedColor('rgba(2,14,13,0.95)', theme.surfaceMuted), 
                  paddingVertical: 20,
                  borderBottomWidth: 1,
                  borderBottomColor: themedColor('rgba(255,255,255,0.08)', 'rgba(15,23,42,0.08)'),
                  height: 400
                }}>
                  <Text style={{ 
                    color: theme.textPrimary, 
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
                    removeClippedSubviews={true}
                    decelerationRate="fast"
                    snapToInterval={146}
                    snapToAlignment="center"
                    pagingEnabled={false}
                  >
                    {combinedLatestPosts.slice(0, 100).map((item, index) => renderTrendingItem({ item, index }))}
                  </ScrollView>
                  
                  {/* Carousel Indicators */}
                  <View style={{ 
                    flexDirection: 'row', 
                    justifyContent: 'center', 
                  }}>
                    {combinedLatestPosts.slice(0, 4).map((_, index) => (
                      <View 
                        key={index}
                        style={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: 4, 
                          backgroundColor: index === 1 ? theme.accent : themedColor('rgba(255,255,255,0.3)', 'rgba(15,23,42,0.2)'), 
                          marginHorizontal: 4 
                        }} 
                      />
                    ))}
                  </View>
                </View>
              ) : null}
              
              {/* For You / Following Tabs - TikTok Style */}
              <View style={{ paddingVertical: 8, backgroundColor: theme.background }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
                  <TouchableOpacity 
                    onPress={() => setSelectedTab('forYou')}
                    style={{ 
                      backgroundColor: selectedTab === 'forYou' ? themedColor('rgba(255,255,255,0.25)', theme.accentSoft) : themedColor('rgba(255,255,255,0.1)', theme.surfaceMuted), 
                      paddingHorizontal: 24, 
                      paddingVertical: 10, 
                      borderRadius: 20, 
                      marginHorizontal: 5,
                      borderWidth: selectedTab === 'forYou' ? 1 : 0,
                      borderColor: selectedTab === 'forYou' ? themedColor('rgba(255,255,255,0.3)', theme.border) : 'transparent',
                    }}
                  >
                    <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: selectedTab === 'forYou' ? '700' : '400' }}>
                      {t("home.tabForYou")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setSelectedTab('following')}
                    style={{ 
                      backgroundColor: selectedTab === 'following' ? themedColor('rgba(255,255,255,0.25)', theme.accentSoft) : themedColor('rgba(255,255,255,0.1)', theme.surfaceMuted), 
                      paddingHorizontal: 24, 
                      paddingVertical: 10, 
                      borderRadius: 20, 
                      marginHorizontal: 5,
                      borderWidth: selectedTab === 'following' ? 1 : 0,
                      borderColor: selectedTab === 'following' ? themedColor('rgba(255,255,255,0.3)', theme.border) : 'transparent',
                    }}
                  >
                    <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: selectedTab === 'following' ? '700' : '400' }}>
                      {t("home.tabFollowing")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
        ), [selectedTab, combinedLatestPosts, trendingCreators, searchQuery, isSearching, searchResults, user, theme, isRTL, isDarkMode, themedColor, t, currentTrendingIndex, renderTrendingItem])}
        />
        
        {/* Scroll to Top Button */}
        {showScrollToTop && (
          <TouchableOpacity
            onPress={() => {
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              setShowScrollToTop(false); // Hide immediately when clicked
            }}
            style={{
              position: 'absolute',
              bottom: 30,
              right: 20,
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: themedColor('rgba(138, 43, 226, 0.95)', theme.accent),
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 8,
              elevation: 10,
              zIndex: 1000,
              borderWidth: 2,
              borderColor: themedColor('rgba(255, 255, 255, 0.3)', 'rgba(255, 255, 255, 0.5)'),
            }}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={isDarkMode ? ['#8A2BE2', '#4B0082'] : [theme.accent || '#8A2BE2', '#6A1B9A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 28,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>↑</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
        </View>
      </SafeAreaView>

      {/* Full Screen Trending Video Modal */}
      <Modal
        visible={trendingModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setTrendingModalVisible(false)}
        style={{ backgroundColor: theme.background }}
      >
        {trendingModalVideo && (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
              {/* Close Button */}
              <TouchableOpacity 
                onPress={() => setTrendingModalVisible(false)} 
                style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}
              >
                <Text style={{ color: theme.textPrimary, fontSize: 28 }}>×</Text>
              </TouchableOpacity>
              
              {/* Video or Photo */}
              <View style={{ flex: 1, backgroundColor: theme.background, position: 'relative' }}>
                {trendingModalVideo.postType === 'photo' && trendingModalVideo.photo && typeof trendingModalVideo.photo === 'string' && trendingModalVideo.photo.trim() !== '' ? (
                  (() => {
                    // Get filter and adjustments from item
                    const filterId = trendingModalVideo.filter || 'none';
                    let adjustments = null;
                    let textOverlays = [];
                    let imageOverlays = [];
                    
                    if (trendingModalVideo.edits) {
                      try {
                        const edits = typeof trendingModalVideo.edits === 'string' ? JSON.parse(trendingModalVideo.edits) : trendingModalVideo.edits;
                        
                        // Handle both compressed and uncompressed formats for backward compatibility
                        if (edits.a !== undefined || edits.t !== undefined || edits.i !== undefined) {
                          // Compressed format
                          adjustments = edits.a || null;
                          textOverlays = (edits.t || []).map(overlay => ({
                            text: overlay.txt,
                            style: {
                              fontSize: overlay.stl?.fs,
                              fontFamily: overlay.stl?.ff,
                              color: overlay.stl?.c,
                              backgroundColor: overlay.stl?.bc,
                              alignment: overlay.stl?.al,
                              textStyle: overlay.stl?.ts
                            },
                            x: overlay.x,
                            y: overlay.y,
                            id: overlay.id
                          }));
                          imageOverlays = (edits.i || []).map(overlay => ({
                            uri: overlay.u,
                            x: overlay.x,
                            y: overlay.y,
                            width: overlay.w,
                            height: overlay.h,
                            rotation: overlay.r
                          }));
                        } else {
                          // Legacy uncompressed format
                          adjustments = edits.adjustments || null;
                          textOverlays = edits.textOverlays || [];
                          imageOverlays = edits.imageOverlays || [];
                        }
                      } catch (e) {
                        // Silently handle parse errors
                      }
                    }
                    
                    const filterCSS = getFilterCSS(filterId, adjustments);
                    const hasOverlays = textOverlays.length > 0 || imageOverlays.length > 0;
                    
                    // Use WebView if there are filters or overlays
                    if (filterCSS !== 'none' || hasOverlays) {
                      const photoUri = String(trendingModalVideo.photo);
                      // Create stable key based on photo URI, filter, and overlays to prevent unnecessary re-renders
                      const overlayKey = `${textOverlays.length}-${imageOverlays.length}-${JSON.stringify(textOverlays).length}-${JSON.stringify(imageOverlays).length}`;
                      const webViewKey = `trending-modal-photo-${trendingModalVideo.$id || photoUri}-${filterCSS}-${overlayKey}`;
                      
                      return (
                        <View style={{ flex: 1, width: '100%', height: '100%' }}>
                          <WebView
                            key={webViewKey}
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
                                      html {
                                        width: 100%;
                                        height: 100%;
                                      }
                                      body {
                                        width: 100%;
                                        height: 100%;
                                        overflow: hidden;
                                        position: relative;
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                        margin: 0;
                                        padding: 0;
                                      }
                                      img {
                                        max-width: 100%;
                                        max-height: 100%;
                                        width: auto;
                                        height: auto;
                                        object-fit: contain;
                                        filter: ${filterCSS};
                                        display: block;
                                      }
                                      ${textOverlays.map((overlay, index) => {
                                        const textStyle = overlay.style || {};
                                        const alignment = textStyle.alignment || 'center';
                                        
                                        // Use x/y from overlay if set, otherwise use alignment-based positioning
                                        let leftPos, transformValue;
                                        if (overlay.x !== undefined && overlay.y !== undefined) {
                                          // Dragged position - use center transform
                                          leftPos = overlay.x + '%';
                                          transformValue = 'translate(-50%, -50%)';
                                        } else {
                                          // Initial position based on alignment
                                          if (alignment === 'left') {
                                            leftPos = '5%';
                                            transformValue = 'translateY(-50%)';
                                          } else if (alignment === 'right') {
                                            leftPos = '95%';
                                            transformValue = 'translate(-100%, -50%)';
                                          } else {
                                            // center
                                            leftPos = '50%';
                                            transformValue = 'translate(-50%, -50%)';
                                          }
                                        }
                                        
                                        const hasBackgroundColor = textStyle.backgroundColor && 
                                          textStyle.backgroundColor !== 'transparent' && 
                                          textStyle.backgroundColor !== '' && 
                                          textStyle.backgroundColor !== null && 
                                          textStyle.backgroundColor !== undefined;
                                        const isGradient = textStyle.textStyle === 'gradient';
                                        
                                        let containerCSS = `
                                          position: absolute;
                                          top: ${overlay.y !== undefined ? overlay.y : 50}%;
                                          left: ${leftPos};
                                          transform: ${transformValue};
                                          font-size: ${textStyle.fontSize || 24}px;
                                          font-family: '${textStyle.fontFamily || 'Poppins-Bold'}', sans-serif;
                                          text-align: ${alignment};
                                          white-space: nowrap;
                                          z-index: ${index + 1};
                                          pointer-events: none;
                                          user-select: none;
                                        `;
                                        
                                        let textInnerCSS = `
                                          color: ${textStyle.color || '#FFFFFF'};
                                        `;
                                        
                                        if (hasBackgroundColor) {
                                          containerCSS += `background-color: ${textStyle.backgroundColor}; padding: 4px 8px; border-radius: 4px;`;
                                        }
                                        
                                        if (textStyle.textStyle === 'outline') {
                                          textInnerCSS += `-webkit-text-stroke: 2px ${textStyle.color || '#FFFFFF'}; -webkit-text-fill-color: transparent;`;
                                        } else if (textStyle.textStyle === 'shadow') {
                                          textInnerCSS += `text-shadow: 2px 2px 4px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.8);`;
                                        } else if (textStyle.textStyle === 'neon') {
                                          textInnerCSS += `text-shadow: 0 0 5px ${textStyle.color || '#FFFFFF'}, 0 0 10px ${textStyle.color || '#FFFFFF'}, 0 0 15px ${textStyle.color || '#FFFFFF'};`;
                                        } else if (isGradient) {
                                          textInnerCSS += `background: linear-gradient(45deg, ${textStyle.color || '#FFFFFF'}, #FF6B6B); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;`;
                                        }
                                        
                                        return `.text-overlay-${index} { ${containerCSS} } .text-overlay-${index} span { ${textInnerCSS} }`;
                                      }).join('\n')}
                                      ${imageOverlays.map((overlay, index) => {
                                        return `.image-overlay-${index} {
                                          position: absolute;
                                          top: ${overlay.y}%;
                                          left: ${overlay.x}%;
                                          width: ${overlay.width}%;
                                          height: ${overlay.height}%;
                                          transform: translate(-50%, -50%) rotate(${overlay.rotation}deg);
                                          z-index: ${100 + index};
                                          pointer-events: none;
                                        }`;
                                      }).join('\n')}
                                    </style>
                                  </head>
                                  <body>
                                    <img src="${photoUri}" alt="Photo with overlays" />
                                    ${textOverlays.map((overlay, index) => 
                                      `<div class="text-overlay-${index}"><span>${overlay.text}</span></div>`
                                    ).join('')}
                                    ${imageOverlays.map((overlay, index) => 
                                      `<img src="${overlay.uri}" class="image-overlay-${index}" alt="Overlay ${index}" />`
                                    ).join('')}
                                  </body>
                                </html>
                              `
                            }}
                            style={{ flex: 1, width: '100%', height: '100%', backgroundColor: 'transparent' }}
                            scrollEnabled={false}
                            showsVerticalScrollIndicator={false}
                            showsHorizontalScrollIndicator={false}
                            javaScriptEnabled={false}
                            domStorageEnabled={false}
                            onError={(syntheticEvent) => {
                              const { nativeEvent } = syntheticEvent;
                            }}
                          />
                        </View>
                      );
                    }
                    
                    // No filter or overlays, use regular Image
                    return (
                      <Image
                        source={{ uri: String(trendingModalVideo.photo) }}
                        style={{ flex: 1, width: '100%', height: '100%' }}
                        resizeMode="contain"
                        onError={(error) => {
                          
                        }}
                      />
                    );
                  })()
                ) : trendingModalVideo.video ? (
                  <>
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
                      }}
                      onLoad={() => {
                        
                      }}
                    />
                    
                    {/* Play/Pause Button - Only for videos */}
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
                        backgroundColor: themedColor('rgba(255, 255, 255, 0.2)', 'rgba(15,23,42,0.2)'),
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 5
                      }}
                    >
                      <Text style={{ color: theme.textPrimary, fontSize: 24 }}>
                        {isTrendingVideoPlaying ? '❚❚' : '►'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: theme.textPrimary, fontSize: 16 }}>
                      {t("home.noVideoAvailable")}
                    </Text>
                  </View>
                )}
                
                {/* Video Info Overlay */}
                <View style={{ 
                  position: 'absolute', 
                  bottom: 50, 
                  left: 20, 
                  right: 20,
                  zIndex: 5
                }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
                    {trendingModalVideo.title || t("home.untitledVideo")}
                  </Text>
                  {trendingModalVideo.creator && (
                    <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
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

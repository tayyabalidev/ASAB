import { useState, useEffect, useRef, useMemo } from "react";
import { router, useLocalSearchParams, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Image, ImageBackground, FlatList, TouchableOpacity, Text, Alert, Linking, Modal, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, FlatList as RNFlatList, Share } from "react-native";
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Query } from 'react-native-appwrite';
import { Video, ResizeMode } from "expo-av";
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from "react-i18next";

import { icons } from "../../../constants";
import useAppwrite from "../../../lib/useAppwrite";
import { getUserPosts, getCurrentUser, databases, appwriteConfig } from "../../../lib/appwrite";
import { useGlobalContext } from "../../../context/GlobalProvider";
import { EmptyState, InfoBox, VideoCard, VideoProgressBar } from "../../../components";
import CallButton from "../../../components/CallButton";
import { toggleFollowUser, getFollowers, getUserLikesCount, toggleLikePost, getComments, addComment, getPostLikes, toggleBookmark, isVideoBookmarked, getShareCount, incrementShareCount, getCreatorTotalDonations, getPendingPayoutAmount, getCreatorDonations, getCreatorPayouts, createPayout, toggleLike, isPostLiked, getLikeCount } from "../../../lib/appwrite";
import { images } from "../../../constants";
import { isVideoMedia } from "../../../lib/mediaType";

const UserProfile = () => {
  const { id } = useLocalSearchParams();
  const { t } = useTranslation();
  const { user: currentUser, followStatus, updateFollowStatus, theme, isDarkMode } = useGlobalContext();
  const [profileUser, setProfileUser] = useState(null);
  // Re-enable privacy states
  const [isPrivate, setIsPrivate] = useState(false);
  const [canView, setCanView] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [playingIndex, setPlayingIndex] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalVideo, setModalVideo] = useState(null);
  // Modal interaction states
  const [bookmarked, setBookmarked] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentsCount, setCommentsCount] = useState(0);
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [shareCount, setShareCount] = useState(0);
  const videoRefs = useRef({});
  const [modalIndex, setModalIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const modalVideoRef = useRef(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  
  // Earnings Dashboard States
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [pendingPayout, setPendingPayout] = useState(0);
  const [donations, setDonations] = useState([]);
  const [donationsWithDonors, setDonationsWithDonors] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loadingEarnings, setLoadingEarnings] = useState(false);
  const [showEarningsDashboard, setShowEarningsDashboard] = useState(false);

  const profileBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.usersPage),
    [isDarkMode]
  );

  const textBackgroundImage = useMemo(
    () => (isDarkMode ? images.textBackgroundDark : images.textBackgroundLight),
    [isDarkMode]
  );

  const overlayColor = useMemo(
    () => (isDarkMode ? 'rgba(0, 0, 0, 0.45)' : 'rgba(255, 255, 255, 0.8)'),
    [isDarkMode]
  );

  // Get posts for the profile user
  const { data: posts } = useAppwrite(() => {
    if (!id) return Promise.resolve([]);
    return getUserPosts(id);
  }, [id]);

  useEffect(() => {
    let isMounted = true;

    const fetchProfileUser = async () => {
      try {
        if (isMounted) setLoading(true);

        if (!id) {
          Alert.alert(t('common.error'), 'User ID is required');
          router.back();
          return;
        }

        const userResponse = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userCollectionId,
          id
        );

        if (!isMounted) return;
        if (!userResponse) {
          Alert.alert(t('common.error'), 'User not found');
          router.back();
          return;
        }

        setProfileUser(userResponse);
        const isProfilePrivate = userResponse.isPrivate || false;
        setIsPrivate(isProfilePrivate);

        if (currentUser && currentUser.$id === id) {
          setCanView(true);
        } else if (isProfilePrivate) {
          const allowedViewers = userResponse.allowedViewers || [];
          setCanView(currentUser ? allowedViewers.includes(currentUser.$id) : false);
        } else {
          setCanView(true);
        }

        if (currentUser && currentUser.$id !== id) {
          const followers = userResponse.followers || [];
          const isFollowingUser = followers.includes(currentUser.$id);
          setIsFollowing(isFollowingUser);
          setFollowersCount(followers.length);
          updateFollowStatus(id, isFollowingUser);
        } else {
          setFollowersCount(userResponse.followers ? userResponse.followers.length : 0);
        }

        const totalLikes = await getUserLikesCount(id);
        if (isMounted) setLikesCount(totalLikes);
      } catch (error) {
        console.error('Error fetching profile user:', error);
        if (isMounted) {
          Alert.alert(t('common.error'), error.message || t('profile.alerts.loadProfileError'));
          router.back();
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (id) {
      fetchProfileUser();
    } else {
      router.back();
    }

    return () => { isMounted = false; };
  }, [id, currentUser]);

  // Fetch earnings data when viewing own profile
  useEffect(() => {
    let isMounted = true;

    const fetchEarningsData = async () => {
      if (currentUser?.$id !== id) return;

      try {
        if (isMounted) setLoadingEarnings(true);
        const [total, pending, donationsList, payoutsList] = await Promise.all([
          getCreatorTotalDonations(id),
          getPendingPayoutAmount(id),
          getCreatorDonations(id),
          getCreatorPayouts(id)
        ]);

        if (!isMounted) return;
        setTotalEarnings(total || 0);
        setPendingPayout(pending || 0);
        setDonations(donationsList || []);
        setPayouts(payoutsList || []);

        const donationsWithDonorInfo = await Promise.all(
          (donationsList || []).map(async (donation) => {
            try {
              const donor = await databases.getDocument(
                appwriteConfig.databaseId,
                appwriteConfig.userCollectionId,
                donation.donorId
              );
              return {
                ...donation,
                donorName: donor.username || 'Anonymous',
                donorAvatar: donor.avatar || ''
              };
            } catch (error) {
              return { ...donation, donorName: 'Anonymous', donorAvatar: '' };
            }
          })
        );

        if (isMounted) setDonationsWithDonors(donationsWithDonorInfo);
      } catch (error) {
      } finally {
        if (isMounted) setLoadingEarnings(false);
      }
    };

    if (id && currentUser?.$id === id) {
      fetchEarningsData();
    }

    return () => { isMounted = false; };
  }, [id, currentUser]);

  // When modalVideo changes, set up comment state
  useEffect(() => {
    if (modalVideo) {
      setCommentsCount(modalVideo.comments ? modalVideo.comments.length : 0);
    }
  }, [modalVideo]);

  // Comments logic for modal
  useEffect(() => {
    if (!commentsModalVisible || !modalVideo) return;
    let isMounted = true;
    setLoadingComments(true);
    getComments(modalVideo.$id)
      .then((res) => { if (isMounted) setComments(res); })
      .catch(() => { if (isMounted) setComments([]); })
      .finally(() => { if (isMounted) setLoadingComments(false); });
    return () => { isMounted = false; };
  }, [commentsModalVisible, modalVideo]);


  const handleBack = () => {
    router.back(); // Go back to previous screen instead of redirecting to home
  };

  // Re-enable request access function
  const requestAccess = async () => {
    try {
      // Add current user to the profile user's pending requests
      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        id,
        {
          pendingRequests: [...(profileUser.pendingRequests || []), currentUser.$id]
        }
      );
      
      Alert.alert(t('profile.alerts.requestSentTitle'), t('profile.alerts.requestSentMessage'));
    } catch (error) {
      Alert.alert(t('common.error'), t('profile.alerts.requestError'));
    }
  };

  const handleFollowToggle = async () => {
    // Immediate visual feedback
    const newFollowState = !isFollowing;
    setIsFollowing(newFollowState);
    setFollowersCount((prev) => newFollowState ? prev + 1 : prev - 1);
    updateFollowStatus(id, newFollowState);
    
    try {
      await toggleFollowUser(currentUser.$id, id);
      
      // Show success message
      const action = newFollowState ? 'followed' : 'unfollowed';
    } catch (error) {
      // Revert on error
      setIsFollowing(!newFollowState);
      setFollowersCount((prev) => !newFollowState ? prev + 1 : prev - 1);
      updateFollowStatus(id, !newFollowState);
      Alert.alert(t('common.error'), error.message || t('profile.alerts.followError'));
    }
  };

  const handleMessage = () => {
    // Open chat with this user
    router.push({ pathname: '/chat', params: { userId: id } });
  };


  const handleBookmark = async () => {
    if (!currentUser?.$id || !modalVideo) {
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

      const newBookmarkStatus = await toggleBookmark(currentUser.$id, modalVideo.$id, videoData);
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
    if (!newComment.trim() || !currentUser?.$id || !modalVideo) return;
    setPosting(true);
    try {
      const comment = await addComment(modalVideo.$id, currentUser.$id, newComment.trim());
      const updatedComments = await getComments(modalVideo.$id);
      setComments(updatedComments);
      setNewComment("");
      setCommentsCount((prev) => prev + 1);
    } catch (error) {
    } finally {
      setPosting(false);
    }
  };

  const handleAddReply = async (parentCommentId) => {
    if (!replyText.trim() || !currentUser?.$id || !modalVideo) return;
    setPostingReply(true);
    try {
      await addComment(modalVideo.$id, currentUser.$id, replyText.trim(), parentCommentId);
      const updatedComments = await getComments(modalVideo.$id);
      setComments(updatedComments);
      setReplyText("");
      setReplyingTo(null);
      setCommentsCount((prev) => prev + 1);
    } catch (error) {
    } finally {
      setPostingReply(false);
    }
  };

  const handleLikeComment = async (commentId, currentLikes) => {
    if (!currentUser?.$id) return;
    
    const isLiked = Array.isArray(currentLikes) ? currentLikes.includes(currentUser.$id) : false;
    const newLikedState = !isLiked;
    
    // Optimistic update
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.$id === commentId) {
          const currentLikesArray = Array.isArray(comment.likes) ? comment.likes : [];
          const updatedLikes = newLikedState
            ? [...currentLikesArray, currentUser.$id]
            : currentLikesArray.filter((id) => id !== currentUser.$id);
          return { ...comment, likes: updatedLikes };
        }
        // Also update in replies
        if (comment.replies && Array.isArray(comment.replies)) {
          const updatedReplies = comment.replies.map((reply) => {
            if (reply.$id === commentId) {
              const replyLikesArray = Array.isArray(reply.likes) ? reply.likes : [];
              const updatedLikes = newLikedState
                ? [...replyLikesArray, currentUser.$id]
                : replyLikesArray.filter((id) => id !== currentUser.$id);
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
      await toggleLikeComment(commentId, currentUser.$id);
    } catch (error) {
      // Revert on error
      const updatedComments = await getComments(modalVideo.$id);
      setComments(updatedComments);
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

  const formatCurrency = (amount) => {
    return `$${parseFloat(amount || 0).toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const handleRequestWithdrawal = async () => {
    if (pendingPayout <= 0) {
      Alert.alert('No Funds', 'You have no pending funds available for withdrawal.');
      return;
    }

    if (pendingPayout < 10) {
      Alert.alert('Minimum Amount', 'Minimum withdrawal amount is $10.00');
      return;
    }

    Alert.alert(
      'Request Withdrawal',
      `Request withdrawal of ${formatCurrency(pendingPayout)}?\n\nThis will create a payout request that will be processed by the admin.`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Request',
          onPress: async () => {
            try {
              // Get all unpaid donations
              const unpaidDonations = donations.filter(donation => {
                // Check if this donation is in any completed payout
                const isPaid = payouts.some(payout => 
                  payout.status === 'completed' && 
                  payout.donationIds?.includes(donation.$id)
                );
                return !isPaid;
              });

              const donationIds = unpaidDonations.map(d => d.$id);

              await createPayout({
                creatorId: id,
                amount: pendingPayout,
                donationIds: donationIds,
                status: 'pending',
                payoutMethod: 'stripe'
              });

              Alert.alert('Success', 'Withdrawal request submitted successfully! It will be processed by the admin.');
              
              // Refresh earnings data
              const [total, pending, donationsList, payoutsList] = await Promise.all([
                getCreatorTotalDonations(id),
                getPendingPayoutAmount(id),
                getCreatorDonations(id),
                getCreatorPayouts(id)
              ]);
              
              setTotalEarnings(total || 0);
              setPendingPayout(pending || 0);
              setDonations(donationsList || []);
              setPayouts(payoutsList || []);
              
              // Refresh donor details
              const donationsWithDonorInfo = await Promise.all(
                (donationsList || []).map(async (donation) => {
                  try {
                    const donor = await databases.getDocument(
                      appwriteConfig.databaseId,
                      appwriteConfig.userCollectionId,
                      donation.donorId
                    );
                    return {
                      ...donation,
                      donorName: donor.username || 'Anonymous',
                      donorAvatar: donor.avatar || ''
                    };
                  } catch (error) {
                    return {
                      ...donation,
                      donorName: 'Anonymous',
                      donorAvatar: ''
                    };
                  }
                })
              );
              
              setDonationsWithDonors(donationsWithDonorInfo);
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to request withdrawal. Please try again.');
            }
          }
        }
      ]
    );
  };

  const openVideoModal = (item, index) => {
    setModalVideo(item);
    setModalIndex(index);
    setModalVisible(true);
    setIsVideoPlaying(true);
    setShowProgressBar(true);
    setPlaybackPosition(0);
    setPlaybackDuration(0);
    setIsVideoReady(false);
  };

  const navigateToNextVideo = () => {
    if (modalIndex < posts.length - 1) {
      const nextVideo = posts[modalIndex + 1];
      setModalVideo(nextVideo);
      setModalIndex(modalIndex + 1);
      setIsVideoPlaying(true);
      // Reset modal states for new video - will be synced by useEffect
      setComments([]);
      setNewComment("");
      // Reset like action flag when navigating
      recentLikeActionRef.current = false;
    }
  };

  const navigateToPreviousVideo = () => {
    if (modalIndex > 0) {
      const prevVideo = posts[modalIndex - 1];
      setModalVideo(prevVideo);
      setModalIndex(modalIndex - 1);
      setIsVideoPlaying(true);
      // Reset modal states for new video - will be synced by useEffect
      setComments([]);
      setNewComment("");
      // Reset like action flag when navigating
      recentLikeActionRef.current = false;
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

  // Check bookmark status and share count when modal video changes
  useEffect(() => {
    if (modalVideo && currentUser?.$id) {
      // Check bookmark status
      const checkBookmarkStatus = async () => {
        try {
          const isBookmarked = await isVideoBookmarked(currentUser.$id, modalVideo.$id);
          setBookmarked(isBookmarked);
        } catch (error) {
        }
      };

      const checkLikeStatus = async () => {
        try {
          const isLiked = await isPostLiked(currentUser.$id, modalVideo.$id);
          setLiked(isLiked);
        } catch (error) {
          setLiked(false);
        }
      };

      const fetchLikeCount = async () => {
        try {
          const likes = await getLikeCount(modalVideo.$id);
          setLikeCount(likes);
        } catch (error) {
          setLikeCount(0);
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
      checkLikeStatus();
      fetchLikeCount();
      fetchShareCount();
    }
  }, [modalVideo, currentUser?.$id]);

  const handleLike = async () => {
    if (!currentUser?.$id || !modalVideo?.$id) {
      Alert.alert(t("common.error"), "Please login to like posts");
      return;
    }

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      const newLikeStatus = await toggleLike(currentUser.$id, modalVideo.$id);
      setLiked(newLikeStatus);
      const updatedLikeCount = await getLikeCount(modalVideo.$id);
      setLikeCount(updatedLikeCount);
    } catch (error) {
      setLiked(!nextLiked);
      setLikeCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  if (loading) {
    return (
      <>
        <Stack.Screen 
          options={{ 
            headerShown: false 
          }} 
        />
        <SafeAreaView style={{ backgroundColor: theme?.background || '#000', flex: 1 }}>
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
            {/* Dark overlay for better text readability */}
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: overlayColor
            }} />
            <View className="flex-1 justify-center items-center">
              <Text className="text-white text-lg">{t('profile.other.loading')}</Text>
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  // Re-enable private profile view
  if (!canView) {
    return (
      <>
        <Stack.Screen 
          options={{ 
            headerShown: false 
          }} 
        />
        <SafeAreaView style={{ backgroundColor: theme?.background || '#000', flex: 1 }}>
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
            {/* Dark overlay for better text readability */}
            <View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: overlayColor
            }} />
            <View className="flex flex-row items-center justify-between px-4 mt-6 mb-8">
              <TouchableOpacity onPress={handleBack}>
                <Image
                  source={icons.leftArrow}
                  resizeMode="contain"
                  className="w-6 h-6"
                />
              </TouchableOpacity>
              <Text className="text-white text-lg font-psemibold">{t('profile.other.privateHeader')}</Text>
              <View className="w-6" />
            </View>

            <View className="flex-1 justify-center items-center px-4">
              <View className="w-20 h-20 border border-secondary rounded-full flex justify-center items-center mb-6">
                <Image
                  source={{ uri: profileUser?.avatar }}
                  className="w-[90%] h-[90%] rounded-full"
                  resizeMode="cover"
                />
              </View>
              
              <Text className="text-white text-xl font-psemibold mb-2">
                {profileUser?.username}
              </Text>
              
              <Text className="text-gray-300 text-center mb-8">
                {t('profile.other.privateMessage')}
              </Text>
              
              <TouchableOpacity
                onPress={requestAccess}
                className="bg-secondary px-6 py-3 rounded-lg"
              >
                <Text className="text-white font-psemibold">{t('profile.other.requestAccess')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={{ backgroundColor: theme?.background || '#000', flex: 1 }}>
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
          {/* Dark overlay for better text readability */}
          <View style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: overlayColor
          }} />
          <FlatList
            data={posts}
            keyExtractor={(item) => item.$id}
            numColumns={3}
            renderItem={({ item, index }) => (
              <View style={{ flex: 1/3, aspectRatio: 4/5, margin: 2, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' }}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={() => openVideoModal(item, index)}
                  style={{ width: '100%', height: '100%' }}
                >
                  <Image
                    source={{
                      uri: isVideoMedia(item?.video, item?.postType)
                        ? (item?.thumbnail || item?.photo || item?.video)
                        : (item?.photo || item?.thumbnail || item?.video),
                    }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={() => (
              <EmptyState
                title={t('profile.other.emptyTitle')}
                subtitle={t('profile.other.emptySubtitle')}
              />
            )}
            ListHeaderComponent={() => (
              <ImageBackground
                source={textBackgroundImage || images.backgroundImage}
                style={{
                  alignItems: 'center',
                  marginTop: 30,
                  marginBottom: 16,
                  marginHorizontal: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 24,
                  borderRadius: 24,
                  overflow: 'hidden',
                }}
                imageStyle={{
                  borderRadius: 24,
                  opacity: isDarkMode ? 0.45 : 0.85,
                }}
              >
                {/* Profile Picture */}
                <View className="w-20 h-20 border border-secondary items-center justify-center mb-4 rounded-lg">
                  <Image
                    source={{ uri: profileUser?.avatar }}
                    className="w-[90%] h-[90%]"
                    resizeMode="cover"
                  />
                </View>
                {/* Username and handle */}
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 22 }}>{profileUser?.username || t('profile.general.userPlaceholder')}</Text>
                <Text style={{ color: '#aaa', fontSize: 15, marginBottom: 8 }}>@{profileUser?.username || t('profile.general.handlePlaceholder')}</Text>
                {/* Stats Row */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ alignItems: 'center', marginHorizontal: 18 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 17 }}>{profileUser?.following?.length || 0}</Text>
                    <Text style={{ color: '#aaa', fontSize: 13 }}>{t('profile.stats.following')}</Text>
                  </View>
                  <View style={{ alignItems: 'center', marginHorizontal: 18 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 17 }}>{followersCount}</Text>
                    <Text style={{ color: '#aaa', fontSize: 13 }}>{t('profile.stats.followers')}</Text>
                  </View>
                  <View style={{ alignItems: 'center', marginHorizontal: 18 }}>
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 17 }}>{likesCount}</Text>
                    <Text style={{ color: '#aaa', fontSize: 13 }}>{t('profile.stats.likes')}</Text>
                  </View>
                </View>
                
                {/* Earnings Dashboard - Only show for own profile */}
                {currentUser.$id === id && (
                  <View style={{ marginTop: 8, marginBottom: 12 }}>
                    <TouchableOpacity
                      onPress={() => setShowEarningsDashboard(!showEarningsDashboard)}
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'rgba(50, 205, 50, 0.15)',
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: 'rgba(50, 205, 50, 0.3)',
                        marginBottom: 8
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 20, marginRight: 8 }}>💰</Text>
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                          Earnings Dashboard
                        </Text>
                      </View>
                      <Text style={{ color: '#32CD32', fontSize: 18 }}>
                        {showEarningsDashboard ? '▼' : '▶'}
                      </Text>
                    </TouchableOpacity>

                    {showEarningsDashboard && (
                      <View style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                        borderRadius: 16,
                        padding: 16,
                        marginTop: 8
                      }}>
                        {loadingEarnings ? (
                          <View style={{ padding: 20, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#32CD32" />
                            <Text style={{ color: '#aaa', marginTop: 8 }}>Loading earnings...</Text>
                          </View>
                        ) : (
                          <>
                            {/* Earnings Stats Cards */}
                            <View style={{ flexDirection: 'row', marginBottom: 16, gap: 12 }}>
                              <View style={{
                                flex: 1,
                                backgroundColor: 'rgba(50, 205, 50, 0.15)',
                                borderRadius: 12,
                                padding: 14,
                                borderWidth: 1,
                                borderColor: 'rgba(50, 205, 50, 0.3)'
                              }}>
                                <Text style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>Total Earnings</Text>
                                <Text style={{ color: '#32CD32', fontWeight: 'bold', fontSize: 20 }}>
                                  {formatCurrency(totalEarnings)}
                                </Text>
                              </View>
                              <View style={{
                                flex: 1,
                                backgroundColor: 'rgba(255, 165, 0, 0.15)',
                                borderRadius: 12,
                                padding: 14,
                                borderWidth: 1,
                                borderColor: 'rgba(255, 165, 0, 0.3)'
                              }}>
                                <Text style={{ color: '#aaa', fontSize: 12, marginBottom: 4 }}>Pending</Text>
                                <Text style={{ color: '#FFA500', fontWeight: 'bold', fontSize: 20 }}>
                                  {formatCurrency(pendingPayout)}
                                </Text>
                              </View>
                            </View>

                            {/* Withdrawal Button */}
                            {pendingPayout >= 10 && (
                              <TouchableOpacity
                                onPress={handleRequestWithdrawal}
                                style={{
                                  backgroundColor: '#32CD32',
                                  borderRadius: 12,
                                  padding: 14,
                                  alignItems: 'center',
                                  marginBottom: 16,
                                  shadowColor: '#32CD32',
                                  shadowOffset: { width: 0, height: 2 },
                                  shadowOpacity: 0.3,
                                  shadowRadius: 4,
                                  elevation: 3
                                }}
                              >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                                  Request Withdrawal ({formatCurrency(pendingPayout)})
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Recent Donations */}
                            <View style={{ marginBottom: 16 }}>
                              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>
                                Recent Donations ({donationsWithDonors.length})
                              </Text>
                              {donationsWithDonors.length === 0 ? (
                                <Text style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 }}>
                                  No donations received yet
                                </Text>
                              ) : (
                                <View>
                                  {donationsWithDonors.slice(0, 5).map((item) => (
                                    <View
                                      key={item.$id}
                                      style={{
                                        flexDirection: 'row',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        paddingVertical: 10,
                                        paddingHorizontal: 12,
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        borderRadius: 8,
                                        marginBottom: 6
                                      }}
                                    >
                                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                        {item.donorAvatar ? (
                                          <Image
                                            source={{ uri: item.donorAvatar }}
                                            style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }}
                                          />
                                        ) : (
                                          <View style={{
                                            width: 32,
                                            height: 32,
                                            borderRadius: 16,
                                            backgroundColor: '#32CD32',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginRight: 10
                                          }}>
                                            <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>
                                              {item.donorName?.charAt(0) || 'A'}
                                            </Text>
                                          </View>
                                        )}
                                        <View style={{ flex: 1 }}>
                                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                                            {item.donorName || 'Anonymous'}
                                          </Text>
                                          <Text style={{ color: '#aaa', fontSize: 12 }}>
                                            {formatDate(item.donationDate || item.$createdAt)}
                                          </Text>
                                        </View>
                                      </View>
                                      <Text style={{ color: '#32CD32', fontWeight: 'bold', fontSize: 16 }}>
                                        {formatCurrency(item.creatorReceives)}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              )}
                            </View>

                            {/* Payout History */}
                            <View>
                              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>
                                Payout History ({payouts.length})
                              </Text>
                              {payouts.length === 0 ? (
                                <Text style={{ color: '#aaa', fontSize: 14, textAlign: 'center', padding: 20 }}>
                                  No payouts yet
                                </Text>
                              ) : (
                                <View>
                                  {payouts.slice(0, 3).map((item) => {
                                    const getStatusColor = (status) => {
                                      switch (status) {
                                        case 'completed': return '#32CD32';
                                        case 'processing': return '#FFA500';
                                        case 'pending': return '#FFD700';
                                        case 'failed': return '#FF4444';
                                        default: return '#aaa';
                                      }
                                    };
                                    
                                    return (
                                      <View
                                        key={item.$id}
                                        style={{
                                          flexDirection: 'row',
                                          justifyContent: 'space-between',
                                          alignItems: 'center',
                                          paddingVertical: 10,
                                          paddingHorizontal: 12,
                                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                          borderRadius: 8,
                                          marginBottom: 6
                                        }}
                                      >
                                        <View style={{ flex: 1 }}>
                                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                                            {formatCurrency(item.amount)}
                                          </Text>
                                          <Text style={{ color: '#aaa', fontSize: 12 }}>
                                            {formatDate(item.createdAt)}
                                          </Text>
                                        </View>
                                        <View style={{
                                          backgroundColor: getStatusColor(item.status) + '20',
                                          paddingHorizontal: 10,
                                          paddingVertical: 4,
                                          borderRadius: 6,
                                          borderWidth: 1,
                                          borderColor: getStatusColor(item.status) + '40'
                                        }}>
                                          <Text style={{ 
                                            color: getStatusColor(item.status), 
                                            fontWeight: '600', 
                                            fontSize: 12,
                                            textTransform: 'capitalize'
                                          }}>
                                            {item.status}
                                          </Text>
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          </>
                        )}
                      </View>
                    )}
                  </View>
                )}
                {/* Buttons Row */}
                {currentUser.$id !== id && (
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                      <TouchableOpacity
                        onPress={handleFollowToggle}
                        style={{
                          borderRadius: 8,
                          shadowColor: '#32CD32',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 4,
                          elevation: 3,
                          marginHorizontal: 6
                        }}
                      >
                        <LinearGradient
                          colors={isFollowing ? ['#444', '#333'] : ['#32CD32', '#228B22']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{
                            paddingHorizontal: 32,
                            paddingVertical: 10,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                            {isFollowing ? t('profile.actions.unfollow') : t('profile.actions.follow')}
                          </Text>
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleMessage}
                        style={{
                          borderRadius: 8,
                          shadowColor: '#8A2BE2',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 4,
                          elevation: 3,
                          marginHorizontal: 6
                        }}
                      >
                        <LinearGradient
                          colors={['#8A2BE2', '#4B0082']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{
                            paddingHorizontal: 32,
                            paddingVertical: 10,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{t('profile.actions.message')}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ backgroundColor: '#222', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, marginHorizontal: 6 }}
                        onPress={() => {
                          Alert.alert(
                            t('profile.actions.profileOptionsTitle'),
                            t('profile.actions.profileOptionsMessage'),
                            [
                              {
                                text: t('profile.actions.reportProfile'),
                                onPress: () => {
                                  Alert.alert(t('profile.actions.reportSuccessTitle'), t('profile.actions.reportSuccessMessage'));
                                },
                                style: "destructive",
                              },
                              {
                                text: t('profile.actions.blockUser'),
                                onPress: () => {
                                  Alert.alert(t('profile.actions.blockSuccessTitle'), t('profile.actions.blockSuccessMessage'));
                                },
                                style: "destructive",
                              },
                              {
                                text: t('profile.actions.cancel'),
                                style: "cancel",
                              },
                            ]
                          );
                        }}
                      >
                        <Image source={icons.menu} style={{ width: 22, height: 22, tintColor: '#fff' }} resizeMode="contain" />
                      </TouchableOpacity>
                    </View>
                    {/* Call Buttons Row */}
                    {profileUser && (
                      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 8, marginBottom: 8, gap: 12 }}>
                        <CallButton 
                          receiverId={profileUser.$id}
                          receiverName={profileUser.username || profileUser.name}
                          callType="video"
                          showLabel={true}
                          style={{ 
                            paddingHorizontal: 20, 
                            paddingVertical: 12,
                            borderRadius: 8,
                            backgroundColor: '#4CAF50',
                            minWidth: 120,
                          }}
                          iconSize={20}
                        />
                        <CallButton 
                          receiverId={profileUser.$id}
                          receiverName={profileUser.username || profileUser.name}
                          callType="audio"
                          showLabel={true}
                          style={{ 
                            paddingHorizontal: 20, 
                            paddingVertical: 12,
                            borderRadius: 8,
                            backgroundColor: '#2196F3',
                            minWidth: 120,
                          }}
                          iconSize={20}
                        />
                      </View>
                    )}
                    {/* Support Creator Button */}
                    <View style={{ alignItems: 'center' }}>
                      <TouchableOpacity
                        onPress={() => router.push({
                          pathname: '/donation',
                          params: { creatorId: profileUser?.$id || id }
                        })}
                        style={{
                          borderRadius: 8,
                          shadowColor: '#32CD32',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.3,
                          shadowRadius: 4,
                          elevation: 3,
                        }}
                      >
                        <LinearGradient
                          colors={['#32CD32', '#228B22']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={{
                            paddingHorizontal: 24,
                            paddingVertical: 8,
                            borderRadius: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', marginRight: 6 }}>💰</Text>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{t('profile.actions.supportCreator')}</Text>
                        </LinearGradient>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                {/* Bio and Link */}
                {/* {profileUser?.bio && (
                  <Text style={{ color: '#fff', fontSize: 15, textAlign: 'center', marginBottom: 6 }}>{profileUser.bio}</Text>
                )} */}
                {/* {profileUser?.link && (
                  <TouchableOpacity onPress={() => Linking.openURL(profileUser.link)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                    <Image source={icons.link} style={{ width: 16, height: 16, marginRight: 4, tintColor: '#3ec6ff' }} />
                    <Text style={{ color: '#3ec6ff', fontSize: 15 }}>{profileUser.link}</Text>
                  </TouchableOpacity>
                )} */}
              </ImageBackground>
            )}
          />
        </View>
                 {/* Full Screen Video Modal */}
                   <Modal
            visible={modalVisible}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setModalVisible(false)}
            style={{ backgroundColor: '#000' }}
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
                  <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
               {/* Close Button */}
               <TouchableOpacity onPress={() => setModalVisible(false)} style={{ position: 'absolute', top: 40, right: 20, zIndex: 10 }}>
                 <Text style={{ color: '#fff', fontSize: 28 }}>×</Text>
               </TouchableOpacity>
               
                               {/* Media */}
                <View style={{ flex: 1, backgroundColor: '#000', position: 'relative' }}>
                  {isVideoMedia(modalVideo?.video, modalVideo?.postType) ? (
                    <>
                      <Video
                        ref={modalVideoRef}
                        source={{ uri: modalVideo.video }}
                        style={{ flex: 1, width: '100%', height: '100%' }}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={isVideoPlaying}
                        isLooping={true}
                        isMuted={false}
                        useNativeControls={false}
                        progressUpdateIntervalMillis={250}
                        posterSource={modalVideo.thumbnail ? { uri: modalVideo.thumbnail } : undefined}
                        onLoad={(status) => {
                          if (status.isLoaded) {
                            setPlaybackDuration(status.durationMillis || 0);
                            setIsVideoReady(true);
                          }
                        }}
                        onPlaybackStatusUpdate={status => {
                          if (status.isLoaded) {
                            setPlaybackPosition(status.positionMillis || 0);
                            if (status.durationMillis) {
                              setPlaybackDuration(status.durationMillis);
                            }
                          }
                        }}
                        onError={(error) => {
                        }}
                        onLoadStart={() => {
                        }}
                        onReadyForDisplay={() => {
                          if (isVideoPlaying) {
                            modalVideoRef.current?.playAsync?.();
                          }
                        }}
                        {...(Platform.OS === 'ios' && {
                          allowsExternalPlayback: false,
                          playInSilentModeIOS: true,
                          ignoreSilentSwitch: 'ignore',
                          automaticallyWaitsToMinimizeStalling: false,
                          preferredForwardBufferDuration: 0,
                        })}
                      />
                      
                      {/* Video Control Overlay - Only shows progress bar, doesn't pause/play */}
                      <TouchableOpacity
                        onPress={() => {
                          setShowProgressBar(true);
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
                      {/* Progress Bar */}
                      <VideoProgressBar
                        videoRef={modalVideoRef}
                        playbackPosition={playbackPosition}
                        playbackDuration={playbackDuration}
                        isVideoReady={isVideoReady}
                        showProgressBar={showProgressBar}
                        onShowProgressBar={setShowProgressBar}
                        bottomOffset={20}
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
                          backgroundColor: 'rgba(255, 255, 255, 0.2)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          zIndex: 5
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 24 }}>
                          {isVideoPlaying ? '❚❚' : '▶'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <Image
                      source={{ uri: modalVideo?.photo || modalVideo?.thumbnail || modalVideo?.video }}
                      style={{ flex: 1, width: '100%', height: '100%' }}
                      resizeMode="contain"
                    />
                  )}
                  
                  {/* Fallback thumbnail if video doesn't load */}
                  {isVideoMedia(modalVideo?.video, modalVideo?.postType) && modalVideo.thumbnail && (
                    <Image
                      source={{ uri: modalVideo.thumbnail }}
                      style={{ 
                        position: 'absolute', 
                        top: 0, 
                        left: 0, 
                        width: '100%', 
                        height: '100%',
                        opacity: 0.3
                      }}
                      resizeMode="cover"
                    />
                  )}
                </View>
                
               {/* Right Side Interaction Buttons - TikTok Style */}
               <View style={{ position: 'absolute', right: 15, bottom: 150, zIndex: 10 }}>
                 {/* Profile Picture */}
                 <TouchableOpacity style={{ marginBottom: 15, alignItems: 'center' }}>
                   <View style={{ position: 'relative' }}>
                     <Image
                       source={{ uri: modalVideo.creator?.avatar || profileUser?.avatar }}
                       style={{ width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: '#fff' }}
                       resizeMode="cover"
                     />
                     <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: '#007AFF', width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}>
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
                 <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                   {formatCount(likeCount)}
                 </Text>
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
                    {bookmarked ? t('profile.general.saved') : t('profile.general.save')}
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

               {/* Bottom Left Video Information - TikTok Style */}
               <View style={{ position: 'absolute', bottom: 120, left: 15, right: 80, zIndex: 10 }}>
                 <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                   <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginRight: 8 }}>
                     @{modalVideo.creator?.username || profileUser?.username}
                   </Text>
                   
                 </View>
                 <Text style={{ color: '#fff', fontSize: 14, marginBottom: 8, lineHeight: 18, flexWrap: 'wrap' }}>
                   {t('profile.general.videoTitle', { title: modalVideo.title || t('profile.general.untitled') })}
                 </Text>
                 <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                   <Text style={{ color: '#fff', fontSize: 12, marginRight: 5 }}>♫</Text>
                   <Text style={{ color: '#fff', fontSize: 12 }}>
                     {t('profile.general.originalSound', { username: modalVideo.creator?.username || profileUser?.username })}
                   </Text>
                 </View>
                 <Text style={{ color: '#fff', fontSize: 12, opacity: 0.8 }}>
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
                   <View style={{ backgroundColor: '#22223bd3', borderTopLeftRadius: 18, borderTopRightRadius: 18, width: '100%', maxHeight: '80%', paddingBottom: 0 }}>
                     <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                       <View style={{ width: 40, height: 4, backgroundColor: '#444', borderRadius: 2, marginBottom: 4 }} />
                       <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{t('profile.modals.commentsTitle')}</Text>
                     </View>
                    {loadingComments ? (
                      <ActivityIndicator color="#a77df8" size="large" style={{ marginVertical: 24 }} />
                    ) : comments.length === 0 ? (
                      <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                        <Text style={{ color: '#aaa', fontSize: 16 }}>No comments yet</Text>
                      </View>
                    ) : (
                      <FlatList
                        data={comments}
                        keyExtractor={c => c.$id}
                        renderItem={({ item: c }) => {
                          const isLiked = Array.isArray(c.likes) ? c.likes.includes(currentUser?.$id) : false;
                          const likesCount = Array.isArray(c.likes) ? c.likes.length : 0;
                          return (
                            <View style={{ marginBottom: 14, paddingHorizontal: 16 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <Image source={{ uri: c.avatar || images.profile }} style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }} />
                                <View style={{ flex: 1, flexShrink: 1 }}>
                                  <Text style={{ color: '#a77df8', fontWeight: 'bold', fontSize: 15 }}>{c.username || c.userId}</Text>
                                  <Text style={{ color: '#fff', fontSize: 16, flexWrap: 'wrap' }}>{c.content}</Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                                    <TouchableOpacity 
                                      onPress={() => handleLikeComment(c.$id, c.likes)}
                                      style={{ flexDirection: 'row', alignItems: 'center', marginRight: 16 }}
                                    >
                                      <Text style={{ color: isLiked ? '#ff4757' : '#aaa', fontSize: 14, marginRight: 4 }}>
                                        {isLiked ? '❤️' : '🤍'}
                                      </Text>
                                      <Text style={{ color: '#aaa', fontSize: 12 }}>{likesCount > 0 ? likesCount : ''}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                      onPress={() => {
                                        setReplyingTo(c);
                                        setReplyText("");
                                      }}
                                      style={{ marginRight: 16 }}
                                    >
                                      <Text style={{ color: '#aaa', fontSize: 12 }}>Reply</Text>
                                    </TouchableOpacity>
                                    <Text style={{ color: '#aaa', fontSize: 11 }}>{new Date(c.createdAt).toLocaleString()}</Text>
                                  </View>
                                  {replyingTo?.$id === c.$id && (
                                    <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#333' }}>
                                      <TextInput
                                        value={replyText}
                                        onChangeText={setReplyText}
                                        placeholder="Write a reply..."
                                        placeholderTextColor="#aaa"
                                        style={{ backgroundColor: '#333', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 8 }}
                                        multiline
                                      />
                                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                                        <TouchableOpacity
                                          onPress={() => {
                                            setReplyingTo(null);
                                            setReplyText("");
                                          }}
                                          style={{ marginRight: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                                        >
                                          <Text style={{ color: '#aaa', fontSize: 14 }}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                          onPress={() => handleAddReply(c.$id)}
                                          disabled={!replyText.trim() || postingReply}
                                          style={{ backgroundColor: postingReply ? '#888' : '#a77df8', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
                                        >
                                          <Text style={{ color: '#fff', fontSize: 14 }}>{postingReply ? 'Posting...' : 'Reply'}</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  )}
                                  {c.replies && Array.isArray(c.replies) && c.replies.length > 0 && (
                                    <View style={{ marginTop: 8, paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: '#333' }}>
                                      {c.replies.map((reply) => {
                                        const isReplyLiked = Array.isArray(reply.likes) ? reply.likes.includes(currentUser?.$id) : false;
                                        const replyLikesCount = Array.isArray(reply.likes) ? reply.likes.length : 0;
                                        return (
                                          <View key={reply.$id} style={{ marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start' }}>
                                            <Image source={{ uri: reply.avatar || images.profile }} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }} />
                                            <View style={{ flex: 1, flexShrink: 1 }}>
                                              <Text style={{ color: '#a77df8', fontWeight: 'bold', fontSize: 13 }}>{reply.username || reply.userId}</Text>
                                              <Text style={{ color: '#fff', fontSize: 14, flexWrap: 'wrap' }}>{reply.content}</Text>
                                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                <TouchableOpacity 
                                                  onPress={() => handleLikeComment(reply.$id, reply.likes)}
                                                  style={{ flexDirection: 'row', alignItems: 'center', marginRight: 12 }}
                                                >
                                                  <Text style={{ color: isReplyLiked ? '#ff4757' : '#aaa', fontSize: 12, marginRight: 4 }}>
                                                    {isReplyLiked ? '❤️' : '🤍'}
                                                  </Text>
                                                  <Text style={{ color: '#aaa', fontSize: 11 }}>{replyLikesCount > 0 ? replyLikesCount : ''}</Text>
                                                </TouchableOpacity>
                                                <Text style={{ color: '#aaa', fontSize: 10 }}>{new Date(reply.createdAt).toLocaleString()}</Text>
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
                        style={{ maxHeight: 400, marginBottom: 8 }}
                        showsVerticalScrollIndicator={false}
                      />
                    )}
                     <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingBottom: 12, backgroundColor: '#22223b' }}>
                       <TextInput
                         value={newComment}
                         onChangeText={setNewComment}
                         placeholder={t('profile.modals.addCommentPlaceholder')}
                         placeholderTextColor="#aaa"
                         multiline={true}
                         style={{ flex: 1, backgroundColor: '#333', color: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, minHeight: 40, maxHeight: 120, textAlignVertical: 'top' }}
                         editable={!posting}
                       />
                       <TouchableOpacity
                         onPress={handleAddComment}
                         disabled={posting || !newComment.trim()}
                         style={{ marginLeft: 8, backgroundColor: posting ? '#888' : '#a77df8', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 12, alignSelf: 'flex-end' }}
                       >
                         <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                           {posting ? t('profile.modals.posting') : t('profile.modals.post')}
                         </Text>
                       </TouchableOpacity>
                     </View>
                     <TouchableOpacity onPress={() => setCommentsModalVisible(false)} style={{ alignSelf: 'center', backgroundColor: '#444', paddingHorizontal: 32, paddingVertical: 10, borderRadius: 8, marginBottom: 12, marginTop: 2 }}>
                       <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>{t('profile.modals.close')}</Text>
                     </TouchableOpacity>
                   </View>
                 </KeyboardAvoidingView>
               </Modal>
             </SafeAreaView>
           </PanGestureHandler>
         </GestureHandlerRootView>
       )}
     </Modal>
   </SafeAreaView>
 </>
);
};

export default UserProfile; 

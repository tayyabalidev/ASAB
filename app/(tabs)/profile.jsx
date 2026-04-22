import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Image, FlatList, TouchableOpacity, Modal, Text, TextInput, Alert, Platform, ScrollView, ActivityIndicator, KeyboardAvoidingView, Share, Linking, useWindowDimensions } from "react-native";
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import { icons } from "../../constants";
import useAppwrite from "../../lib/useAppwrite";
import { getUserPosts, signOut, updateUserProfile, uploadFile, handleProfileAccessRequest, getFollowers, getFollowing, getComments, addComment, toggleBookmark, isVideoBookmarked, getShareCount, incrementShareCount, getNotifications, databases, appwriteConfig, getVideoById, toggleFollowUser, getUserPhotos, getPhotoById, deleteVideoPost, deletePhotoPost, getUserBookmarks, getCreatorTotalDonations, getPendingPayoutAmount, getCreatorDonations, getCreatorPayouts, createPayout, createStripeAccount, createAccountLink, getStripeAccountStatus, updateUserStripeAccount, deleteAccount, toggleLike, isPostLiked, getLikeCount, getIOSCompatibleVideoUrl, getVideoPosterUri } from "../../lib/appwrite";
import { getPlaybackUriForPost, getGridThumbnailUriForPost } from "../../lib/muxPlayback";
import { useGlobalContext } from "../../context/GlobalProvider";
import { EmptyState, InfoBox, VideoCard, ThemeToggle, VideoProgressBar } from "../../components";
import { images } from "../../constants";
import { useTranslation } from "react-i18next";
import { isAdminUser } from "../../lib/admin";
import { isVideoMedia, isMuxPlaceholderVideo } from "../../lib/mediaType";

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
  

  // Handle Stripe Connect deep link callback
  useEffect(() => {
    const handleStripeConnectCallback = async (url) => {
      if (url && url.includes('earnings') && url.includes('connected=true')) {
        
        // Extract account ID from URL if present
        const urlParams = new URLSearchParams(url.split('?')[1] || '');
        const accountIdFromUrl = urlParams.get('accountId');
        
        // Refresh Stripe account status
        const accountIdToCheck = accountIdFromUrl || stripeAccountId || user?.stripeAccountId;
        if (accountIdToCheck) {
          try {
            const status = await getStripeAccountStatus(accountIdToCheck);
            setStripeAccountStatus(status);
            setStripeAccountId(accountIdToCheck);
            
            // Show success message
            if (status.transfersEnabled) {
              Alert.alert(
                'Account Connected!',
                'Your Stripe account has been successfully connected and verified. You can now receive automatic payouts!',
                [{ text: 'OK' }]
              );
            } else if (status.detailsSubmitted) {
              Alert.alert(
                'Account Setup In Progress',
                'Your account details have been submitted. Stripe is reviewing your information. You will be notified when verification is complete.',
                [{ text: 'OK' }]
              );
            }
            
            // Refresh earnings data
            if (user?.$id) {
              const [total, pending] = await Promise.all([
                getCreatorTotalDonations(user.$id),
                getPendingPayoutAmount(user.$id)
              ]);
              setTotalEarnings(total || 0);
              setPendingPayout(pending || 0);
            }
          } catch (error) {
          }
        }
      }
    };

    // Listen for deep links
    const subscription = Linking.addEventListener('url', (event) => {
      handleStripeConnectCallback(event.url);
    });

    // Check initial URL (when app opens from deep link)
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleStripeConnectCallback(url);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [stripeAccountId, user?.$id, user?.stripeAccountId]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      // Refresh posts and photos when profile screen comes into focus
      if (refetchPosts) {
        refetchPosts();
      }
      if (refetchPhotos) {
        refetchPhotos();
      }
      // Bookmarks will be refreshed automatically by useEffect when activeSection is 'bookmarks'
      
      // Check if user returned from Stripe onboarding
      // Refresh Stripe status when screen comes into focus
      if (user?.stripeAccountId && showEarningsDashboard) {
        getStripeAccountStatus(user.stripeAccountId)
          .then(status => {
            setStripeAccountStatus(status);
          })
          .catch(err => {
          });
      }
    }, [refetchPosts, refetchPhotos, user?.stripeAccountId, showEarningsDashboard])
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
  const [newBio, setNewBio] = useState(user?.bio || "");
  const [newBirthday, setNewBirthday] = useState(user?.birthday || "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Re-enable privacy states
  const [isPrivate, setIsPrivate] = useState(user?.isPrivate || false);
  const [pendingRequests, setPendingRequests] = useState(user?.pendingRequests || []);
  const [editFocusKey, setEditFocusKey] = useState(null);
  const [usernameShowError, setUsernameShowError] = useState(false);

  // Video playback state
  const [playingVideo, setPlayingVideo] = useState(null);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  
  // TikTok-style video modal state
  const [modalVideo, setModalVideo] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalIndex, setModalIndex] = useState(0);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const modalVideoRef = useRef(null);
  const recentLikeActionRef = useRef(false);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [showProgressBar, setShowProgressBar] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  
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
  const [shareCount, setShareCount] = useState(0);
  
 
  // Following/Followers modal state
  const [followModalVisible, setFollowModalVisible] = useState(false);
  const [followModalType, setFollowModalType] = useState(''); // 'following' or 'followers'
  const [followModalData, setFollowModalData] = useState([]);

  // Earnings Dashboard state
  const [showEarningsDashboard, setShowEarningsDashboard] = useState(false);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [pendingPayout, setPendingPayout] = useState(0);
  const [donations, setDonations] = useState([]);
  const [donationsWithDonors, setDonationsWithDonors] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loadingEarnings, setLoadingEarnings] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState(user?.stripeAccountId || null);
  const [stripeAccountStatus, setStripeAccountStatus] = useState(null);
  const [linkingStripe, setLinkingStripe] = useState(false);

  // Profile section state
  const [activeSection, setActiveSection] = useState('videos'); // 'videos', 'pics', or 'bookmarks'
  
  // Bookmarks state
  const [bookmarks, setBookmarks] = useState([]);
  const [bookmarksLoading, setBookmarksLoading] = useState(false);
  const [bookmarkedPosts, setBookmarkedPosts] = useState([]); // Full post data
  
  // Photo modal state
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  
  // Notification count state
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const MINIMUM_PROFILE_AGE = 18;
  
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

  // Function to handle section change
  const handleSectionChange = (section) => {
    setActiveSection(section);
  };

  // Fetch bookmarks when bookmarks section is active
  useEffect(() => {
    const fetchBookmarks = async () => {
      if (activeSection === 'bookmarks' && user?.$id) {
        setBookmarksLoading(true);
        try {
          const bookmarkList = await getUserBookmarks(user.$id);
          setBookmarks(bookmarkList);
          
          // Fetch full post data for each bookmark
          const postsData = [];
          for (const bookmark of bookmarkList) {
            try {
              // Try to determine postType from postData, or try both collections
              let postType = 'video';
              try {
                const postData = JSON.parse(bookmark.postData);
                postType = postData.postType || postData.pt || 'video';
              } catch (e) {
                // If parsing fails, try to determine by attempting to fetch
              }
              
              // Try to fetch as video first
              if (postType === 'video' || !postType) {
                try {
                  const video = await getVideoById(bookmark.postId);
                  postsData.push({ ...video, postType: 'video', bookmarkId: bookmark.$id });
                  continue;
                } catch (videoError) {
                  // If video fetch fails, try as photo
                  try {
                    const photo = await getPhotoById(bookmark.postId);
                    postsData.push({ ...photo, postType: 'photo', bookmarkId: bookmark.$id });
                    continue;
                  } catch (photoError) {
                  }
                }
              } else {
                // postType is 'photo', fetch as photo
                try {
                  const photo = await getPhotoById(bookmark.postId);
                  postsData.push({ ...photo, postType: 'photo', bookmarkId: bookmark.$id });
                } catch (error) {
                  // If photo fetch fails, try as video
                  try {
                    const video = await getVideoById(bookmark.postId);
                    postsData.push({ ...video, postType: 'video', bookmarkId: bookmark.$id });
                  } catch (videoError) {
                  }
                }
              }
            } catch (error) {
              
            }
          }
          setBookmarkedPosts(postsData);
        } catch (error) {
          setBookmarks([]);
          setBookmarkedPosts([]);
        } finally {
          setBookmarksLoading(false);
        }
      }
    };

    fetchBookmarks();
  }, [activeSection, user?.$id]);

  // Fetch earnings data
  useEffect(() => {
    const fetchEarningsData = async () => {
      if (!user?.$id) return;
      
      try {
        setLoadingEarnings(true);
        const [total, pending, donationsList, payoutsList] = await Promise.all([
          getCreatorTotalDonations(user.$id),
          getPendingPayoutAmount(user.$id),
          getCreatorDonations(user.$id),
          getCreatorPayouts(user.$id)
        ]);
        
        setTotalEarnings(total || 0);
        setPendingPayout(pending || 0);
        setDonations(donationsList || []);
        setPayouts(payoutsList || []);
        
        // Fetch donor details for donations
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
        
        // Check Stripe account status if account ID exists
        if (user?.stripeAccountId) {
          try {
            const status = await getStripeAccountStatus(user.stripeAccountId);
            setStripeAccountStatus(status);
            setStripeAccountId(user.stripeAccountId);
          } catch (error) {
          }
        }
      } catch (error) {
      } finally {
        setLoadingEarnings(false);
      }
    };

    fetchEarningsData();
  }, [user?.$id, user?.stripeAccountId]);

  // Calculate total likes from all posts
  const totalLikes = posts?.reduce((total, post) => total + (post.likes?.length || 0), 0) || 0;

  // Helper functions for earnings
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

  const birthdayToInput = (value = "") => {
    if (!value) return "";
    if (value.includes("/")) return normalizeBirthdayInput(value);
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const year = String(parsed.getFullYear());
    return `${month}/${day}/${year}`;
  };

  const normalizeBirthdayInput = (value = "") => {
    const digitsOnly = value.replace(/\D/g, "").slice(0, 8);
    if (digitsOnly.length <= 2) return digitsOnly;
    if (digitsOnly.length <= 4) {
      return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2)}`;
    }
    return `${digitsOnly.slice(0, 2)}/${digitsOnly.slice(2, 4)}/${digitsOnly.slice(4)}`;
  };

  const parseBirthday = (value = "") => {
    const parts = value.split("/");
    if (parts.length !== 3) return null;
    const month = Number(parts[0]);
    const day = Number(parts[1]);
    const year = Number(parts[2]);
    if (!month || !day || !year) return null;
    const candidate = new Date(year, month - 1, day);
    const isValid =
      candidate.getFullYear() === year &&
      candidate.getMonth() === month - 1 &&
      candidate.getDate() === day;
    return isValid ? candidate : null;
  };

  const toBirthdayIso = (birthDate) => {
    if (!birthDate) return "";
    const year = birthDate.getFullYear();
    const month = String(birthDate.getMonth() + 1).padStart(2, "0");
    const day = String(birthDate.getDate()).padStart(2, "0");
    // Noon UTC avoids timezone shifts when client parses date for display.
    return `${year}-${month}-${day}T12:00:00.000Z`;
  };

  const formatBirthdayDisplay = (value = "") => {
    if (!value) return "";
    if (value.includes("/")) return value;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getAgeFromDate = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age -= 1;
    }
    return age;
  };

  const handleLinkStripeAccount = async () => {
    try {
      setLinkingStripe(true);
      
      let accountId = stripeAccountId;
      
      // If no account exists, create one
      if (!accountId) {
        try {
          const accountResult = await createStripeAccount(
            user.$id,
            user.email,
            'US' // Default country, can be made configurable
          );
          accountId = accountResult.accountId;
          
          // Save account ID to user profile
          await updateUserStripeAccount(user.$id, accountId);
          setStripeAccountId(accountId);
          
          // Update user object
          const updatedUser = { ...user, stripeAccountId: accountId };
          setUser(updatedUser);
        } catch (accountError) {
          // Check if Stripe Connect is not enabled
          if (accountError.message?.includes('Connect') || accountError.message?.includes('requiresConnect')) {
            Alert.alert(
              'Stripe Connect Required',
              'Stripe Connect is not enabled on your account.\n\n' +
              'To enable automatic payouts:\n' +
              '1. Go to Stripe Dashboard\n' +
              '2. Settings → Connect\n' +
              '3. Enable Stripe Connect\n\n' +
              'For now, payouts will be processed manually by the admin.',
              [
                { text: 'OK' },
                {
                  text: 'Open Stripe Dashboard',
                  onPress: () => Linking.openURL('https://dashboard.stripe.com/settings/connect')
                }
              ]
            );
            return;
          }
          throw accountError;
        }
      }
      
      // Create account link for onboarding
      // Use the app scheme from app.json: com.bilal.asab
      const returnUrl = `com.bilal.asab://earnings?connected=true&accountId=${accountId}`;
      const refreshUrl = `com.bilal.asab://earnings`;
      
      const linkResult = await createAccountLink(accountId, returnUrl, refreshUrl);
      
      // Open Stripe onboarding in browser
      const canOpen = await Linking.canOpenURL(linkResult.url);
      if (canOpen) {
        await Linking.openURL(linkResult.url);
        Alert.alert(
          'Stripe Onboarding',
          'You will be redirected to Stripe to complete your account setup. Return to the app when finished.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Cannot open Stripe onboarding link');
      }
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to link Stripe account. Please try again.');
    } finally {
      setLinkingStripe(false);
    }
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
                creatorId: user.$id,
                amount: pendingPayout,
                donationIds: donationIds,
                status: 'pending',
                payoutMethod: 'stripe'
              });

              Alert.alert('Success', 'Withdrawal request submitted successfully! It will be processed by the admin.');
              
              // Refresh earnings data
              const [total, pending, donationsList, payoutsList] = await Promise.all([
                getCreatorTotalDonations(user.$id),
                getPendingPayoutAmount(user.$id),
                getCreatorDonations(user.$id),
                getCreatorPayouts(user.$id)
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

  const logout = async () => {
    await signOut();
    setUser(null);
    setIsLogged(false);
    router.replace("/sign-in");
  };

  // Delete Account - App Store Compliance (Guideline 5.1.1)
  const handleDeleteAccount = () => {
    Alert.alert(
      t('profile.deleteAccount.title', 'Delete Account'),
      t('profile.deleteAccount.message', 'Are you sure you want to delete your account? This action cannot be undone. All your data, posts, and content will be permanently deleted.'),
      [
        {
          text: t('common.cancel', 'Cancel'),
          style: 'cancel'
        },
        {
          text: t('profile.deleteAccount.confirm', 'Delete Account'),
          style: 'destructive',
          onPress: async () => {
            try {
              // Show confirmation dialog
              Alert.alert(
                t('profile.deleteAccount.finalTitle', 'Final Confirmation'),
                t('profile.deleteAccount.finalMessage', 'This will permanently delete your account and all associated data. This cannot be undone. Are you absolutely sure?'),
                [
                  {
                    text: t('common.cancel', 'Cancel'),
                    style: 'cancel'
                  },
                  {
                    text: t('profile.deleteAccount.delete', 'Yes, Delete My Account'),
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteAccount();
                        // Clear user state
                        setUser(null);
                        setIsLogged(false);
                        // Navigate to sign in
                        Alert.alert(
                          t('profile.deleteAccount.successTitle', 'Account Deleted'),
                          t('profile.deleteAccount.successMessage', 'Your account has been permanently deleted.'),
                          [
                            {
                              text: t('common.ok', 'OK'),
                              onPress: () => {
                                router.replace("/(auth)/sign-in");
                              }
                            }
                          ]
                        );
                      } catch (error) {
                        Alert.alert(
                          t('common.error', 'Error'),
                          error.message || t('profile.deleteAccount.error', 'Failed to delete account. Please try again.')
                        );
                      }
                    }
                  }
                ]
              );
            } catch (error) {
              Alert.alert(
                t('common.error', 'Error'),
                error.message || t('profile.deleteAccount.error', 'Failed to delete account. Please try again.')
              );
            }
          }
        }
      ]
    );
  };

  const openEditModal = () => {
    setNewUsername(user?.username || "");
    setNewAvatar(user?.avatar || "");
    setNewBio(user?.bio || "");
    setNewBirthday(birthdayToInput(user?.birthday || ""));
    // Re-enable privacy states
    setIsPrivate(user?.isPrivate || false);
    setPendingRequests(user?.pendingRequests || []);
    setEditFocusKey(null);
    setUsernameShowError(false);
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
      setUsernameShowError(true);
      Alert.alert(t('common.error'), t('profile.alerts.usernameEmpty'));
      return;
    }
    const trimmedBirthday = newBirthday.trim();
    let birthdayToStore = "";
    if (trimmedBirthday) {
      const parsedBirthday = parseBirthday(trimmedBirthday);
      if (!parsedBirthday) {
        Alert.alert(t('common.error'), "Birthday must be in MM/DD/YYYY format");
        return;
      }
      const age = getAgeFromDate(parsedBirthday);
      if (age < MINIMUM_PROFILE_AGE) {
        Alert.alert(
          t('common.error'),
          `You must be at least ${MINIMUM_PROFILE_AGE} years old to use the app`
        );
        return;
      }
      birthdayToStore = toBirthdayIso(parsedBirthday);
    }
    setSaving(true);
    try {
      // Re-enable isPrivate parameter
      const updatedUser = await updateUserProfile(
        user.$id,
        newUsername,
        newAvatar,
        isPrivate,
        newBio.trim(),
        birthdayToStore
      );
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
    setShowProgressBar(false);
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
      setIsVideoReady(false);
      setShowProgressBar(false);
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
      setIsVideoReady(false);
      setShowProgressBar(false);
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


  // Check bookmark status and share count when modal video changes
  useEffect(() => {
    if (!modalVideo || !user?.$id) return;
    let isMounted = true;

    const checkBookmarkStatus = async () => {
      try {
        const bookmarked = await isVideoBookmarked(user.$id, modalVideo.$id);
        if (isMounted) setBookmarked(bookmarked);
      } catch (error) {
      }
    };
    const fetchShareCount = async () => {
      try {
        const shares = await getShareCount(modalVideo.$id);
        if (isMounted) setShareCount(shares);
      } catch (error) {
      }
    };
    const checkLikeStatus = async () => {
      try {
        const isLiked = await isPostLiked(user.$id, modalVideo.$id);
        if (isMounted) setLiked(isLiked);
      } catch (error) {
      }
    };
    const fetchLikeCount = async () => {
      try {
        const likes = await getLikeCount(modalVideo.$id);
        if (isMounted) setLikeCount(likes);
      } catch (error) {
      }
    };

    checkBookmarkStatus();
    fetchShareCount();
    checkLikeStatus();
    fetchLikeCount();
    return () => { isMounted = false; };
  }, [modalVideo, user?.$id]);

  const handleLike = async () => {
    if (!user?.$id || !modalVideo?.$id) {
      Alert.alert(t("common.error"), t("auth.signInRequired") || "Please login to like posts");
      return;
    }

    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      const newLikeStatus = await toggleLike(user.$id, modalVideo.$id);
      setLiked(newLikeStatus);
      const updatedLikeCount = await getLikeCount(modalVideo.$id);
      setLikeCount(updatedLikeCount);
    } catch (error) {
      // Revert optimistic update on error
      setLiked(!nextLiked);
      setLikeCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  // Track loaded thumbnails to prevent reloading
  const loadedThumbnailsRef = useRef(new Set());

  // Fetch unread notification count
  useEffect(() => {
    let isMounted = true;

    const fetchNotificationCount = async () => {
      if (!user?.$id) return;
      try {
        const notifications = await getNotifications(user.$id);
        if (!isMounted) return;
        const unreadCount = notifications.filter(n => !n.isRead || n.isRead === false).length;
        setUnreadNotificationCount(unreadCount);
      } catch (error) {
      }
    };

    fetchNotificationCount();
    const intervalId = setInterval(fetchNotificationCount, 3000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
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

  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const profileEditBirthdayHint = useMemo(() => {
    const birthdayTrim = newBirthday.trim();
    if (!birthdayTrim) {
      return { variant: "neutral", message: `Optional · ${MINIMUM_PROFILE_AGE}+ · MM/DD/YYYY` };
    }
    if (birthdayTrim.length < 10) {
      return { variant: "neutral", message: "Complete MM/DD/YYYY." };
    }
    const parsedBirthday = parseBirthday(birthdayTrim);
    if (!parsedBirthday) {
      return { variant: "error", message: "That date is not valid." };
    }
    const age = getAgeFromDate(parsedBirthday);
    if (age < MINIMUM_PROFILE_AGE) {
      return { variant: "error", message: `Must be at least ${MINIMUM_PROFILE_AGE} years old.` };
    }
    return { variant: "success", message: "Date looks good." };
  }, [newBirthday]);

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
          {/* Header — compact toolbar on same background + overlay */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 14,
            }}
          >
            <TouchableOpacity
              onPress={logout}
              accessibilityRole="button"
              accessibilityLabel={t("profile.header.logout", "Log out")}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: themedColor("rgba(0,0,0,0.28)", "rgba(255,255,255,0.55)"),
                borderWidth: 1,
                borderColor: themedColor("rgba(255,255,255,0.12)", "rgba(15,23,42,0.08)"),
              }}
            >
              <Image source={icons.logout} resizeMode="contain" style={{ width: 22, height: 22 }} />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity
                onPress={() => router.push("/chat")}
                accessibilityRole="button"
                style={{ position: "relative" }}
              >
                <Image
                  source={icons.messages}
                  resizeMode="contain"
                  style={{ width: 66, height: 66, tintColor: theme.textPrimary }}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push("/inbox")}
                accessibilityRole="button"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: themedColor("rgba(0,0,0,0.28)", "rgba(255,255,255,0.55)"),
                  borderWidth: 1,
                  borderColor: themedColor("rgba(255,255,255,0.12)", "rgba(15,23,42,0.08)"),
                }}
              >
                <Feather name="bell" size={20} color={theme.textPrimary} />
                {unreadNotificationCount > 0 ? (
                  <View
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      backgroundColor: theme.danger,
                      borderRadius: 10,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 5,
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 2,
                      borderColor: themedColor("rgba(15,23,42,0.9)", "#fff"),
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
                      {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openEditModal}
                accessibilityRole="button"
                accessibilityLabel={t("profile.modals.editTitle")}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: themedColor("rgba(0,0,0,0.28)", "rgba(255,255,255,0.55)"),
                  borderWidth: 1,
                  borderColor: themedColor("rgba(255,255,255,0.12)", "rgba(15,23,42,0.08)"),
                }}
              >
                <Image source={icons.menu} resizeMode="contain" style={{ width: 24, height: 24 }} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Profile hero card */}
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            <View
              style={{
                alignSelf: "center",
                width: "100%",
                maxWidth: Math.min(440, windowWidth - 32),
                padding: 22,
                borderRadius: 20,
                backgroundColor: themedColor("rgba(15,23,42,0.58)", "rgba(255,255,255,0.94)"),
                borderWidth: 1,
                borderColor: themedColor("rgba(148,163,184,0.22)", theme.border),
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDarkMode ? 0.35 : 0.1,
                shadowRadius: 20,
                elevation: 8,
              }}
            >
            <View style={{ alignItems: "center" }}>
              <View
                style={{
                  width: 108,
                  height: 108,
                  borderRadius: 54,
                  padding: 3,
                  backgroundColor: theme.accentSoft,
                  marginBottom: 16,
                }}
              >
                <View
                  style={{
                    flex: 1,
                    borderRadius: 51,
                    backgroundColor: theme.surface,
                    borderWidth: 2,
                    borderColor: theme.card,
                    overflow: "hidden",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {user?.avatar ? (
                    <Image source={{ uri: user.avatar }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                  ) : (
                    <Text style={{ color: theme.textPrimary, fontSize: 34, fontWeight: "700" }}>
                      {getUserInitials(user?.username)}
                    </Text>
                  )}
                </View>
              </View>

              <Text
                style={{
                  color: theme.textPrimary,
                  fontSize: 24,
                  fontWeight: "700",
                  letterSpacing: -0.3,
                  textAlign: "center",
                  marginBottom: 4,
                }}
              >
                {user?.username || t("profile.general.userPlaceholder")}
              </Text>
              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 15,
                  fontWeight: "500",
                  marginBottom: 10,
                }}
              >
                @{user?.username || t("profile.general.handlePlaceholder")}
              </Text>

              {user?.isPrivate ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: theme.accentSoft,
                    borderWidth: 1,
                    borderColor: theme.accent,
                    marginBottom: 14,
                  }}
                >
                  <Feather name="lock" size={14} color={theme.accent} />
                  <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "700" }}>
                    {t("profile.badges.private", "Private profile")}
                  </Text>
                </View>
              ) : null}

              {/* Stats row */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  width: "100%",
                  marginTop: user?.isPrivate ? 0 : 6,
                  marginBottom: 18,
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                  borderRadius: 14,
                  backgroundColor: themedColor("rgba(0,0,0,0.2)", "rgba(248,250,252,0.95)"),
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <TouchableOpacity
                  style={{ flex: 1, alignItems: "center" }}
                  onPress={() => openFollowModal("following")}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: "800" }}>
                    {following?.length || 0}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                    {t("profile.stats.following")}
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 1, height: 40, backgroundColor: theme.divider }} />
                <TouchableOpacity
                  style={{ flex: 1, alignItems: "center" }}
                  onPress={() => openFollowModal("followers")}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: "800" }}>
                    {followers?.length || 0}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                    {t("profile.stats.followers")}
                  </Text>
                </TouchableOpacity>
                <View style={{ width: 1, height: 40, backgroundColor: theme.divider }} />
                <View style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ color: theme.textPrimary, fontSize: 20, fontWeight: "800" }}>{totalLikes}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                    {t("profile.stats.likes")}
                  </Text>
                </View>
              </View>

              {user?.bio || user?.birthday ? (
                <View
                  style={{
                    width: "100%",
                    borderRadius: 14,
                    padding: 14,
                    backgroundColor: themedColor("rgba(0,0,0,0.18)", theme.surfaceMuted),
                    borderWidth: 1,
                    borderColor: theme.border,
                  }}
                >
                  <Text
                    style={{
                      color: theme.textMuted,
                      fontSize: 11,
                      fontWeight: "700",
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    {t("profile.hero.about", "About")}
                  </Text>
                  {user?.bio ? (
                    <Text style={{ color: theme.textPrimary, fontSize: 14, lineHeight: 21, marginBottom: user?.birthday ? 10 : 0 }}>
                      {user.bio}
                    </Text>
                  ) : null}
                  {user?.birthday ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Feather name="gift" size={16} color={theme.textMuted} />
                      <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: "500" }}>
                        {formatBirthdayDisplay(user.birthday)}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            </View>
          </View>

          {/* Primary actions — horizontal scroll on narrow screens */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              gap: 10,
              paddingBottom: 4,
            }}
            style={{ marginBottom: 10 }}
          >
            <TouchableOpacity
              onPress={() => {
                const followerCount = followers?.length || 0;
                if (followerCount < SUPPORT_REQUIREMENT) {
                  Alert.alert(
                    t("profile.alerts.supportNotAvailableTitle"),
                    t("profile.alerts.supportNotAvailableMessage", {
                      required: SUPPORT_REQUIREMENT,
                      count: followerCount,
                    })
                  );
                } else {
                  router.push("/donation");
                }
              }}
              disabled={(followers?.length || 0) < SUPPORT_REQUIREMENT}
              activeOpacity={0.9}
              style={{
                borderRadius: 14,
                minHeight: 46,
                overflow: "hidden",
                opacity: (followers?.length || 0) < SUPPORT_REQUIREMENT ? 0.55 : 1,
                shadowColor: themedColor("rgba(52,211,153,0.45)", "rgba(34,197,94,0.35)"),
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <LinearGradient
                colors={supportGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 13,
                  borderRadius: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Feather name="heart" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, maxWidth: 200 }} numberOfLines={2}>
                  {(followers?.length || 0) < SUPPORT_REQUIREMENT
                    ? t("profile.actions.supportWithProgress", {
                        current: followers?.length || 0,
                        required: SUPPORT_REQUIREMENT,
                      })
                    : t("profile.actions.support")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/go-live")}
              activeOpacity={0.9}
              style={{
                borderRadius: 14,
                minHeight: 46,
                overflow: "hidden",
                shadowColor: themedColor("rgba(239,68,68,0.45)", "rgba(220,38,38,0.35)"),
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <LinearGradient
                colors={goLiveGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 13,
                  borderRadius: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Feather name="video" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  {t("profile.actions.goLive")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/live-streams")}
              activeOpacity={0.9}
              style={{
                borderRadius: 14,
                minHeight: 46,
                overflow: "hidden",
                shadowColor: themedColor("rgba(189,92,246,0.45)", "rgba(99,102,241,0.35)"),
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 8,
                elevation: 4,
              }}
            >
              <LinearGradient
                colors={liveStreamsGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 13,
                  borderRadius: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Feather name="radio" size={18} color="#fff" />
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  {t("profile.actions.liveStreams")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>

          {/* Secondary actions */}
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              marginBottom: 16,
              paddingHorizontal: 16,
              gap: 10,
            }}
          >
            <TouchableOpacity
              onPress={() => router.push("/advertisements")}
              activeOpacity={0.88}
              style={{
                flex: 1,
                minWidth: 140,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: themedColor("rgba(99,102,241,0.35)", theme.border),
                backgroundColor: themedColor("rgba(99,102,241,0.2)", theme.accentSoft),
                paddingVertical: 14,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Feather name="sidebar" size={18} color={theme.accent} />
              <Text style={{ color: theme.accent, fontWeight: "700", fontSize: 14 }}>Advertisements</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowEarningsDashboard(!showEarningsDashboard)}
              activeOpacity={0.88}
              style={{
                flex: 1,
                minWidth: 140,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: themedColor("rgba(52,211,153,0.35)", "rgba(22,163,74,0.35)"),
                backgroundColor: themedColor("rgba(52,211,153,0.14)", "rgba(22,163,74,0.08)"),
                paddingVertical: 14,
                paddingHorizontal: 12,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
              }}
            >
              <Feather name="dollar-sign" size={18} color={theme.success} />
              <Text style={{ color: theme.success, fontWeight: "700", fontSize: 14 }}>Earnings</Text>
            </TouchableOpacity>

            {isAdminUser(user) ? (
              <TouchableOpacity
                onPress={() => router.push("/admin")}
                activeOpacity={0.88}
                style={{
                  flexGrow: 1,
                  minWidth: 140,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: themedColor("rgba(99,102,241,0.35)", theme.border),
                  backgroundColor: themedColor("rgba(99,102,241,0.22)", "rgba(99,102,241,0.1)"),
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <Feather name="shield" size={18} color={theme.textPrimary} />
                <Text style={{ color: theme.textPrimary, fontWeight: "700", fontSize: 14 }}>Admin</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Earnings Dashboard Expanded View */}
          {showEarningsDashboard && (
            <View style={{
              marginHorizontal: 16,
              marginBottom: 16,
              backgroundColor: themedColor('rgba(0, 0, 0, 0.4)', theme.surface),
              borderRadius: 16,
              padding: 16,
              borderWidth: 1,
              borderColor: 'rgba(50, 205, 50, 0.2)',
            }}>
              {loadingEarnings ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#32CD32" />
                  <Text style={{ color: theme.textSecondary, marginTop: 8 }}>Loading earnings...</Text>
                </View>
              ) : (
                <>
                  {/* Stripe Account Connection Status */}
                  <View style={{
                    backgroundColor: stripeAccountStatus?.transfersEnabled 
                      ? 'rgba(50, 205, 50, 0.1)' 
                      : 'rgba(255, 165, 0, 0.1)',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                    borderWidth: 1,
                    borderColor: stripeAccountStatus?.transfersEnabled 
                      ? 'rgba(50, 205, 50, 0.3)' 
                      : 'rgba(255, 165, 0, 0.3)'
                  }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>
                          Payment Account
                        </Text>
                        {stripeAccountStatus?.transfersEnabled ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: '#32CD32', fontSize: 12 }}>✓</Text>
                            <Text style={{ color: '#32CD32', fontSize: 12, fontWeight: '600' }}>
                              Bank Account Verified • Automatic payouts enabled
                            </Text>
                          </View>
                        ) : stripeAccountStatus?.detailsSubmitted ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ color: '#FFA500', fontSize: 12 }}>⏳</Text>
                            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                              Verification in progress • Stripe is reviewing your account
                            </Text>
                          </View>
                        ) : stripeAccountId ? (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            Account created • Complete bank account verification to enable automatic payouts
                          </Text>
                        ) : (
                          <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                            Not connected • Link and verify your bank account for automatic payouts
                          </Text>
                        )}
                      </View>
                    </View>
                    {!stripeAccountStatus?.transfersEnabled && (
                      <TouchableOpacity
                        onPress={handleLinkStripeAccount}
                        disabled={linkingStripe}
                        style={{
                          backgroundColor: linkingStripe ? '#999' : '#635BFF',
                          borderRadius: 8,
                          padding: 12,
                          alignItems: 'center',
                          marginTop: 8,
                          opacity: linkingStripe ? 0.6 : 1
                        }}
                      >
                        {linkingStripe ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <ActivityIndicator size="small" color="#fff" />
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                              Opening Stripe...
                            </Text>
                          </View>
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                            {stripeAccountId ? 'Complete Bank Verification' : 'Connect & Verify Bank Account'}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                    
                    {stripeAccountStatus?.transfersEnabled && (
                      <View style={{ marginTop: 8, padding: 10, backgroundColor: 'rgba(50, 205, 50, 0.1)', borderRadius: 8 }}>
                        <Text style={{ color: '#32CD32', fontSize: 11, textAlign: 'center' }}>
                          ✓ Your bank account is verified. You'll receive automatic payouts when admin approves withdrawals.
                        </Text>
                      </View>
                    )}
                  </View>

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
                      <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>Total Earnings</Text>
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
                      <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 4 }}>Pending</Text>
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
                    <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>
                      Recent Donations ({donationsWithDonors.length})
                    </Text>
                    {donationsWithDonors.length === 0 ? (
                      <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', padding: 20 }}>
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
                              backgroundColor: themedColor('rgba(255, 255, 255, 0.05)', theme.cardSoft),
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
                                <Text style={{ color: theme.textPrimary, fontWeight: '600', fontSize: 14 }}>
                                  {item.donorName || 'Anonymous'}
                                </Text>
                                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
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
                    <Text style={{ color: theme.textPrimary, fontWeight: 'bold', fontSize: 16, marginBottom: 12 }}>
                      Payout History ({payouts.length})
                    </Text>
                    {payouts.length === 0 ? (
                      <Text style={{ color: theme.textSecondary, fontSize: 14, textAlign: 'center', padding: 20 }}>
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
                                backgroundColor: themedColor('rgba(255, 255, 255, 0.05)', theme.cardSoft),
                                borderRadius: 8,
                                marginBottom: 6
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: theme.textPrimary, fontWeight: '600', fontSize: 14 }}>
                                  {formatCurrency(item.amount)}
                                </Text>
                                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
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

          {/* Section Tabs */}
          <View style={{ paddingHorizontal: 16, marginBottom: 18 }}>
            <View
              style={{
                flexDirection: "row",
                borderRadius: 16,
                padding: 5,
                gap: 4,
                backgroundColor: themedColor("rgba(15,23,42,0.45)", theme.surfaceMuted),
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  backgroundColor: activeSection === "videos" ? theme.card : "transparent",
                  borderWidth: activeSection === "videos" ? 1 : 0,
                  borderColor: theme.border,
                  shadowColor: activeSection === "videos" ? "#000" : "transparent",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: activeSection === "videos" ? (isDarkMode ? 0.25 : 0.08) : 0,
                  shadowRadius: activeSection === "videos" ? 6 : 0,
                  elevation: activeSection === "videos" ? 2 : 0,
                }}
                onPress={() => handleSectionChange("videos")}
                activeOpacity={0.9}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 13,
                    color: activeSection === "videos" ? theme.textPrimary : theme.textMuted,
                  }}
                >
                  {t("profile.sections.videos")}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  backgroundColor: activeSection === "pics" ? theme.card : "transparent",
                  borderWidth: activeSection === "pics" ? 1 : 0,
                  borderColor: theme.border,
                  shadowColor: activeSection === "pics" ? "#000" : "transparent",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: activeSection === "pics" ? (isDarkMode ? 0.25 : 0.08) : 0,
                  shadowRadius: activeSection === "pics" ? 6 : 0,
                  elevation: activeSection === "pics" ? 2 : 0,
                }}
                onPress={() => handleSectionChange("pics")}
                activeOpacity={0.9}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 13,
                    color: activeSection === "pics" ? theme.textPrimary : theme.textMuted,
                  }}
                >
                  Pics
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 11,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  backgroundColor: activeSection === "bookmarks" ? theme.card : "transparent",
                  borderWidth: activeSection === "bookmarks" ? 1 : 0,
                  borderColor: theme.border,
                  shadowColor: activeSection === "bookmarks" ? "#000" : "transparent",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: activeSection === "bookmarks" ? (isDarkMode ? 0.25 : 0.08) : 0,
                  shadowRadius: activeSection === "bookmarks" ? 6 : 0,
                  elevation: activeSection === "bookmarks" ? 2 : 0,
                }}
                onPress={() => handleSectionChange("bookmarks")}
                activeOpacity={0.9}
              >
                <Text
                  style={{
                    textAlign: "center",
                    fontFamily: "Poppins-SemiBold",
                    fontSize: 13,
                    color: activeSection === "bookmarks" ? theme.textPrimary : theme.textMuted,
                  }}
                >
                  Bookmarks
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
                          <Image
                            source={{
                              uri: getGridThumbnailUriForPost(post),
                            }}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
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
                          let textOverlays = [];
                          let imageOverlays = [];
                          
                          if (photo.edits) {
                            try {
                              const edits = typeof photo.edits === 'string' ? JSON.parse(photo.edits) : photo.edits;
                              
                              // Handle both compressed and uncompressed formats
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
                            }
                          }
                          
                          const filterCSS = getFilterCSS(filterId, adjustments);
                          const hasOverlays = textOverlays.length > 0 || imageOverlays.length > 0;
                          
                          // Use WebView if there are filters or overlays
                          if (filterCSS !== 'none' || hasOverlays) {
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
                                              
                                              let leftPos, transformValue;
                                              if (overlay.x !== undefined && overlay.y !== undefined) {
                                                leftPos = overlay.x + '%';
                                                transformValue = 'translate(-50%, -50%)';
                                              } else {
                                                if (alignment === 'left') {
                                                  leftPos = '5%';
                                                  transformValue = 'translateY(-50%)';
                                                } else if (alignment === 'right') {
                                                  leftPos = '95%';
                                                  transformValue = 'translate(-100%, -50%)';
                                                } else {
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
                                          <img src="${photo.photo || 'https://via.placeholder.com/300x300'}" alt="Photo with overlays" />
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
                                />
                              </View>
                            );
                          }
                          
                          // No filter or overlays, use regular Image
                          return (
                            <Image
                              source={{ uri: photo.photo || 'https://via.placeholder.com/300x300' }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="contain"
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
                Bookmarks
              </Text>
              {bookmarksLoading ? (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <ActivityIndicator size="large" color={theme.accent} />
                </View>
              ) : bookmarkedPosts && bookmarkedPosts.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
                  {bookmarkedPosts.map((post, index) => (
                    <View
                      key={post.bookmarkId ? String(post.bookmarkId) : `${post.$id ?? "post"}-${index}`}
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
                          if (post.postType === 'photo') {
                            setSelectedPhoto(post);
                            setPhotoIndex(index);
                            setPhotoModalVisible(true);
                          } else {
                            openVideoModal(post, index);
                          }
                        }}
                      >
                        <View style={{ width: '100%', height: '100%' }}>
                          {post.postType === 'photo' ? (
                            (() => {
                              // Get filter and adjustments from photo
                              const filterId = post.filter || 'none';
                              let adjustments = null;
                              let textOverlays = [];
                              let imageOverlays = [];
                              
                              if (post.edits) {
                                try {
                                  const edits = typeof post.edits === 'string' ? JSON.parse(post.edits) : post.edits;
                                  adjustments = edits.adjustments || null;
                                  textOverlays = edits.textOverlays || [];
                                  imageOverlays = edits.imageOverlays || [];
                                } catch (e) {
                                }
                              }
                              
                              const filterCSS = getFilterCSS(filterId, adjustments);
                              
                              // If there are filters, adjustments, or overlays, use WebView
                              if (filterCSS !== 'none' || textOverlays.length > 0 || imageOverlays.length > 0) {
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
                                                * { margin: 0; padding: 0; box-sizing: border-box; }
                                                body, html { width: 100%; height: 100%; overflow: hidden; }
                                                img { width: 100%; height: 100%; object-fit: cover; filter: ${filterCSS}; }
                                                ${textOverlays.map((overlay, idx) => `
                                                  .text-overlay-${idx} {
                                                    position: absolute;
                                                    left: ${overlay.x}%;
                                                    top: ${overlay.y}%;
                                                    transform: translate(-50%, -50%) rotate(${overlay.rotation || 0}deg);
                                                    font-size: ${overlay.fontSize || 16}px;
                                                    color: ${overlay.color || '#000'};
                                                    font-weight: ${overlay.bold ? 'bold' : 'normal'};
                                                    font-style: ${overlay.italic ? 'italic' : 'normal'};
                                                    text-decoration: ${overlay.underline ? 'underline' : 'none'};
                                                    pointer-events: none;
                                                  }
                                                `).join('\n')}
                                                ${imageOverlays.map((overlay, idx) => `
                                                  .image-overlay-${idx} {
                                                    position: absolute;
                                                    left: ${overlay.x}%;
                                                    top: ${overlay.y}%;
                                                    transform: translate(-50%, -50%) rotate(${overlay.rotation || 0}deg);
                                                    width: ${overlay.width || 50}px;
                                                    height: ${overlay.height || 50}px;
                                                    object-fit: contain;
                                                    pointer-events: none;
                                                  }
                                                `).join('\n')}
                                              </style>
                                            </head>
                                            <body>
                                              <img src="${post.photo || 'https://via.placeholder.com/300x300'}" alt="Photo with overlays" />
                                              ${textOverlays.map((overlay, idx) => 
                                                `<div class="text-overlay-${idx}"><span>${overlay.text}</span></div>`
                                              ).join('')}
                                              ${imageOverlays.map((overlay, idx) => 
                                                `<img src="${overlay.uri}" class="image-overlay-${idx}" alt="Overlay ${idx}" />`
                                              ).join('')}
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
                              
                              // No filter or overlays, use regular Image
                              return (
                                <Image
                                  source={{ uri: post.photo || 'https://via.placeholder.com/300x300' }}
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode="cover"
                                />
                              );
                            })()
                          ) : (
                            <>
                              <Image
                                source={{
                                  uri: isVideoMedia(post?.video, post?.postType)
                                    ? (post.thumbnail || post.photo || post.video || 'https://via.placeholder.com/300x300')
                                    : (post.thumbnail || post.photo || post.video || 'https://via.placeholder.com/300x300'),
                                }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="cover"
                              />
                            </>
                          )}
                        </View>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 16 }}>
                    No bookmarks yet
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                    Bookmark videos and photos from the home screen to see them here
                  </Text>
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
              <Text style={{ color: theme.textSecondary, fontSize: 18 }}>
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
                  
                  {/* Media */}
                  <View style={{ flex: 1, backgroundColor: theme.background, position: 'relative' }}>
                    {isVideoMedia(modalVideo?.video, modalVideo?.postType) ? (
                      (() => {
                        const profilePosterUri =
                          modalVideo.thumbnail && !String(modalVideo.thumbnail).includes("placeholder")
                            ? getVideoPosterUri(modalVideo.thumbnail, modalVideo.video)
                            : undefined;
                        const profileStreamUri =
                          getPlaybackUriForPost(modalVideo) ||
                          (!isMuxPlaceholderVideo(modalVideo?.video)
                            ? getIOSCompatibleVideoUrl(modalVideo.video) || modalVideo.video
                            : null);
                        if (!profileStreamUri) {
                          return (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
                              <ActivityIndicator color="#fff" size="large" />
                              <Text style={{ color: theme.textPrimary, marginTop: 12 }}>Preparing video…</Text>
                            </View>
                          );
                        }
                        return (
                      <>
                        <Video
                          ref={modalVideoRef}
                          source={{ uri: profileStreamUri }}
                          style={{ flex: 1, width: '100%', height: '100%' }}
                          resizeMode={ResizeMode.CONTAIN}
                          shouldPlay={isVideoPlaying}
                          isLooping={true}
                          isMuted={false}
                          useNativeControls={false}
                          progressUpdateIntervalMillis={250}
                          posterSource={profilePosterUri ? { uri: profilePosterUri } : undefined}
                          usePoster={Boolean(profilePosterUri) && !isVideoReady}
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
                            setIsVideoReady(false);
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
                            automaticallyWaitsToMinimizeStalling: true,
                            preferredForwardBufferDuration: 12,
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
                          disableAutoHide={!isVideoPlaying}
                        />
                        
                        {/* Play button stays visible while paused */}
                        {(showProgressBar || !isVideoPlaying) && (
                          <TouchableOpacity
                            onPress={() => {
                              if (isVideoPlaying) {
                                modalVideoRef.current?.pauseAsync();
                                setIsVideoPlaying(false);
                              } else {
                                modalVideoRef.current?.playAsync();
                                setIsVideoPlaying(true);
                              }
                              setShowProgressBar(true);
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
                        )}
                      </>
                        );
                      })()
                    ) : (
                      <Image
                        source={{ uri: modalVideo?.photo || modalVideo?.thumbnail || modalVideo?.video }}
                        style={{ flex: 1, width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                    )}
                    
                    {/* Fallback thumbnail while video is loading/not ready */}
                    {isVideoMedia(modalVideo?.video, modalVideo?.postType) && modalVideo.thumbnail && !isVideoReady && (
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
                      <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' }}>
                        {formatCount(likeCount)}
                      </Text>
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
                                <View style={{ flex: 1, flexShrink: 1 }}>
                                  <Text style={{ color: theme.accent, fontWeight: 'bold', fontSize: 15 }}>{c.username || c.userId}</Text>
                                  <Text style={{ color: theme.textPrimary, fontSize: 16, flexWrap: 'wrap' }}>{c.content}</Text>
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
                            multiline={true}
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
                              minHeight: 40,
                              maxHeight: 120,
                              textAlignVertical: 'top',
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
                              alignSelf: 'flex-end',
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
                {(() => {
                  // Get filter and adjustments from photo
                  const filterId = selectedPhoto.filter || 'none';
                  let adjustments = null;
                  let textOverlays = [];
                  let imageOverlays = [];
                  
                  if (selectedPhoto.edits) {
                    try {
                      const edits = typeof selectedPhoto.edits === 'string' ? JSON.parse(selectedPhoto.edits) : selectedPhoto.edits;
                      
                      // Handle both compressed and uncompressed formats
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
                    }
                  }
                  
                  const filterCSS = getFilterCSS(filterId, adjustments);
                  const hasOverlays = textOverlays.length > 0 || imageOverlays.length > 0;
                  
                  // Use WebView if there are filters or overlays
                  if (filterCSS !== 'none' || hasOverlays) {
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
                                      
                                      let leftPos, transformValue;
                                      if (overlay.x !== undefined && overlay.y !== undefined) {
                                        leftPos = overlay.x + '%';
                                        transformValue = 'translate(-50%, -50%)';
                                      } else {
                                        if (alignment === 'left') {
                                          leftPos = '5%';
                                          transformValue = 'translateY(-50%)';
                                        } else if (alignment === 'right') {
                                          leftPos = '95%';
                                          transformValue = 'translate(-100%, -50%)';
                                        } else {
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
                                  <img src="${selectedPhoto.photo || 'https://via.placeholder.com/300x300'}" alt="Photo with overlays" />
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
                        />
                      </View>
                    );
                  }
                  
                  // No filter or overlays, use regular Image
                  return (
                    <Image
                      source={{ uri: selectedPhoto.photo || 'https://via.placeholder.com/300x300' }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="contain"
                    />
                  );
                })()}
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

        {/* Edit Profile Modal — sheet layout, cards, focus/validation UX */}
        <Modal
          visible={editModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={closeEditModal}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: themedColor("rgba(0,0,0,0.5)", "rgba(15,23,42,0.35)"),
                justifyContent: "flex-end",
              }}
            >
              <View
                style={{
                  width: "100%",
                  maxHeight: "92%",
                  alignSelf: "center",
                  maxWidth: 520,
                  backgroundColor: theme.background,
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingBottom: Math.max(insets.bottom, 16),
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: -4 },
                  shadowOpacity: isDarkMode ? 0.35 : 0.08,
                  shadowRadius: 16,
                  elevation: 24,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: theme.border,
                    alignSelf: "center",
                    marginTop: 10,
                    marginBottom: 6,
                  }}
                />
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{
                    paddingHorizontal: 16,
                    paddingTop: 8,
                    paddingBottom: 8,
                    width: "100%",
                    maxWidth: Math.min(480, windowWidth),
                    alignSelf: "center",
                  }}
                >
                  {/* Header */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 20,
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text
                        style={{
                          color: theme.textPrimary,
                          fontSize: 22,
                          fontWeight: "700",
                          letterSpacing: -0.3,
                        }}
                      >
                        {t("profile.modals.editTitle")}
                      </Text>
                      <Text
                        style={{
                          color: theme.textMuted,
                          fontSize: 14,
                          marginTop: 6,
                          lineHeight: 20,
                        }}
                      >
                        {t(
                          "profile.modals.editSubtitle",
                          "Update your photo and details. Changes apply after you save."
                        )}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={closeEditModal}
                      accessibilityRole="button"
                      accessibilityLabel={t("profile.modals.cancel")}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.cardSoft,
                        borderWidth: 1,
                        borderColor: theme.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Feather name="x" size={20} color={theme.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/** Card shell */}
                  {(() => {
                    const card = {
                      backgroundColor: theme.card,
                      borderRadius: 16,
                      padding: 18,
                      marginBottom: 14,
                      borderWidth: 1,
                      borderColor: theme.border,
                      shadowColor: isDarkMode ? "#000" : "#0f172a",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: isDarkMode ? 0.25 : 0.06,
                      shadowRadius: 10,
                      elevation: 3,
                    };
                    const label = {
                      color: theme.textSecondary,
                      fontSize: 13,
                      fontWeight: "600",
                      marginBottom: 8,
                    };
                    const inputShell = (key, hasError) => ({
                      backgroundColor: theme.inputBackground,
                      borderWidth: 1.5,
                      borderColor: hasError
                        ? theme.danger
                        : editFocusKey === key
                          ? theme.accent
                          : theme.border,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      paddingVertical: Platform.OS === "ios" ? 13 : 10,
                    });
                    return (
                      <>
                        {/* Photo card */}
                        <View style={card}>
                          <Text style={{ color: theme.textPrimary, fontSize: 17, fontWeight: "600", marginBottom: 4 }}>
                            {t("profile.modals.avatarLabel")}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 18 }}>
                            {t(
                              "profile.modals.avatarHint",
                              "A clear face or logo helps people recognize you."
                            )}
                          </Text>
                          <View style={{ alignItems: "center" }}>
                            <View
                              style={{
                                width: 112,
                                height: 112,
                                borderRadius: 56,
                                padding: 3,
                                backgroundColor: theme.accentSoft,
                                marginBottom: 16,
                              }}
                            >
                              <View
                                style={{
                                  flex: 1,
                                  borderRadius: 53,
                                  backgroundColor: theme.surface,
                                  borderWidth: 2,
                                  borderColor: theme.card,
                                  overflow: "hidden",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {newAvatar ? (
                                  <Image
                                    source={{ uri: newAvatar }}
                                    style={{ width: "100%", height: "100%" }}
                                    resizeMode="cover"
                                  />
                                ) : user?.avatar ? (
                                  <Image
                                    source={{ uri: user.avatar }}
                                    style={{ width: "100%", height: "100%" }}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <Text style={{ color: theme.textPrimary, fontSize: 36, fontWeight: "700" }}>
                                    {getUserInitials(newUsername || user?.username)}
                                  </Text>
                                )}
                              </View>
                            </View>
                            {uploadingAvatar ? (
                              <ActivityIndicator color={theme.accent} style={{ marginBottom: 12 }} />
                            ) : null}
                            <TouchableOpacity
                              onPress={pickAvatarImage}
                              disabled={uploadingAvatar}
                              activeOpacity={0.85}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 8,
                                alignSelf: "stretch",
                                paddingVertical: 12,
                                paddingHorizontal: 16,
                                borderRadius: 12,
                                borderWidth: 1.5,
                                borderColor: theme.accent,
                                backgroundColor: theme.accentSoft,
                                opacity: uploadingAvatar ? 0.55 : 1,
                              }}
                            >
                              <Feather name="camera" size={18} color={theme.accent} />
                              <Text style={{ color: theme.accent, fontSize: 15, fontWeight: "600" }}>
                                {uploadingAvatar
                                  ? t("profile.modals.uploadingAvatar")
                                  : newAvatar
                                    ? t("Change Avatar")
                                    : t("profile.modals.uploadAvatar")}
                              </Text>
                            </TouchableOpacity>
                            {newAvatar ? (
                              <TouchableOpacity
                                onPress={() => {
                                  Alert.alert(
                                    t("profile.modals.removeAvatarTitle", "Remove Avatar"),
                                    t(
                                      "profile.modals.removeAvatarMessage",
                                      "Are you sure you want to remove your avatar?"
                                    ),
                                    [
                                      { text: t("common.cancel", "Cancel"), style: "cancel" },
                                      {
                                        text: t("common.remove", "Remove"),
                                        style: "destructive",
                                        onPress: () => setNewAvatar(""),
                                      },
                                    ]
                                  );
                                }}
                                style={{ marginTop: 12, paddingVertical: 8 }}
                              >
                                <Text style={{ color: theme.danger, fontSize: 14, fontWeight: "600" }}>
                                  {t("profile.modals.removeAvatar", "Remove photo")}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>

                        {/* Personal info */}
                        <View style={card}>
                          <Text style={{ color: theme.textPrimary, fontSize: 17, fontWeight: "600", marginBottom: 4 }}>
                            {t("profile.modals.personalSection", "Personal details")}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 18 }}>
                            {t(
                              "profile.modals.personalSectionHint",
                              "This information appears on your profile."
                            )}
                          </Text>

                          <Text style={label}>{t("profile.modals.usernameLabel")}</Text>
                          <TextInput
                            value={newUsername}
                            onChangeText={(v) => {
                              setNewUsername(v);
                              if (v.trim()) setUsernameShowError(false);
                            }}
                            onFocus={() => setEditFocusKey("username")}
                            onBlur={() => {
                              setEditFocusKey((k) => (k === "username" ? null : k));
                              if (!newUsername.trim()) setUsernameShowError(true);
                            }}
                            style={{
                              ...inputShell(
                                "username",
                                usernameShowError && !newUsername.trim()
                              ),
                              color: theme.textPrimary,
                              fontSize: 16,
                              marginBottom: usernameShowError && !newUsername.trim() ? 6 : 16,
                            }}
                            placeholder={t("profile.modals.usernamePlaceholder")}
                            placeholderTextColor={theme.inputPlaceholder}
                            autoCapitalize="none"
                            autoCorrect={false}
                          />
                          {usernameShowError && !newUsername.trim() ? (
                            <Text style={{ color: theme.danger, fontSize: 12, marginBottom: 12, fontWeight: "500" }}>
                              {t("profile.validation.usernameRequired", "Username is required.")}
                            </Text>
                          ) : null}

                          <Text style={label}>Bio</Text>
                          <TextInput
                            value={newBio}
                            onChangeText={setNewBio}
                            onFocus={() => setEditFocusKey("bio")}
                            onBlur={() => setEditFocusKey((k) => (k === "bio" ? null : k))}
                            multiline
                            maxLength={220}
                            style={{
                              ...inputShell("bio", false),
                              color: theme.textPrimary,
                              fontSize: 16,
                              minHeight: 100,
                              textAlignVertical: "top",
                              paddingTop: Platform.OS === "ios" ? 13 : 12,
                              marginBottom: 8,
                            }}
                            placeholder={t("profile.modals.bioPlaceholder", "Write a short bio")}
                            placeholderTextColor={theme.inputPlaceholder}
                          />
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 16,
                            }}
                          >
                            <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1, marginRight: 8 }}>
                              {t("profile.modals.bioHelper", "Keep it concise and professional.")}
                            </Text>
                            <Text style={{ color: theme.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                              {newBio.length}/220
                            </Text>
                          </View>

                          <Text style={label}>
                            {t("profile.modals.birthdayLabel", "Birthday (MM/DD/YYYY)")}
                          </Text>
                          <TextInput
                            value={newBirthday}
                            onChangeText={(value) => setNewBirthday(normalizeBirthdayInput(value))}
                            onFocus={() => setEditFocusKey("birthday")}
                            onBlur={() => setEditFocusKey((k) => (k === "birthday" ? null : k))}
                            keyboardType="number-pad"
                            maxLength={10}
                            style={{
                              ...inputShell("birthday", profileEditBirthdayHint.variant === "error"),
                              color: theme.textPrimary,
                              fontSize: 16,
                              marginBottom: 6,
                            }}
                            placeholder="MM/DD/YYYY"
                            placeholderTextColor={theme.inputPlaceholder}
                          />
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "500",
                              marginBottom: 4,
                              color:
                                profileEditBirthdayHint.variant === "error"
                                  ? theme.danger
                                  : profileEditBirthdayHint.variant === "success"
                                    ? theme.success
                                    : theme.textMuted,
                            }}
                          >
                            {profileEditBirthdayHint.message}
                          </Text>
                        </View>

                        {/* Preferences */}
                        <View style={card}>
                          <Text style={{ color: theme.textPrimary, fontSize: 17, fontWeight: "600", marginBottom: 4 }}>
                            {t("profile.modals.preferencesSection", "Preferences")}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 13, marginBottom: 16 }}>
                            {t("profile.modals.preferencesHint", "Appearance and privacy.")}
                          </Text>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              paddingVertical: 12,
                              borderBottomWidth: 1,
                              borderBottomColor: theme.divider,
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "600" }}>
                                {t("profile.modals.themeLabel")}
                              </Text>
                              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                                {t("profile.modals.themeHint", "Light or dark appearance")}
                              </Text>
                            </View>
                            <ThemeToggle />
                          </View>

                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                              paddingVertical: 14,
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "600" }}>
                                {t("profile.modals.privateProfileLabel")}
                              </Text>
                              <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                                {t("profile.modals.privateHint", "Only approved followers see your posts.")}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => setIsPrivate(!isPrivate)}
                              accessibilityRole="switch"
                              accessibilityState={{ checked: isPrivate }}
                              activeOpacity={0.9}
                              style={{
                                width: 52,
                                height: 32,
                                borderRadius: 16,
                                backgroundColor: isPrivate ? theme.accent : theme.cardSoft,
                                justifyContent: "center",
                                paddingHorizontal: 3,
                                borderWidth: 1,
                                borderColor: isPrivate ? theme.accent : theme.border,
                              }}
                            >
                              <View
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 13,
                                  backgroundColor: "#fff",
                                  alignSelf: isPrivate ? "flex-end" : "flex-start",
                                  shadowColor: "#000",
                                  shadowOffset: { width: 0, height: 1 },
                                  shadowOpacity: 0.12,
                                  shadowRadius: 2,
                                  elevation: 2,
                                }}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {isPrivate && pendingRequests && pendingRequests.length > 0 ? (
                          <View style={card}>
                            <Text style={{ color: theme.textPrimary, fontSize: 17, fontWeight: "600", marginBottom: 12 }}>
                              {t("profile.modals.pendingRequestsTitle", { count: pendingRequests.length })}
                            </Text>
                            <View style={{ maxHeight: 220 }}>
                              {pendingRequests.map((requestingUserId, index) => (
                                <PendingRequestItem
                                  key={index}
                                  requestingUserId={requestingUserId}
                                  onApprove={() => handleAccessRequest(requestingUserId, "approve")}
                                  onDeny={() => handleAccessRequest(requestingUserId, "deny")}
                                />
                              ))}
                            </View>
                          </View>
                        ) : null}

                        {/* Actions */}
                        <View style={{ marginTop: 4, marginBottom: 8, gap: 10 }}>
                          <TouchableOpacity
                            onPress={saveProfileChanges}
                            disabled={
                              saving ||
                              uploadingAvatar ||
                              (newBirthday.trim().length > 0 &&
                                profileEditBirthdayHint.variant === "error")
                            }
                            activeOpacity={0.9}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 10,
                              minHeight: 52,
                              borderRadius: 14,
                              backgroundColor: theme.accent,
                              opacity:
                                saving ||
                                uploadingAvatar ||
                                (newBirthday.trim().length > 0 &&
                                  profileEditBirthdayHint.variant === "error")
                                  ? 0.72
                                  : 1,
                            }}
                          >
                            {saving ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Feather name="check" size={20} color="#fff" />
                            )}
                            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                              {saving ? t("profile.modals.saving") : t("profile.modals.save")}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={closeEditModal}
                            disabled={saving}
                            activeOpacity={0.85}
                            style={{
                              minHeight: 48,
                              borderRadius: 14,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1.5,
                              borderColor: theme.border,
                              backgroundColor: theme.cardSoft,
                            }}
                          >
                            <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: "600" }}>
                              {t("profile.modals.cancel")}
                            </Text>
                          </TouchableOpacity>
                        </View>

                        {/* Danger zone */}
                        <View
                          style={{
                            ...card,
                            backgroundColor: isDarkMode ? "rgba(248,113,113,0.08)" : "rgba(220,38,38,0.06)",
                            borderColor: isDarkMode ? "rgba(248,113,113,0.25)" : "rgba(220,38,38,0.2)",
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: theme.danger,
                              fontSize: 12,
                              fontWeight: "700",
                              letterSpacing: 0.6,
                              marginBottom: 10,
                            }}
                          >
                            {t("profile.deleteAccount.zoneLabel", "Danger zone")}
                          </Text>
                          <TouchableOpacity
                            onPress={handleDeleteAccount}
                            activeOpacity={0.9}
                            style={{
                              minHeight: 48,
                              borderRadius: 12,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: theme.danger,
                            }}
                          >
                            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                              {t("profile.deleteAccount.button", "Delete Account")}
                            </Text>
                          </TouchableOpacity>
                          <Text
                            style={{
                              color: theme.textSecondary,
                              fontSize: 12,
                              textAlign: "center",
                              marginTop: 10,
                              lineHeight: 18,
                            }}
                          >
                            {t("profile.deleteAccount.warning", "Permanently delete your account and all data")}
                          </Text>
                        </View>
                      </>
                    );
                  })()}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Profile;

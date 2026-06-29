import { ID, Query } from "react-native-appwrite";
import { databases, client, appwriteConfig, createNotification, uploadFile, getPhotoUrl } from "./appwrite";
import { createVideoSDKRoomAndToken } from "./videosdkHelper";
import { sendLiveStreamPushNotifications } from "./pushNotificationService";

/** Resolve stream thumbnail URL for list cards and viewer waiting screen. */
export function resolveLiveStreamThumbnailUrl(stream) {
  if (!stream) return null;
  const thumb = stream.thumbnail;
  if (thumb != null && String(thumb).trim()) {
    const url = getPhotoUrl(thumb);
    if (url) return url;
  }
  const avatar = stream.hostAvatar;
  if (avatar != null && String(avatar).trim()) {
    return getPhotoUrl(avatar);
  }
  return null;
}

function normalizeThumbnailField(uploadedUrl) {
  if (!uploadedUrl) return "";
  const match = String(uploadedUrl).match(/\/files\/([a-zA-Z0-9]+)/);
  return match?.[1] || uploadedUrl;
}

function defaultHostThumbnail(user) {
  const avatar = user?.avatar;
  if (!avatar) return "";
  const s = String(avatar);
  return s.length > 32 ? s.substring(0, 32) : s;
}

// ================== LIVE STREAMING FUNCTIONS ==================

// Create a new live stream
// liveMode: 'camera' | 'screen' — add matching string attribute on the liveStreams collection in Appwrite.
/** Unique VideoSDK participant id per live stream (do not reuse Appwrite userId — stale sessions / 1103). */
export function buildLiveHostParticipantId(streamDocId) {
  const sid = String(streamDocId || '').trim() || ID.unique();
  return `host-${sid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`;
}

export async function createLiveStream(
  userId,
  title,
  description,
  category,
  liveMode = "camera",
  options = {}
) {
  try {
    const streamDocId = ID.unique();
    const hostParticipantId = buildLiveHostParticipantId(streamDocId);
    const session = await createVideoSDKRoomAndToken(hostParticipantId);
    const videosdkRoomId = session?.meetingId;
    const videosdkHostToken = session?.token;
    if (!videosdkRoomId) {
      throw new Error("Could not create VideoSDK room for live stream.");
    }
    if (!videosdkHostToken) {
      throw new Error("Could not create VideoSDK host token for live stream.");
    }

    const user = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId
    );

    let thumbnail = defaultHostThumbnail(user);
    const thumbnailAsset = options?.thumbnailAsset;
    if (
      thumbnailAsset &&
      typeof thumbnailAsset === "object" &&
      typeof thumbnailAsset.uri === "string" &&
      thumbnailAsset.uri.trim()
    ) {
      try {
        const uploadedUrl = await uploadFile(thumbnailAsset, "image");
        const normalized = normalizeThumbnailField(uploadedUrl);
        if (normalized) thumbnail = normalized;
      } catch (_) {
        /* optional — fall back to host avatar thumbnail */
      }
    }

    const normalizedLiveMode = liveMode === "screen" ? "screen" : "camera";

    const liveStream = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      streamDocId,
      {
        hostId: userId,
        hostUsername: user.username,
        hostAvatar: user.avatar,
        title: title,
        description: description || '',
        category: category || 'General',
        isLive: true,
        status: 'live',
        viewerCount: 0,
        startTime: new Date().toISOString(),
        thumbnail: thumbnail,
        liveMode: normalizedLiveMode,
        videosdkRoomId,
      }
    );

    scheduleLiveStreamFollowerNotifications({
      user,
      userId,
      liveStream,
      title,
    });

    // Return host token for immediate MeetingProvider use (avoid second token fetch call).
    return {
      ...liveStream,
      videosdkHostToken,
      videosdkHostParticipantId: hostParticipantId,
    };
  } catch (error) {
    const rawMessage = String(error?.message || error || '');
    if (rawMessage.includes('Attribute not found') || rawMessage.includes('Unknown attribute') || rawMessage.includes('videosdkRoomId')) {
      throw new Error(
        'Appwrite liveStreams collection is missing required attribute "videosdkRoomId" (string). Add it in Appwrite, then try again.'
      );
    }
    if (rawMessage.includes('VideoSDK room creation') || rawMessage.includes('/create-room')) {
      throw new Error(
        `Could not create VideoSDK room. Check your token server/create-room endpoint and VideoSDK credentials. (${rawMessage})`
      );
    }
    throw new Error(`Failed to create live stream: ${rawMessage}`);
  }
}

/** Run after go-live returns — must not block host broadcast startup. */
function scheduleLiveStreamFollowerNotifications({
  user,
  userId,
  liveStream,
  title,
}) {
  setTimeout(() => {
    (async () => {
      try {
        const followers = user.followers || [];
        const notifiedFollowerIds = [];

        for (const followerId of followers) {
          try {
            await createNotification('live', userId, followerId, liveStream.$id);
            notifiedFollowerIds.push(followerId);
          } catch (_) {
            /* continue with other followers */
          }
        }

        await sendLiveStreamPushNotifications({
          hostUserId: userId,
          hostUsername: user.username,
          streamId: liveStream.$id,
          streamTitle: title,
          followerIds: notifiedFollowerIds.length ? notifiedFollowerIds : followers,
        });
      } catch (_) {
        /* notifications must never affect live broadcast */
      }
    })();
  }, 0);
}

// End a live stream
export async function endLiveStream(streamId) {
  try {
    if (!streamId) {
      throw new Error('Stream ID is required');
    }

    // First, verify the stream exists and is live
    let stream;
    try {
      stream = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.liveStreamsCollectionId,
        streamId
      );
    } catch (getError) {
      // If stream doesn't exist, consider it already ended
      if (getError.message.includes('could not be found')) {
        return true;
      }
      throw getError;
    }

    // Update the stream to mark it as ended
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      streamId,
      {
        isLive: false,
        status: 'ended',
        endTime: new Date().toISOString(),
      }
    );

    return true;
  } catch (error) {
    throw new Error(`Failed to end live stream: ${error.message}`);
  }
}

// Get all active live streams
export async function getActiveLiveStreams() {
  try {
    const streams = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      [
        Query.equal('isLive', true),
        Query.orderDesc('startTime'),
        Query.limit(50)
      ]
    );

    // Filter out streams that are older than 24 hours (likely abandoned)
    const now = new Date();
    const activeStreams = streams.documents.filter(stream => {
      if (!stream.startTime) return false;
      
      const startTime = new Date(stream.startTime);
      const hoursSinceStart = (now - startTime) / (1000 * 60 * 60);
      
      // If stream is older than 24 hours, mark it as ended
      if (hoursSinceStart > 24) {
        // Auto-end old streams
        endLiveStream(stream.$id).catch(err => {
        });
        return false;
      }
      
      return true;
    });
   
    return activeStreams;
  } catch (error) {
    
    // Check if it's a collection not found error
    if (error.message.includes('Collection with the requested ID could not be found')) {
      return [];
    }
    
    // Check if it's a database connection error
    if (error.message.includes('Database with the requested ID could not be found')) {
      return [];
    }
    
    return [];
  }
}

// Get live stream by ID
export async function getLiveStreamById(streamId) {
  try {
    const stream = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      streamId
    );

    return stream;
  } catch (error) {
   
    throw new Error(`Failed to get live stream: ${error.message}`);
  }
}

// Join a live stream (add viewer)
export async function joinLiveStream(streamId, userId) {
  try {
    const stream = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      streamId
    );

    // Simply increment viewer count (don't track individual viewers due to attribute limitations)
    const currentCount = stream.viewerCount || 0;
    
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      streamId,
      {
        viewerCount: currentCount + 1,
      }
    );

    return true;
  } catch (error) {
   
    throw new Error(`Failed to join live stream: ${error.message}`);
  }
}

// Leave a live stream (remove viewer)
export async function leaveLiveStream(streamId, userId) {
  try {
    const stream = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      streamId
    );

    // Simply decrement viewer count (don't track individual viewers due to attribute limitations)
    const currentCount = stream.viewerCount || 0;
    const newCount = Math.max(0, currentCount - 1); // Don't go below 0

    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      streamId,
      {
        viewerCount: newCount,
      }
    );

    return true;
  } catch (error) {
   
    throw new Error(`Failed to leave live stream: ${error.message}`);
  }
}

// Add a live comment
export async function addLiveComment(streamId, userId, username, avatar, content) {
  // Validate streamId before proceeding
  if (!isValidStreamId(streamId)) {
   
    throw new Error('Invalid streamId provided');
  }

  try {
    const comment = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveCommentsCollectionId,
      ID.unique(),
      {
        streamId: streamId,
        userId: userId,
        username: username,
        avatar: avatar,
        content: content,
      }
    );

    return comment;
  } catch (error) {
   
    
    // Check if it's a collection not found error
    if (error.message.includes('Collection with the requested ID could not be found')) {
     
      throw new Error('Live comments collection not found. Please set up the database collections.');
    }
    
    throw new Error(`Failed to add live comment: ${error.message}`);
  }
}

// Get live comments for a stream
export async function getLiveComments(streamId, limit = 50) {
  // Validate streamId before proceeding
  if (!isValidStreamId(streamId)) {
   
    return [];
  }

  try {
    // Use fallback method directly - get all recent comments and filter client-side
   
    const allComments = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.liveCommentsCollectionId,
      [
        Query.orderDesc('$createdAt'),
        Query.limit(limit * 2) // Get more to account for filtering
      ]
    );
    
    // Filter comments by streamId on client side
    const filteredComments = allComments.documents.filter(comment => comment.streamId === streamId);
   
    return filteredComments.reverse();
  } catch (error) {
   
    return [];
  }
}

// Add a live reaction (emoji)
export async function addLiveReaction(streamId, userId, reactionType) {
  try {
    const reaction = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.liveReactionsCollectionId,
      ID.unique(),
      {
        streamId: streamId,
        userId: userId,
        reactionType: reactionType,
      }
    );

    return reaction;
  } catch (error) {
    
    throw new Error(`Failed to add live reaction: ${error.message}`);
  }
}

// Get user's live streams
export async function getUserLiveStreams(userId) {
  try {
    const streams = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      [
        Query.equal('hostId', userId),
        Query.orderDesc('startTime'),
        Query.limit(20)
      ]
    );

    return streams.documents;
  } catch (error) {
    return [];
  }
}

// Force end all user's active streams (for cleanup)
export async function forceEndUserStreams(userId) {
  try {
    const streams = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.liveStreamsCollectionId,
      [
        Query.equal('hostId', userId),
        Query.equal('isLive', true)
      ]
    );
    
    const endPromises = streams.documents.map(stream => 
      endLiveStream(stream.$id).catch(err => {
        return null;
      })
    );
    
    await Promise.all(endPromises);
    return streams.documents.length;
  } catch (error) {
    throw error;
  }
}

// Subscribe to live stream updates using polling (since realtime subscriptions are not working)
export function subscribeLiveStreamUpdates(streamId, callback) {
  let intervalId;
  
  const pollUpdates = async () => {
    try {
      const stream = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.liveStreamsCollectionId,
        streamId
      );
      
      if (stream) {
        callback({ payload: stream });
      }
    } catch (error) {
    }
  };
  
  pollUpdates();
  intervalId = setInterval(pollUpdates, 5000);

  return () => {
    if (intervalId) clearInterval(intervalId);
  };
}

// Helper function to validate streamId
function isValidStreamId(streamId) {
  if (!streamId || typeof streamId !== 'string') {
    return false;
  }
  
  const trimmedId = streamId.trim();
  if (trimmedId === '' || trimmedId === 'null' || trimmedId === 'undefined') {
    return false;
  }
  
  // Check if it looks like a valid Appwrite document ID (16-24 characters, alphanumeric)
  if (trimmedId.length < 16 || trimmedId.length > 24 || !/^[a-zA-Z0-9]+$/.test(trimmedId)) {
    return false;
  }
  
  // Additional check: ensure it doesn't contain any special characters that might cause issues
  if (trimmedId.includes(' ') || trimmedId.includes('\n') || trimmedId.includes('\t')) {
    return false;
  }
  
  return true;
}

// Subscribe to live comments using polling (since realtime subscriptions are not working)
export function subscribeLiveComments(streamId, callback) {
  // Validate streamId before proceeding
  if (!isValidStreamId(streamId)) {
    return () => {}; // Return empty unsubscribe function
  }

  let intervalId;
  let lastCommentTime = new Date().toISOString();
  let errorCount = 0;
  
  const pollComments = async () => {
    // Re-validate streamId on each poll to catch any changes
    if (!isValidStreamId(streamId)) {
      return;
    }

    try {
      // Use fallback method directly - get all recent comments and filter client-side
      const allComments = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.liveCommentsCollectionId,
        [
          Query.orderDesc('$createdAt'),
          Query.limit(50)
        ]
      );
      
      // Filter comments for this stream and newer than last check
      const filteredComments = allComments.documents.filter(comment => {
        const isForThisStream = comment.streamId === streamId;
        const isNewer = new Date(comment.$createdAt) > new Date(lastCommentTime);
        return isForThisStream && isNewer;
      });

      if (filteredComments.length > 0) {
        filteredComments.forEach(comment => {
          callback({
            events: ['databases.*.collections.*.documents.*.create'],
            payload: comment
          });
        });
        
        // Update last comment time
        lastCommentTime = filteredComments[0].$createdAt;
      }
      
      // Reset error count on successful query
      errorCount = 0;
    } catch (error) {
      errorCount++;
      
      // If we get too many errors, stop polling
      if (errorCount > 5) {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    }
  };
  
  pollComments();
  intervalId = setInterval(pollComments, 1200);
  
  // Return unsubscribe function
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}



// ================== FOLLOW/SUBSCRIBE FUNCTIONS ==================

// Follow a streamer
export async function followStreamer(followerId, followingId, followingUsername) {
  try {
    // Check if already following
    const existing = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      [
        Query.equal('followerId', followerId),
        Query.equal('followingId', followingId),
      ]
    );

    if (existing.documents.length > 0) {
      return existing.documents[0];
    }

    // Create follow relationship (store in user's following list)
    // Note: This is a simplified implementation. In production, you'd have a separate follows collection
    const follower = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      followerId
    );

    const currentFollowing = follower.following || [];
    const updatedFollowing = [...currentFollowing, followingId];

    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      followerId,
      {
        following: updatedFollowing,
      }
    );

    return { followerId, followingId, followingUsername };
  } catch (error) {
    throw new Error(`Failed to follow streamer: ${error.message}`);
  }
}

// Unfollow a streamer
export async function unfollowStreamer(followerId, followingId) {
  try {
    const follower = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      followerId
    );

    const currentFollowing = follower.following || [];
    const updatedFollowing = currentFollowing.filter(id => id !== followingId);

    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      followerId,
      {
        following: updatedFollowing,
      }
    );

    return true;
  } catch (error) {
    throw new Error(`Failed to unfollow streamer: ${error.message}`);
  }
}

// Check if following a user
export async function isFollowing(followerId, followingId) {
  try {
    const follower = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      followerId
    );

    const following = follower.following || [];
    return following.includes(followingId);
  } catch (error) {
    return false;
  }
}

// Get follower count
export async function getFollowerCount(userId) {
  try {
    // Count how many users have this userId in their following array
    const allUsers = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId
    );

    const followerCount = allUsers.documents.filter(user => {
      const following = user.following || [];
      return following.includes(userId);
    }).length;

    return followerCount;
  } catch (error) {
    return 0;
  }
}

// Get following count
export async function getFollowingCount(userId) {
  try {
    const user = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      userId
    );

    const following = user.following || [];
    return following.length;
  } catch (error) {
    return 0;
  }
}


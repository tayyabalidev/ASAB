/**
 * Call Management Functions
 * 
 * Handles call creation, acceptance, rejection, and management via Appwrite
 */

import { ID, Query } from "react-native-appwrite";
import { databases, client, appwriteConfig, createNotification } from "./appwrite";
import { CallState, CallType } from "./callHelper";
import { createVideoSDKRoomAndToken } from "./videosdkHelper";
import { videosdkTrace } from "./videosdkTrace";

// ================== CALL MANAGEMENT FUNCTIONS ==================

/**
 * Create a new call (initiate a call)
 */
export async function createCall(callerId, receiverId, callType = CallType.VIDEO, callerUsername = null) {
  try {
    // Get caller username if not provided
    if (!callerUsername) {
      try {
        const caller = await databases.getDocument(
          appwriteConfig.databaseId,
          appwriteConfig.userCollectionId,
          callerId
        );
        callerUsername = caller.username || caller.name || 'Unknown';
      } catch (error) {
        callerUsername = 'Unknown';
      }
    }

    await releaseOrphanCalls(callerId);
    await releaseOrphanCalls(receiverId);

    if (await hasOpenCall(receiverId)) {
      throw new Error('User is busy in another call');
    }

    // Create VideoSDK room + caller JWT before callee accepts (caller joins as participant 1).
    videosdkTrace('S1_ROOM', 'CALL_CREATE_START', { callerId, receiverId });
    const session = await createVideoSDKRoomAndToken(callerId);
    const roomId = session?.meetingId;
    const videosdkCallerToken = session?.token;
    if (!roomId) {
      throw new Error('Could not create VideoSDK room for this call.');
    }
    if (!videosdkCallerToken) {
      throw new Error('Could not create VideoSDK token for this call.');
    }
    videosdkTrace('S1_ROOM', 'CALL_CREATE_GOT_SESSION', {
      meetingId: roomId,
      callerId,
      hasToken: Boolean(videosdkCallerToken),
    });

    // Generate document ID (will be used for both document $id and callId)
    const documentId = ID.unique();
    
    // Prepare document data with all required attributes including callId
    const documentData = {
      callId: documentId, // Set callId to document ID (required attribute)
      callerId: callerId,
      receiverId: receiverId,
      callerUsername: callerUsername,
      callType: callType,
      status: CallState.CALLING,
      channelName: roomId,
      roomName: roomId,
      startTime: new Date().toISOString(),
    };
    
    // Create call document with all required attributes
    const call = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      documentId,
      documentData
    );

    videosdkTrace('S1_ROOM', 'CALL_STORED', {
      callId: call.$id,
      meetingId: roomId,
      channelName: call.channelName || roomId,
    });

    // Send notification to receiver
    try {
      await createNotification('call', callerId, receiverId, call.$id);
    } catch (notifError) {
      console.error('Failed to send call notification:', notifError);
    }

    return {
      ...call,
      videosdkCallerToken,
    };
  } catch (error) {
    throw new Error(`Failed to create call: ${error.message}`);
  }
}

/**
 * Accept a call
 */
export async function acceptCall(callId, receiverId) {
  try {
    const call = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId
    );

    // Verify receiver
    if (call.receiverId !== receiverId) {
      throw new Error('Unauthorized to accept this call');
    }

    videosdkTrace('S6_ACCEPT', 'START', {
      callId,
      receiverId,
      meetingId: String(call.channelName || call.roomName || '').trim() || null,
    });

    // Update call status
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId,
      {
        status: CallState.CONNECTING,
        acceptedAt: new Date().toISOString(),
      }
    );

    videosdkTrace('S6_ACCEPT', 'SUCCESS', {
      callId,
      meetingId: String(call.channelName || call.roomName || '').trim() || null,
    });

    return call;
  } catch (error) {
    videosdkTrace('S6_ACCEPT', 'FAIL', { callId, message: error?.message || String(error) });
    throw new Error(`Failed to accept call: ${error.message}`);
  }
}

/**
 * Reject a call
 */
export async function rejectCall(callId, receiverId) {
  try {
    const call = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId
    );

    // Verify receiver
    if (call.receiverId !== receiverId) {
      throw new Error('Unauthorized to reject this call');
    }

    // Update call status
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId,
      {
        status: CallState.REJECTED,
        endedAt: new Date().toISOString(),
      }
    );

    return true;
  } catch (error) {
    throw new Error(`Failed to reject call: ${error.message}`);
  }
}

/**
 * End a call
 */
export async function endCall(callId, userId) {
  try {
    const call = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId
    );

    // Verify user is part of the call
    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new Error('Unauthorized to end this call');
    }

    // Calculate call duration
    const startTime = new Date(call.startTime);
    const endTime = new Date();
    const duration = Math.floor((endTime - startTime) / 1000); // in seconds

    // Update call status
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId,
      {
        status: CallState.ENDED,
        endedAt: endTime.toISOString(),
        duration: duration,
      }
    );

    return true;
  } catch (error) {
    throw new Error(`Failed to end call: ${error.message}`);
  }
}

/**
 * Update call status (for real-time updates)
 */
export async function updateCallStatus(callId, status) {
  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId,
      {
        status: status,
      }
    );

    return true;
  } catch (error) {
    throw new Error(`Failed to update call status: ${error.message}`);
  }
}

const OPEN_CALL_STATUSES = [
  CallState.CALLING,
  CallState.CONNECTING,
  CallState.CONNECTED,
];

/**
 * True if user still has any non-ended call document.
 */
export async function hasOpenCall(userId) {
  if (!userId) return false;
  for (const status of OPEN_CALL_STATUSES) {
    try {
      const calls = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        [
          Query.or([
            Query.equal('callerId', userId),
            Query.equal('receiverId', userId),
          ]),
          Query.equal('status', status),
          Query.limit(1),
        ]
      );
      if (calls.documents.length > 0) return true;
    } catch (_) {
      /* try next status */
    }
  }
  return false;
}

/**
 * Get active call for a user (ringing, connecting, or connected).
 */
export async function getActiveCall(userId) {
  try {
    const calls = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      [
        Query.or([
          Query.equal('callerId', userId),
          Query.equal('receiverId', userId),
        ]),
        Query.or(OPEN_CALL_STATUSES.map((status) => Query.equal('status', status))),
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ]
    );

    return calls.documents.length > 0 ? calls.documents[0] : null;
  } catch (error) {
    return null;
  }
}

/**
 * Force a call document to ended (fallback when endCall fails).
 */
export async function forceEndCallDocument(callId, userId) {
  const endTime = new Date().toISOString();
  try {
    const call = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId
    );
    if (call.callerId !== userId && call.receiverId !== userId) {
      return false;
    }
    let duration = 0;
    try {
      const startTime = new Date(call.startTime);
      duration = Math.max(0, Math.floor((Date.now() - startTime.getTime()) / 1000));
    } catch (_) {
      duration = 0;
    }
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId,
      {
        status: CallState.ENDED,
        endedAt: endTime,
        duration,
      }
    );
    return true;
  } catch (_) {
    try {
      await updateCallStatus(callId, CallState.ENDED);
      return true;
    } catch (__) {
      return false;
    }
  }
}

/**
 * End any open call documents for this user (stale CONNECTED rows after abrupt exit).
 */
export async function releaseOrphanCalls(userId) {
  if (!userId) return;
  const seen = new Set();

  for (const status of OPEN_CALL_STATUSES) {
    try {
      const calls = await databases.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        [
          Query.or([
            Query.equal('callerId', userId),
            Query.equal('receiverId', userId),
          ]),
          Query.equal('status', status),
          Query.orderDesc('$createdAt'),
          Query.limit(25),
        ]
      );

      for (const call of calls.documents) {
        if (!call?.$id || seen.has(call.$id)) continue;
        seen.add(call.$id);
        try {
          await endCall(call.$id, userId);
        } catch (_) {
          await forceEndCallDocument(call.$id, userId);
        }
      }
    } catch (error) {
      if (__DEV__) console.warn('[calls] releaseOrphanCalls', status, error);
    }
  }
}

/**
 * Get incoming call for a user
 */
export async function getIncomingCall(userId) {
  try {
    const calls = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      [
        Query.equal('receiverId', userId),
        Query.equal('status', CallState.CALLING),
        Query.orderDesc('$createdAt'),
        Query.limit(1),
      ]
    );

    return calls.documents.length > 0 ? calls.documents[0] : null;
  } catch (error) {
    return null;
  }
}

/**
 * Get call history for a user
 */
export async function getCallHistory(userId, limit = 50) {
  try {
    const calls = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      [
        Query.or([
          Query.equal('callerId', userId),
          Query.equal('receiverId', userId),
        ]),
        Query.equal('status', CallState.ENDED),
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
      ]
    );

    return calls.documents;
  } catch (error) {
    return [];
  }
}

/**
 * Get call by ID
 */
export async function getCallById(callId) {
  try {
    const call = await databases.getDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      callId
    );

    return call;
  } catch (error) {
    throw new Error(`Failed to get call: ${error.message}`);
  }
}

/**
 * Subscribe to call document changes: Appwrite Realtime first, with deduped polling fallback
 * so accept/reject propagates quickly between caller and callee (near real-time).
 */
export function subscribeCallUpdates(callId, callback) {
  let lastSig = '';
  const emit = (call) => {
    if (!call || call.$id !== callId) return;
    const sig = `${call.status}-${call.$updatedAt || call.$createdAt || ''}`;
    if (sig === lastSig) return;
    lastSig = sig;
    callback({ payload: call });
  };

  const fetchAndEmit = async () => {
    try {
      const call = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        callId
      );
      emit(call);
    } catch (error) {
      console.error('Error fetching call updates:', error);
    }
  };

  fetchAndEmit();

  const channel = `databases.${appwriteConfig.databaseId}.collections.${appwriteConfig.callsCollectionId}.documents.${callId}`;
  let realtimeUnsub = null;
  try {
    realtimeUnsub = client.subscribe(channel, () => {
      fetchAndEmit();
    });
  } catch (e) {
    console.warn('[calls] Appwrite Realtime subscribe failed, using polling only:', e?.message || e);
  }

  const intervalId = setInterval(fetchAndEmit, 1200);

  return () => {
    if (realtimeUnsub) {
      try {
        realtimeUnsub();
      } catch (_) {}
    }
    if (intervalId) clearInterval(intervalId);
  };
}

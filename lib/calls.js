/**
 * Call Management Functions
 * 
 * Handles call creation, acceptance, rejection, and management via Appwrite
 */

import { ID, Query } from "react-native-appwrite";
import { databases, client, appwriteConfig, createNotification } from "./appwrite";
import { CallState, CallType } from "./callHelper";

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

    // Check if receiver is already in a call
    const activeCalls = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      [
        Query.or([
          Query.equal('callerId', receiverId),
          Query.equal('receiverId', receiverId),
        ]),
        Query.equal('status', CallState.CONNECTED),
      ]
    );

    if (activeCalls.documents.length > 0) {
      throw new Error('User is busy in another call');
    }

    // Generate channel name for the call (sort IDs to ensure consistency)
    // Use a consistent format that both users will use
    const sortedIds = [callerId, receiverId].sort();
    const timestamp = Date.now();
    const channelName = `call_${sortedIds[0]}_${sortedIds[1]}_${timestamp}`;
    
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
      channelName: channelName,
      roomName: channelName,
      startTime: new Date().toISOString(),
    };
    
    // Create call document with all required attributes
    const call = await databases.createDocument(
      appwriteConfig.databaseId,
      appwriteConfig.callsCollectionId,
      documentId,
      documentData
    );

    // Send notification to receiver
    try {
      await createNotification('call', callerId, receiverId, call.$id);
    } catch (notifError) {
      console.error('Failed to send call notification:', notifError);
    }

    return call;
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

    return call;
  } catch (error) {
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

/**
 * Get active call for a user
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
        Query.equal('status', CallState.CONNECTED),
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
 * Subscribe to call updates using polling
 */
export function subscribeCallUpdates(callId, callback) {
  let intervalId;
  
  const pollUpdates = async () => {
    try {
      const call = await databases.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.callsCollectionId,
        callId
      );
      
      if (call) {
        callback({ payload: call });
      }
    } catch (error) {
      console.error('Error polling call updates:', error);
    }
  };
  
  // Poll every 2 seconds for calls
  intervalId = setInterval(pollUpdates, 2000);
  
  // Return unsubscribe function
  return () => {
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}

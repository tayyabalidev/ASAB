/**
 * Call Helper Functions
 * 
 * General call utilities and constants (SDK-agnostic)
 */

/**
 * Generate unique channel name for a call
 */
export function generateCallChannelName(callerId, receiverId) {
  // Sort IDs to ensure same channel name for both users
  const sortedIds = [callerId, receiverId].sort();
  return `call_${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`;
}

/**
 * Call state constants
 */
export const CallState = {
  IDLE: 'idle',
  CALLING: 'calling',
  RINGING: 'ringing',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ENDED: 'ended',
  REJECTED: 'rejected',
  BUSY: 'busy',
  FAILED: 'failed',
};

/**
 * Call type constants
 */
export const CallType = {
  AUDIO: 'audio',
  VIDEO: 'video',
};

/**
 * Call event handlers
 */
export const CallEventHandlers = {
  onCallStateChanged: (state) => {
    console.log('Call state changed:', state);
  },
  
  onRemoteUserJoined: (uid) => {
    console.log('Remote user joined:', uid);
  },
  
  onRemoteUserLeft: (uid) => {
    console.log('Remote user left:', uid);
  },
  
  onError: (err, msg) => {
    console.error('Call error:', err, msg);
  },
  
  onNetworkQuality: (uid, txQuality, rxQuality) => {
    if (txQuality > 3 || rxQuality > 3) {
      console.warn('Poor network quality:', { uid, txQuality, rxQuality });
    }
  },
};

/**
 * Get human-readable call error messages (generic)
 */
export function getCallErrorMessage(errorCode) {
  const errorMessages = {
    601: 'Network error',
    602: 'No server response',
    603: 'SDK initialization failed',
    604: 'Invalid argument',
  };
  
  return errorMessages[errorCode] || `Call error: ${errorCode}`;
}

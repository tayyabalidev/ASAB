/**
 * Call Helper Functions
 * 
 * General call utilities and constants (SDK-agnostic)
 */

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

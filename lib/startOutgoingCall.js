/**
 * Single entry point for starting outgoing calls (chat header, profile, CallButton).
 */
import { router } from 'expo-router';
import { releaseOrphanCalls } from './calls';

/**
 * @param {{ userId: string, receiverId: string, callType?: 'audio' | 'video' }} opts
 */
export async function startOutgoingCall({ userId, receiverId, callType = 'audio' }) {
  if (!userId) {
    throw new Error('Sign in to place a call');
  }
  if (!receiverId) {
    throw new Error('No contact selected');
  }
  if (receiverId === userId) {
    throw new Error('You cannot call yourself');
  }

  await releaseOrphanCalls(userId);

  router.push({
    pathname: '/call',
    params: {
      receiverId,
      callType,
    },
  });
}

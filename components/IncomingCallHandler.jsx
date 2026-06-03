/**
 * Routes incoming calls to the full-screen call UI (single accept flow).
 * Uses Appwrite realtime with fast polling fallback.
 */

import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { useGlobalContext } from '../context/GlobalProvider';
import { subscribeIncomingCalls } from '../lib/calls';
import { videosdkTrace } from '../lib/videosdkTrace';

const IncomingCallHandler = () => {
  const { user } = useGlobalContext();
  const unsubscribeRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const routedCallIdsRef = useRef(new Set());

  useEffect(() => {
    if (!user?.$id) return undefined;

    const openIncomingCall = (incomingCall) => {
      const callId = incomingCall?.$id;
      if (!callId || routedCallIdsRef.current.has(callId)) return;

      routedCallIdsRef.current.add(callId);

      const meetingId = String(
        incomingCall.channelName || incomingCall.roomName || ''
      ).trim();
      videosdkTrace('S5_INCOMING', 'NAVIGATE', {
        callId,
        meetingId: meetingId || null,
        status: incomingCall.status,
        callerId: incomingCall.callerId || null,
      });

      router.push({
        pathname: '/call',
        params: { callId },
      });
    };

    unsubscribeRef.current = subscribeIncomingCalls(user.$id, openIncomingCall);

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        routedCallIdsRef.current.clear();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      subscription.remove();
      routedCallIdsRef.current.clear();
    };
  }, [user?.$id]);

  return null;
};

export default IncomingCallHandler;

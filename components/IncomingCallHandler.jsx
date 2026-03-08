/**
 * Incoming Call Handler Component
 * 
 * Listens for incoming calls and shows notification/redirects to call screen
 * FIXED: Prevents duplicate popups by tracking shown calls
 */

import React, { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { router } from 'expo-router';
import { useGlobalContext } from '../context/GlobalProvider';
import { getIncomingCall, rejectCall } from '../lib/calls';
import { CallState } from '../lib/callHelper';

const IncomingCallHandler = () => {
  const { user } = useGlobalContext();
  const pollingIntervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const shownCallIdsRef = useRef(new Set()); // Track calls we've already shown
  const isNavigatingRef = useRef(false); // Prevent multiple navigations

  useEffect(() => {
    if (!user?.$id) return;

    // Poll for incoming calls
    const pollForIncomingCalls = async () => {
      try {
        // Skip if already navigating
        if (isNavigatingRef.current) return;

        const incomingCall = await getIncomingCall(user.$id);
        
        if (incomingCall && incomingCall.status === CallState.CALLING) {
          const callId = incomingCall.$id;
          
          // Skip if we've already shown this call
          if (shownCallIdsRef.current.has(callId)) {
            return;
          }

          // Mark this call as shown
          shownCallIdsRef.current.add(callId);
          isNavigatingRef.current = true;

          const callType = incomingCall.callType === 'video' ? 'Video' : 'Audio';
          const callerName = incomingCall.callerUsername || 'Someone';
          
          // Show alert and navigate to call screen
          Alert.alert(
            `Incoming ${callType} Call`,
            `${callerName} is calling you...`,
            [
              {
                text: 'Decline',
                style: 'cancel',
                onPress: async () => {
                  try {
                    // Reject the call immediately
                    await rejectCall(callId, user.$id);
                    // Remove from shown calls so it won't show again
                    shownCallIdsRef.current.delete(callId);
                    isNavigatingRef.current = false;
                  } catch (error) {
                    console.error('Error rejecting call:', error);
                    shownCallIdsRef.current.delete(callId);
                    isNavigatingRef.current = false;
                  }
                },
              },
              {
                text: 'Accept',
                onPress: () => {
                  // Navigate to call screen
                  router.push({
                    pathname: '/call',
                    params: {
                      callId: callId,
                    },
                  });
                  // Reset navigation flag after a delay
                  setTimeout(() => {
                    isNavigatingRef.current = false;
                  }, 2000);
                },
              },
            ],
            { 
              cancelable: false,
              onDismiss: () => {
                // If alert is dismissed, reset flags
                shownCallIdsRef.current.delete(callId);
                isNavigatingRef.current = false;
              }
            }
          );

          // Navigate to call screen (will be handled by Accept button, but this ensures navigation)
          router.push({
            pathname: '/call',
            params: {
              callId: callId,
            },
          });
        } else {
          // If call status changed (not CALLING), remove from shown set
          if (incomingCall) {
            const callId = incomingCall.$id;
            if (incomingCall.status !== CallState.CALLING) {
              shownCallIdsRef.current.delete(callId);
            }
          }
        }
      } catch (error) {
        console.error('Error checking for incoming calls:', error);
        isNavigatingRef.current = false;
      }
    };

    // Poll every 5 seconds (reduced frequency to prevent spam)
    pollingIntervalRef.current = setInterval(pollForIncomingCalls, 5000);

    // Also check immediately
    pollForIncomingCalls();

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App came to foreground, check for calls
        pollForIncomingCalls();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      subscription.remove();
      // Clean up shown calls set
      shownCallIdsRef.current.clear();
      isNavigatingRef.current = false;
    };
  }, [user?.$id]);

  return null; // This component doesn't render anything
};

export default IncomingCallHandler;

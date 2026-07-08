import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useGlobalContext } from '../context/GlobalProvider';
import {
  configurePushNotificationHandler,
  extractPushData,
  isPushAvailable,
  registerForPushNotifications,
} from '../lib/pushNotificationService';
import {
  navigateFromPushData,
  shouldHandlePushResponse,
} from '../lib/notificationNavigation';
import { refreshNotificationsFromPush } from '../lib/notificationService';
import { refreshMessagesFromPush } from '../lib/messageService';

/**
 * Registers the device push token and routes notification taps (live streams, messages).
 */
export function usePushNotifications() {
  const { user, isLogged, loading } = useGlobalContext();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = Boolean(rootNavigationState?.key);

  const handledResponseIdsRef = useRef(new Set());
  const pendingPayloadRef = useRef(null);

  useEffect(() => {
    configurePushNotificationHandler();
  }, []);

  const tryNavigate = useCallback(
    (data) => {
      if (!data) return;
      if (!navigationReady || !isLogged || loading) {
        pendingPayloadRef.current = data;
        return;
      }
      navigateFromPushData(router, data);
    },
    [isLogged, loading, navigationReady, router]
  );

  useEffect(() => {
    if (!navigationReady || !isLogged || loading || !pendingPayloadRef.current) return;
    const data = pendingPayloadRef.current;
    pendingPayloadRef.current = null;
    navigateFromPushData(router, data);
  }, [isLogged, loading, navigationReady, router]);

  useEffect(() => {
    if (!isPushAvailable()) return undefined;

    const handleResponse = async (response) => {
      if (!response) return;

      const responseId = response?.notification?.request?.identifier;
      if (responseId && handledResponseIdsRef.current.has(responseId)) return;

      const shouldHandle = await shouldHandlePushResponse(response);
      if (!shouldHandle) return;

      if (responseId) handledResponseIdsRef.current.add(responseId);

      const data = extractPushData(response?.notification);
      tryNavigate(data);
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response).catch(() => {});
    });

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response).catch(() => {});
      })
      .catch(() => {});

    return () => {
      responseSub.remove();
    };
  }, [tryNavigate]);

  // Foreground push — refresh inbox/messages immediately
  useEffect(() => {
    if (!isPushAvailable()) return undefined;

    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      refreshNotificationsFromPush();
      refreshMessagesFromPush();
    });

    return () => {
      receivedSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!isPushAvailable() || !isLogged || !user?.$id) return;
    registerForPushNotifications(user.$id).catch(() => {});
  }, [isLogged, user?.$id]);

  // Re-register push token when app returns to foreground (token can rotate).
  useEffect(() => {
    if (!isPushAvailable() || !isLogged || !user?.$id) return undefined;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        registerForPushNotifications(user.$id).catch(() => {});
      }
    });

    return () => sub.remove();
  }, [isLogged, user?.$id]);
}

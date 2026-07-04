import { useEffect, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useGlobalContext } from '../context/GlobalProvider';
import {
  configurePushNotificationHandler,
  extractPushData,
  isPushAvailable,
  navigateFromPushPayload,
  registerForPushNotifications,
} from '../lib/pushNotificationService';
import { refreshNotificationsFromPush } from '../lib/notificationService';
import { refreshMessagesFromPush } from '../lib/messageService';

/**
 * Registers the device push token and routes notification taps (live streams, messages).
 */
export function usePushNotifications() {
  const { user, isLogged, loading } = useGlobalContext();
  const router = useRouter();
  const handledResponseIdsRef = useRef(new Set());
  const pendingPayloadRef = useRef(null);

  useEffect(() => {
    configurePushNotificationHandler();
  }, []);

  const tryNavigate = useCallback(
    (data) => {
      if (!data) return;
      if (!isLogged || loading) {
        pendingPayloadRef.current = data;
        return;
      }
      navigateFromPushPayload(router, data);
    },
    [isLogged, loading, router]
  );

  useEffect(() => {
    if (!isLogged || loading || !pendingPayloadRef.current) return;
    const data = pendingPayloadRef.current;
    pendingPayloadRef.current = null;
    navigateFromPushPayload(router, data);
  }, [isLogged, loading, router]);

  useEffect(() => {
    if (!isPushAvailable()) return undefined;

    const handleResponse = (response) => {
      const responseId = response?.notification?.request?.identifier;
      if (responseId && handledResponseIdsRef.current.has(responseId)) return;
      if (responseId) handledResponseIdsRef.current.add(responseId);

      const data = extractPushData(response?.notification);
      tryNavigate(data);
    };

    const responseSub = Notifications.addNotificationResponseReceivedListener(handleResponse);

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
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
}

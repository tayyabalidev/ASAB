import { useNotificationContext } from '../context/NotificationProvider';

/**
 * Reads notifications from the global NotificationProvider (always subscribed at app root).
 */
export function useNotifications() {
  const { notifications, unreadCount, loading, setNotifications } = useNotificationContext();
  return { notifications, setNotifications, unreadCount, loading };
}

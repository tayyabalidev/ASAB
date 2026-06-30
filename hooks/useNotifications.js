import { useState, useEffect } from 'react';
import { useGlobalContext } from '../context/GlobalProvider';
import { subscribeNotificationUpdates } from '../lib/notificationService';

/**
 * Shared hook for in-app notification list + unread count.
 * Backed by Appwrite Realtime (with polling fallback).
 */
export function useNotifications() {
  const { user } = useGlobalContext();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.$id) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    return subscribeNotificationUpdates(user.$id, ({ notifications: next, unreadCount: count }) => {
      setNotifications(next);
      setUnreadCount(count);
      setLoading(false);
    });
  }, [user?.$id]);

  return { notifications, setNotifications, unreadCount, loading };
}

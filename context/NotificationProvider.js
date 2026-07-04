import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useGlobalContext } from './GlobalProvider';
import { subscribeNotificationUpdates } from '../lib/notificationService';

const NotificationContext = createContext({
  notifications: [],
  unreadCount: 0,
  loading: true,
  setNotifications: () => {},
});

export function NotificationProvider({ children }) {
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

  const value = useMemo(
    () => ({ notifications, unreadCount, loading, setNotifications }),
    [notifications, unreadCount, loading]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  return useContext(NotificationContext);
}

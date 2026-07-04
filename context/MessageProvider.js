import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Query } from 'react-native-appwrite';
import { useGlobalContext } from './GlobalProvider';
import { subscribeMessageUpdates, updateMessageSubscriptionGroups } from '../lib/messageService';
import { databases, appwriteConfig } from '../lib/appwrite';

const MessageContext = createContext({
  messages: [],
  loading: true,
  syncGroupIds: () => {},
});

async function fetchUserGroupIds(userId) {
  try {
    const res = await databases.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.chatsCollectionId,
      [
        Query.equal('type', ['group']),
        Query.contains('members', [userId]),
        Query.limit(100),
      ]
    );
    return res.documents.map((g) => g.$id);
  } catch (_) {
    return [];
  }
}

export function MessageProvider({ children }) {
  const { user } = useGlobalContext();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const groupIdsRef = useRef([]);

  useEffect(() => {
    if (!user?.$id) {
      setMessages([]);
      setLoading(false);
      groupIdsRef.current = [];
      return undefined;
    }

    let unsub = () => {};
    let cancelled = false;
    setLoading(true);

    (async () => {
      const ids = await fetchUserGroupIds(user.$id);
      if (cancelled) return;

      groupIdsRef.current = ids;
      unsub = subscribeMessageUpdates(
        user.$id,
        ({ messages: next }) => {
          setMessages(next);
          setLoading(false);
        },
        { groupIds: ids }
      );
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.$id]);

  const syncGroupIds = useCallback((ids) => {
    const incoming = (ids || []).filter(Boolean);
    const merged = [...new Set([...groupIdsRef.current, ...incoming])];
    const changed =
      merged.length !== groupIdsRef.current.length ||
      merged.some((id, i) => id !== groupIdsRef.current[i]);

    if (changed) {
      groupIdsRef.current = merged;
      updateMessageSubscriptionGroups(merged);
    }
  }, []);

  const value = useMemo(
    () => ({ messages, loading, syncGroupIds }),
    [messages, loading, syncGroupIds]
  );

  return <MessageContext.Provider value={value}>{children}</MessageContext.Provider>;
}

export function useMessageContext() {
  return useContext(MessageContext);
}

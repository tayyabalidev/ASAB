import { useEffect } from 'react';
import { useMessageContext } from '../context/MessageProvider';

/**
 * Real-time user messages (DMs + group chats) from the global MessageProvider.
 */
export function useUserMessages(groupIds = []) {
  const { messages, loading, syncGroupIds } = useMessageContext();

  const groupKey = (groupIds || []).join(',');

  useEffect(() => {
    const ids = groupKey ? groupKey.split(',').filter(Boolean) : [];
    if (ids.length) syncGroupIds(ids);
  }, [groupKey, syncGroupIds]);

  return { messages, loading };
}

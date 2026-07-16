import { databases, appwriteConfig, createNotification, getAllPlatformUserIds } from './appwrite';
import { requestAdminContentBroadcast } from './adminBroadcastClient';
import { requestCreatorContentNotify } from './creatorContentNotifyClient';
import { getCreatorContentRecipientIds } from './creatorSubscriptions';
import { sendCreatorContentPushNotifications } from './pushNotificationService';
import { isPlatformBroadcaster } from './ceo';

const NOTIFY_BATCH_SIZE = 25;

async function notifyRecipientsInBatches(creatorId, type, postId, recipientIds) {
  const notifiedIds = [];

  for (let i = 0; i < recipientIds.length; i += NOTIFY_BATCH_SIZE) {
    const batch = recipientIds.slice(i, i + NOTIFY_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((targetUserId) => createNotification(type, creatorId, targetUserId, postId))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        notifiedIds.push(batch[index]);
      }
    });

    if (i + NOTIFY_BATCH_SIZE < recipientIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return notifiedIds;
}

/**
 * Notify followers / favorites / bell subscribers — must not block publish/go-live.
 * Prefers server fan-out (API key reads expoPushToken) — same delivery path as DM push relay.
 * CEO/admin accounts broadcast to every user on the platform.
 */
export function scheduleCreatorSubscriberNotifications({
  creatorId,
  type,
  postId = null,
  title = '',
  creatorAccount = null,
}) {
  if (!creatorId || !type) return;

  setTimeout(() => {
    (async () => {
      try {
        let creator = creatorAccount;
        if (!creator || !creator.$id) {
          creator = await databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            creatorId
          );
        }

        const ceoBroadcast = isPlatformBroadcaster(creator);

        if (ceoBroadcast) {
          const handledByAdminBroadcast = await requestAdminContentBroadcast({
            creatorAccount: creator,
            creatorId,
            type,
            postId,
            title,
          });
          if (handledByAdminBroadcast) return;
        }

        // Resolve audience on device when possible (followers ∪ favorites ∪ subscribers).
        // Admin broadcast without server URL falls through to platform-wide list below.
        let recipients = [];
        if (!ceoBroadcast) {
          recipients = await getCreatorContentRecipientIds(creatorId);
        }

        // Server-side notify (API key token read) — mirrors working DM push relay.
        const handledByServer = await requestCreatorContentNotify({
          creatorId,
          creatorEmail: creator?.email || '',
          type,
          postId,
          title,
          recipientIds: ceoBroadcast ? null : recipients,
        });
        if (handledByServer) return;

        if (ceoBroadcast) {
          recipients = await getAllPlatformUserIds(creatorId);
          if (__DEV__ && recipients.length === 0) {
            console.warn(
              '[notifications] Platform broadcast: no users found. Deploy admin-broadcast / set EXPO_PUBLIC_PROCESSING_SERVER_URL, or check Appwrite users read permissions.'
            );
          }
        }

        if (!recipients.length) {
          if (__DEV__) {
            console.warn(
              '[notifications] No recipients for',
              type,
              '— creator has no followers/favorites/subscribers (or platform list empty).'
            );
          }
          return;
        }

        const notifiedIds = await notifyRecipientsInBatches(
          creatorId,
          type,
          postId,
          recipients
        );

        await sendCreatorContentPushNotifications({
          type,
          creatorUserId: creatorId,
          creatorUsername: creator?.username,
          postId,
          title,
          subscriberIds: notifiedIds.length ? notifiedIds : recipients,
          broadcast: ceoBroadcast,
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('[notifications] Fan-out failed:', error?.message || error);
        }
      }
    })();
  }, 0);
}

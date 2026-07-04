import { databases, appwriteConfig, createNotification, getAllPlatformUserIds } from './appwrite';
import { requestAdminContentBroadcast } from './adminBroadcastClient';
import { getCreatorNotificationSubscriberIds } from './creatorSubscriptions';
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
 * Notify bell subscribers in the background — must not block publish/go-live flows.
 * CEO/admin accounts broadcast to every user on the platform (videos, photos, live).
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
          const handledByServer = await requestAdminContentBroadcast({
            creatorAccount: creator,
            creatorId,
            type,
            postId,
            title,
          });
          if (handledByServer) return;
        }

        let recipients = [];

        if (ceoBroadcast) {
          recipients = await getAllPlatformUserIds(creatorId);
          if (__DEV__ && recipients.length === 0) {
            console.warn(
              '[notifications] Platform broadcast: no users found. Check Appwrite users collection read permissions or configure EXPO_PUBLIC_PROCESSING_SERVER_URL for server broadcast.'
            );
          }
        } else {
          const subscriberIds = await getCreatorNotificationSubscriberIds(creatorId);
          recipients = subscriberIds.filter((id) => id && id !== creatorId);
        }

        if (!recipients.length) return;

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
        });
      } catch (error) {
        if (__DEV__) {
          console.warn('[notifications] Fan-out failed:', error?.message || error);
        }
      }
    })();
  }, 0);
}

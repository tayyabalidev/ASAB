import { databases, appwriteConfig, createNotification } from './appwrite';
import { getCreatorNotificationSubscriberIds } from './creatorSubscriptions';
import { sendCreatorContentPushNotifications } from './pushNotificationService';

/**
 * Notify bell subscribers in the background — must not block publish/go-live flows.
 */
export function scheduleCreatorSubscriberNotifications({
  creatorId,
  type,
  postId = null,
  title = '',
}) {
  if (!creatorId || !type) return;

  setTimeout(() => {
    (async () => {
      try {
        const [creator, subscriberIds] = await Promise.all([
          databases.getDocument(
            appwriteConfig.databaseId,
            appwriteConfig.userCollectionId,
            creatorId
          ),
          getCreatorNotificationSubscriberIds(creatorId),
        ]);

        const recipients = subscriberIds.filter((id) => id && id !== creatorId);
        if (!recipients.length) return;

        const notifiedIds = [];
        for (const targetUserId of recipients) {
          try {
            await createNotification(type, creatorId, targetUserId, postId);
            notifiedIds.push(targetUserId);
          } catch (_) {
            /* continue with other subscribers */
          }
        }

        await sendCreatorContentPushNotifications({
          type,
          creatorUserId: creatorId,
          creatorUsername: creator?.username,
          postId,
          title,
          subscriberIds: notifiedIds.length ? notifiedIds : recipients,
        });
      } catch (_) {
        /* notifications must never affect content publish */
      }
    })();
  }, 0);
}

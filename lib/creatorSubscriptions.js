import { databases, appwriteConfig } from './appwrite';

const SUBSCRIBERS_ATTR = 'notificationSubscribers';
const SUBSCRIBERS_STRING_MAX_LEN = 500;

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean).map(String))];
}

function parseSubscribers(raw) {
  if (Array.isArray(raw)) {
    return uniqueIds(raw);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return uniqueIds(raw.split(',').map((part) => part.trim()));
  }
  return [];
}

function subscribersToStorageValue(subscribers, existingRaw) {
  const ids = uniqueIds(subscribers);

  if (Array.isArray(existingRaw)) {
    return ids;
  }

  const joined = ids.join(',');
  if (joined.length > SUBSCRIBERS_STRING_MAX_LEN) {
    throw new Error(
      'Too many notification subscribers for the 500-character limit. In Appwrite, change notificationSubscribers to String Array.'
    );
  }

  return joined;
}

function isStringSchemaError(message) {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('invalid type') ||
    text.includes('must be a valid string') ||
    text.includes('no longer than 500')
  );
}

async function getCreatorDoc(creatorId) {
  return databases.getDocument(
    appwriteConfig.databaseId,
    appwriteConfig.userCollectionId,
    creatorId
  );
}

async function saveSubscribers(creatorId, subscribers, existingRaw) {
  const payload = subscribersToStorageValue(subscribers, existingRaw);

  try {
    await databases.updateDocument(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
      creatorId,
      { [SUBSCRIBERS_ATTR]: payload }
    );
    return;
  } catch (error) {
    const message = String(error?.message || error || '');

    if (Array.isArray(payload) && isStringSchemaError(message)) {
      const joined = uniqueIds(subscribers).join(',');
      if (joined.length > SUBSCRIBERS_STRING_MAX_LEN) {
        throw new Error(
          'Too many notification subscribers for the 500-character limit. In Appwrite, change notificationSubscribers to String Array.'
        );
      }

      await databases.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.userCollectionId,
        creatorId,
        { [SUBSCRIBERS_ATTR]: joined }
      );
      return;
    }

    if (message.includes('Unknown attribute') || message.includes('Attribute not found')) {
      throw new Error(
        'Add attribute "notificationSubscribers" on the users collection in Appwrite (String or String Array).'
      );
    }

    throw error;
  }
}

export function isUserSubscribedToCreator(creatorDoc, subscriberId) {
  if (!creatorDoc || !subscriberId) return false;
  const subscribers = parseSubscribers(creatorDoc[SUBSCRIBERS_ATTR]);
  return subscribers.includes(String(subscriberId));
}

export async function getCreatorNotificationSubscriberIds(creatorId) {
  if (!creatorId) return [];
  try {
    const creator = await getCreatorDoc(creatorId);
    return parseSubscribers(creator[SUBSCRIBERS_ATTR]);
  } catch (_) {
    return [];
  }
}

/**
 * Recipients for post/live pushes: followers ∪ bell subscribers ∪ profile favorites.
 * Followers alone are enough even when notificationSubscribers is missing/empty.
 */
export async function getCreatorContentRecipientIds(creatorId) {
  if (!creatorId) return [];
  try {
    const creator = await getCreatorDoc(creatorId);
    const followers = Array.isArray(creator.followers) ? creator.followers : [];
    const favorites = Array.isArray(creator.profileLikes) ? creator.profileLikes : [];
    const subscribers = parseSubscribers(creator[SUBSCRIBERS_ATTR]);
    return uniqueIds([...followers, ...favorites, ...subscribers]).filter(
      (id) => id && id !== String(creatorId)
    );
  } catch (_) {
    return [];
  }
}

export async function setCreatorNotificationSubscription(creatorId, subscriberId, enabled) {
  if (!creatorId || !subscriberId || creatorId === subscriberId) {
    throw new Error('Invalid subscription request');
  }

  const creator = await getCreatorDoc(creatorId);
  const existingRaw = creator[SUBSCRIBERS_ATTR];
  let subscribers = parseSubscribers(existingRaw);
  const subscriberKey = String(subscriberId);
  const alreadySubscribed = subscribers.includes(subscriberKey);

  if (enabled && !alreadySubscribed) {
    subscribers.push(subscriberKey);
  } else if (!enabled && alreadySubscribed) {
    subscribers = subscribers.filter((id) => id !== subscriberKey);
  } else {
    return { enabled: alreadySubscribed, notificationSubscribers: subscribers };
  }

  await saveSubscribers(creatorId, subscribers, existingRaw);

  return { enabled: subscribers.includes(subscriberKey), notificationSubscribers: subscribers };
}

export async function toggleCreatorNotificationSubscription(creatorId, subscriberId) {
  const creator = await getCreatorDoc(creatorId);
  const subscribed = isUserSubscribedToCreator(creator, subscriberId);
  return setCreatorNotificationSubscription(creatorId, subscriberId, !subscribed);
}

/** Default-on when a user follows a creator. */
export async function enableCreatorNotificationsOnFollow(creatorId, subscriberId) {
  try {
    return await setCreatorNotificationSubscription(creatorId, subscriberId, true);
  } catch (_) {
    return null;
  }
}

/** Remove subscription when a user unfollows. */
export async function disableCreatorNotificationsOnUnfollow(creatorId, subscriberId) {
  try {
    return await setCreatorNotificationSubscription(creatorId, subscriberId, false);
  } catch (_) {
    return null;
  }
}

import { ID } from 'react-native-appwrite';
import {
  appwriteConfig,
  createPhotoPost,
  createVideoPost,
  databases,
} from './appwrite';
import { isMuxUploadEnabled } from './muxConfig';
import { publishVideoWithMux } from './muxClient';

function textCollectionId() {
  return (
    (typeof process !== 'undefined' &&
      process.env?.EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID &&
      String(process.env.EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID).trim()) ||
    appwriteConfig.circleTextPostsCollectionId ||
    ''
  );
}

export function areCircleTextPostsConfigured() {
  return Boolean(textCollectionId());
}

/**
 * Text-only Circle post. Never appears on Home (separate collection).
 */
export async function createCircleTextPost({
  user,
  circleId,
  body,
  title = '',
} = {}) {
  if (!user?.$id) throw new Error('Sign in to post');
  const cid = String(circleId || '').trim();
  if (!cid) throw new Error('Circle is required');
  const text =
    String(body || '').trim() || String(title || '').trim();
  if (!text) throw new Error('Write something to post');

  const collectionId = textCollectionId();
  if (!collectionId) {
    throw new Error(
      'Circle text posts are not configured. Set EXPO_PUBLIC_CIRCLE_TEXT_POSTS_COLLECTION_ID.'
    );
  }

  const payload = {
    circleId: cid,
    body: text.slice(0, 2000),
    title: String(title || '').trim().slice(0, 120),
    creatorId: String(user.$id),
    creatorUsername: user.username || user.name || 'User',
    creatorAvatar: user.avatar || '',
    createdAt: new Date().toISOString(),
  };

  const doc = await databases.createDocument(
    appwriteConfig.databaseId,
    collectionId,
    ID.unique(),
    payload
  );

  return {
    ...doc,
    postType: 'text',
    caption: doc.body || text,
    prompt: doc.body || text,
    creator: {
      $id: user.$id,
      username: payload.creatorUsername,
      avatar: payload.creatorAvatar,
    },
  };
}

/**
 * Photo post scoped to a Circle (always writes circleId).
 */
export async function createCirclePhotoPost({ user, circleId, photo, title = '', caption = '' } = {}) {
  if (!user?.$id) throw new Error('Sign in to post');
  const cid = String(circleId || '').trim();
  if (!cid) throw new Error('Circle is required');
  if (!photo?.uri) throw new Error('Choose a photo');

  return createPhotoPost({
    userId: user.$id,
    photo,
    title: String(title || '').trim(),
    caption: String(caption || '').trim(),
    circleId: cid,
  });
}

/**
 * Video post scoped to a Circle (always writes circleId).
 */
export async function createCircleVideoPost({
  user,
  circleId,
  video,
  title = '',
  prompt = '',
  thumbnail = null,
} = {}) {
  if (!user?.$id) throw new Error('Sign in to post');
  const cid = String(circleId || '').trim();
  if (!cid) throw new Error('Circle is required');
  if (!video?.uri) throw new Error('Choose a video');

  const form = {
    userId: user.$id,
    title: String(title || '').trim() || 'Circle video',
    prompt: String(prompt || '').trim() || ' ',
    video,
    thumbnail,
    circleId: cid,
  };

  if (isMuxUploadEnabled()) {
    return publishVideoWithMux(form, video);
  }
  return createVideoPost(form);
}

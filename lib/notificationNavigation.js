import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HANDLED_PUSH_RESPONSE_KEY = '@asab_handled_push_response_id';

/** Normalize expo-router param (string | string[] | undefined). */
export function normalizeRouteParam(value) {
  if (value == null) return '';
  const raw = Array.isArray(value) ? value[0] : value;
  const str = String(raw).trim();
  if (!str || str === 'undefined' || str === 'null') return '';
  return str;
}

function scheduleNavigation(run) {
  InteractionManager.runAfterInteractions(() => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          run();
        } catch (firstError) {
          if (__DEV__) {
            console.warn('[notificationNavigation] navigation failed, retrying:', firstError);
          }
          setTimeout(() => {
            try {
              run();
            } catch (_) {
              /* give up */
            }
          }, 600);
        }
      }, 300);
    });
  });
}

export function safeRouterNavigate(router, navigate) {
  if (!router || typeof navigate !== 'function') return;
  scheduleNavigation(() => navigate(router));
}

/**
 * Open the home feed focused on a specific video/photo (TikTok-style player),
 * not the Post Details screen.
 */
export function navigateToHomePost(router, postId) {
  const id = normalizeRouteParam(postId);
  if (!router || !id) return;
  safeRouterNavigate(router, (r) => {
    r.replace({ pathname: '/(tabs)/home', params: { postId: id } });
  });
}

/**
 * Avoid re-handling the same push tap on every app launch.
 * getLastNotificationResponseAsync() persists the last response across restarts.
 */
export async function shouldHandlePushResponse(response) {
  const responseId = response?.notification?.request?.identifier;
  if (!responseId) return true;

  try {
    const handled = await AsyncStorage.getItem(HANDLED_PUSH_RESPONSE_KEY);
    if (handled === responseId) return false;
    await AsyncStorage.setItem(HANDLED_PUSH_RESPONSE_KEY, responseId);
    return true;
  } catch (_) {
    return true;
  }
}

export function navigateFromPushData(router, rawData) {
  if (!router || !rawData) return false;

  const type = normalizeRouteParam(rawData.type);
  const streamId = normalizeRouteParam(rawData.streamId);
  const fromUserId = normalizeRouteParam(rawData.fromUserId || rawData.userId);
  const postId = normalizeRouteParam(rawData.postId);

  if (type === 'message' && fromUserId) {
    safeRouterNavigate(router, (r) => {
      r.push({ pathname: '/chat', params: { userId: fromUserId } });
    });
    return true;
  }

  if ((type === 'like' || type === 'comment') && postId) {
    navigateToHomePost(router, postId);
    return true;
  }

  if ((type === 'follow' || type === 'profile_like') && fromUserId) {
    safeRouterNavigate(router, (r) => {
      r.push(`/profile/${fromUserId}`);
    });
    return true;
  }

  if ((type === 'location_share' || type === 'location_nearby') ) {
    safeRouterNavigate(router, (r) => {
      r.push('/live-map');
    });
    return true;
  }

  if (type === 'live' && (streamId || postId)) {
    const id = streamId || postId;
    safeRouterNavigate(router, (r) => {
      r.push({ pathname: '/live-viewer', params: { streamId: id } });
    });
    return true;
  }

  if ((type === 'video_post' || type === 'photo_post' || type === 'content_post' || type === 'post') && postId) {
    navigateToHomePost(router, postId);
    return true;
  }

  if (rawData.url && typeof rawData.url === 'string') {
    const url = rawData.url;

    const messageMatch = url.match(/chat\?userId=([^&]+)/i);
    if (messageMatch?.[1]) {
      const userId = normalizeRouteParam(decodeURIComponent(messageMatch[1]));
      if (userId) {
        safeRouterNavigate(router, (r) => {
          r.push({ pathname: '/chat', params: { userId } });
        });
        return true;
      }
    }

    const liveMatch = url.match(/live-viewer\?streamId=([^&]+)/i);
    if (liveMatch?.[1]) {
      const id = normalizeRouteParam(decodeURIComponent(liveMatch[1]));
      if (id) {
        safeRouterNavigate(router, (r) => {
          r.push({ pathname: '/live-viewer', params: { streamId: id } });
        });
        return true;
      }
    }

    const homePostMatch = url.match(/[?&]postId=([^&]+)/i);
    if (homePostMatch?.[1] && /home/i.test(url)) {
      const id = normalizeRouteParam(decodeURIComponent(homePostMatch[1]));
      if (id) {
        navigateToHomePost(router, id);
        return true;
      }
    }

    // Legacy deep links used /post/:id — still open home feed for that post.
    const postMatch = url.match(/\/post\/([^?&#]+)/i);
    if (postMatch?.[1]) {
      const id = normalizeRouteParam(decodeURIComponent(postMatch[1]));
      if (id) {
        navigateToHomePost(router, id);
        return true;
      }
    }
  }

  safeRouterNavigate(router, (r) => {
    r.push('/inbox');
  });
  return false;
}

export function navigateFromInboxNotification(router, notification) {
  if (!router || !notification) return;

  const type = notification.type;
  const fromUserId = normalizeRouteParam(notification.fromUserId);
  const postId = normalizeRouteParam(notification.postId);

  if (type === 'follow' || type === 'profile_like') {
    if (!fromUserId) return;
    safeRouterNavigate(router, (r) => {
      r.push(`/profile/${fromUserId}`);
    });
    return;
  }

  if (
    type === 'like' ||
    type === 'comment' ||
    type === 'video_post' ||
    type === 'photo_post' ||
    type === 'content_post' ||
    type === 'post'
  ) {
    if (!postId) return;
    navigateToHomePost(router, postId);
    return;
  }

  if (type === 'message') {
    if (!fromUserId) return;
    safeRouterNavigate(router, (r) => {
      r.push({ pathname: '/chat', params: { userId: fromUserId } });
    });
    return;
  }

  if (type === 'live' && postId) {
    safeRouterNavigate(router, (r) => {
      r.push({ pathname: '/live-viewer', params: { streamId: postId } });
    });
    return;
  }

  if (type === 'call' && postId) {
    safeRouterNavigate(router, (r) => {
      r.push({ pathname: '/call', params: { callId: postId } });
    });
  }
}

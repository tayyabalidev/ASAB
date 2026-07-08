import { router } from 'expo-router';

/** Go back when possible; otherwise land on a safe screen (e.g. after push notification cold start). */
export function safeRouterBack(fallback = '/home') {
  try {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(fallback);
  } catch (_) {
    try {
      router.replace(fallback);
    } catch (_) {
      /* navigation unavailable */
    }
  }
}

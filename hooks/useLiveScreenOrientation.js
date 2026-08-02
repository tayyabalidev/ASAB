import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';

/**
 * Allow portrait + landscape while this screen is focused.
 * Restores portrait-up when leaving (rest of the app stays portrait).
 */
export function useLiveScreenOrientation() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
      } catch (_) {
        if (!cancelled) {
          try {
            await ScreenOrientation.unlockAsync();
          } catch (_) {
            /* Expo Go / unsupported */
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {
        if (Platform.OS === 'web') return;
      });
    };
  }, []);
}

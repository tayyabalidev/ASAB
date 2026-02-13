import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { badgeService } from '../lib/badgeService';
import { useGlobalContext } from '../context/GlobalProvider';

/**
 * Hook to manage app icon badge notifications
 * Automatically updates badge count when notifications change
 */
export const useBadgeNotifications = () => {
  const { user, isLogged } = useGlobalContext();
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Initialize badge service
    badgeService.initialize();

    // Cleanup on unmount
    return () => {
      badgeService.cleanup();
    };
  }, []);

  useEffect(() => {
    if (!isLogged || !user?.$id) {
      badgeService.cleanup();
      return;
    }

    // Start periodic updates when user is logged in
    badgeService.startPeriodicUpdates(user.$id);

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App came to foreground - update badge immediately
        badgeService.updateBadge(user.$id);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription?.remove();
      badgeService.stopPeriodicUpdates();
    };
  }, [isLogged, user?.$id]);

  return {
    updateBadge: () => user?.$id && badgeService.updateBadge(user.$id),
    clearBadge: () => badgeService.clearBadge(),
  };
};

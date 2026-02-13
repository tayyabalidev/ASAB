import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getUnreadNotificationCount } from './appwrite';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false, // We only want badge, not alerts
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

class BadgeService {
  constructor() {
    this.isInitialized = false;
    this.updateInterval = null;
  }

  /**
   * Initialize the badge service
   * Requests permissions and sets up periodic updates
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Request notification permissions (required for badge on iOS)
      if (Platform.OS === 'ios') {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (finalStatus !== 'granted') {
          console.warn('Notification permissions not granted. Badge may not work.');
          return;
        }
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing badge service:', error);
    }
  }

  /**
   * Update the app icon badge with the current unread count
   * @param {string} userId - The current user's ID
   */
  async updateBadge(userId) {
    if (!userId || !this.isInitialized) return;

    try {
      const count = await getUnreadNotificationCount(userId);
      await this.setBadgeCount(count);
    } catch (error) {
      console.error('Error updating badge:', error);
    }
  }

  /**
   * Set the badge count on the app icon
   * @param {number} count - The badge count to set
   */
  async setBadgeCount(count) {
    try {
      // Cap at 99+ for display purposes
      const badgeCount = count > 99 ? 99 : count;
      await Notifications.setBadgeCountAsync(badgeCount);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  /**
   * Clear the badge (set to 0)
   */
  async clearBadge() {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('Error clearing badge:', error);
    }
  }

  /**
   * Start periodic badge updates
   * Updates every 30 seconds when user is logged in
   * @param {string} userId - The current user's ID
   */
  startPeriodicUpdates(userId) {
    // Clear any existing interval
    this.stopPeriodicUpdates();

    if (!userId) return;

    // Update immediately
    this.updateBadge(userId);

    // Then update every 30 seconds
    this.updateInterval = setInterval(() => {
      this.updateBadge(userId);
    }, 30000); // 30 seconds
  }

  /**
   * Stop periodic badge updates
   */
  stopPeriodicUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /**
   * Cleanup - call this when user logs out or app closes
   */
  cleanup() {
    this.stopPeriodicUpdates();
    this.clearBadge();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const badgeService = new BadgeService();

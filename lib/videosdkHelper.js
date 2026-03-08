/**
 * VideoSDK Helper Functions
 * 
 * Handles VideoSDK meeting creation, token generation, and utilities
 */

import { VIDEOSDK_CONFIG } from './config';

/**
 * Generate VideoSDK meeting token
 * For production, use your backend server to generate tokens
 */
export async function getVideoSDKToken(meetingId) {
  try {
    // If token server URL is configured, fetch from server
    if (VIDEOSDK_CONFIG.tokenServerUrl) {
      const baseUrl = VIDEOSDK_CONFIG.tokenServerUrl.replace(/\/$/, '');
      const url = `${baseUrl}/get-token?meetingId=${encodeURIComponent(meetingId)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Token server error (${response.status})`);
      }
      
      const data = await response.json();
      if (!data.token) {
        throw new Error('Token server did not return a token');
      }
      
      return data.token;
    }

    // For development, you can use VideoSDK's API key directly
    // VideoSDK can work with API key in dev mode (no token required)
    // Note: In production, always use your backend server to generate tokens
    console.log('Using VideoSDK API key directly (dev mode). Token optional.');
    return null; // VideoSDK can work with API key in dev mode
  } catch (error) {
    console.error('Error fetching VideoSDK token:', error);
    throw error;
  }
}

/**
 * Create a VideoSDK meeting
 * This should ideally be done on your backend server
 */
export async function createVideoSDKMeeting() {
  try {
    // In production, call your backend API to create meeting
    if (VIDEOSDK_CONFIG.tokenServerUrl) {
      const baseUrl = VIDEOSDK_CONFIG.tokenServerUrl.replace(/\/$/, '');
      const url = `${baseUrl}/create-meeting`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          region: 'sg001', // Singapore region (change as needed)
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create meeting (${response.status})`);
      }
      
      const data = await response.json();
      return data.meetingId;
    }

    // For development, generate a simple meeting ID
    // In production, always use backend API
    const meetingId = `meeting_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    console.warn('Using generated meeting ID (dev mode). Use backend API in production.');
    return meetingId;
  } catch (error) {
    console.error('Error creating VideoSDK meeting:', error);
    throw error;
  }
}

/**
 * Validate VideoSDK configuration
 */
export function validateVideoSDKConfig() {
  const errors = [];
  
  if (!VIDEOSDK_CONFIG.apiKey || VIDEOSDK_CONFIG.apiKey === 'YOUR_VIDEOSDK_API_KEY') {
    errors.push('VideoSDK API key is not configured. Get it from https://app.videosdk.live/');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

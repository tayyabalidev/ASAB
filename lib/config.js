// ZEGO Cloud Configuration
export const ZEGO_CONFIG = {
  appID: 158223577,
  appSign: '9b0834517039c7a6869ef9acd88503a9e9d1430ea0ce469b2f5a5a0a3fc65fc3',
  serverSecret: '7c7a2a87c199d55966ccd7d9e6c516c0'
};

// VideoSDK Configuration
export const VIDEOSDK_CONFIG = {
  // Get your API key from https://app.videosdk.live/
  apiKey: 'd2a44593-6338-45da-b255-f30bb5900d2a', // Replace with your VideoSDK API key
  secretKey: 'e1e4e748d29463ae192ea8284773ace36e6f1f4f3df6f09c11a95b42ebd693ef',
  // Token server URL (optional - for production)
  // You can generate tokens from: https://app.videosdk.live/
  tokenServerUrl: null, // Set to your token server URL if using token authentication
  
  // Meeting settings
  meetingSettings: {
    micEnabled: true,
    webcamEnabled: true,
    participantCanToggleSelfWebcam: true,
    participantCanToggleSelfMic: true,
  },
};

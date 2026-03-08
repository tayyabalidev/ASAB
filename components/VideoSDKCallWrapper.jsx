/**
 * VideoSDK Call Wrapper Component
 * 
 * Safely loads VideoSDKCall component
 * Falls back to placeholder if VideoSDK is not available
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const VideoSDKCallWrapper = (props) => {
  const [VideoSDKCall, setVideoSDKCall] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let isMounted = true;
    
    const loadVideoSDKCall = async () => {
      try {
        // Check if @videosdk.live/react-native-sdk is available
        const videosdkPackage = require('@videosdk.live/react-native-sdk');
        
        // Try to actually use the native module to verify it's linked
        if (videosdkPackage && videosdkPackage.MeetingProvider) {
          // Native module is available, load the component
          const callComponent = require('./VideoSDKCall').default;
          if (isMounted && callComponent) {
            setVideoSDKCall(() => callComponent);
            return;
          }
        }
        
        // If we get here, package exists but native module not linked
        if (isMounted) {
          setError('VideoSDK native module not linked. Please rebuild the app.');
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err.message || 'VideoSDK SDK not available';
          console.error('VideoSDKCallWrapper error:', errorMessage);
          
          // Check for specific error types
          if (errorMessage.includes('Native module') || 
              errorMessage.includes('doesn\'t seem to be linked') ||
              errorMessage.includes('null is not an object') ||
              errorMessage.includes('Cannot find module')) {
            setError('VideoSDK native module not linked. Please rebuild with: npx expo run:android');
          } else {
            setError(errorMessage);
          }
        }
      }
    };

    // Use setTimeout to ensure this runs after initial render
    const timer = setTimeout(loadVideoSDKCall, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Show fallback UI if VideoSDK is not available
  if (error || !VideoSDKCall) {
    const isLinkingError = error?.includes("doesn't seem to be linked") || 
                          error?.includes("pod install") ||
                          error?.includes("Expo Go") ||
                          error?.includes("Native module") ||
                          error?.includes("Cannot find module");
    
    return (
      <View style={styles.container}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackTitle}>
            {props.callType === 'video' ? '📹 Video Call' : '📞 Audio Call'}
          </Text>
          <Text style={styles.fallbackSubtext}>
            Call in progress...
          </Text>
          
          {isLinkingError ? (
            <>
              <Text style={styles.fallbackWarning}>
                ⚠️ VideoSDK Not Available
              </Text>
              <Text style={styles.fallbackInstruction}>
                This feature requires a development build.{'\n\n'}
                To enable calls:{'\n\n'}
                <Text style={styles.codeText}>
                  For Android:{'\n'}
                  npx expo run:android{'\n\n'}
                  For iOS:{'\n'}
                  npx expo run:ios
                </Text>
              </Text>
              <Text style={styles.fallbackNote}>
                Note: Cannot use Expo Go. Use development build or EAS Build.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.fallbackWarning}>
                ⚠️ VideoSDK not available
              </Text>
              <Text style={styles.fallbackInstruction}>
                Install @videosdk.live/react-native-sdk to enable calls
              </Text>
            </>
          )}
          
          {props.onCallEnd && (
            <TouchableOpacity
              style={styles.endButton}
              onPress={props.onCallEnd}
            >
              <Text style={styles.endButtonText}>End Call</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // Render the real VideoSDKCall component
  return <VideoSDKCall {...props} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#000000',
  },
  fallbackTitle: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  fallbackSubtext: {
    fontSize: 18,
    color: '#999999',
    marginBottom: 40,
    textAlign: 'center',
  },
  fallbackWarning: {
    fontSize: 16,
    color: '#FF9800',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  fallbackInstruction: {
    fontSize: 14,
    color: '#cccccc',
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 22,
  },
  codeText: {
    fontFamily: 'monospace',
    backgroundColor: '#1a1a1a',
    padding: 10,
    borderRadius: 5,
    color: '#4CAF50',
  },
  fallbackNote: {
    fontSize: 12,
    color: '#666666',
    marginTop: 20,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  endButton: {
    backgroundColor: '#F44336',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 25,
    marginTop: 40,
  },
  endButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default VideoSDKCallWrapper;

/**
 * VideoSDK Call Wrapper Component
 *
 * Safely loads VideoSDKCall component.
 * Falls back to placeholder if VideoSDK is not available or if the native module crashes.
 * Includes Error Boundary so the app does not crash when the SDK fails at runtime.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

/**
 * Error Boundary to catch crashes when VideoSDK native module is not linked
 * or fails during render (e.g. MeetingProvider / useMeeting touching native code).
 * Prevents the app from closing and lets the wrapper show the fallback UI.
 */
class VideoSDKErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('VideoSDK ErrorBoundary caught:', error, errorInfo);
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

const VideoSDKCallWrapper = (props) => {
  const [VideoSDKCall, setVideoSDKCall] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [sdkRenderError, setSdkRenderError] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    const loadVideoSDKCall = async () => {
      try {
        const videosdkPackage = require('@videosdk.live/react-native-sdk');

        if (videosdkPackage && videosdkPackage.MeetingProvider) {
          const callComponent = require('./VideoSDKCall').default;
          if (isMounted && callComponent) {
            setVideoSDKCall(() => callComponent);
            return;
          }
        }

        if (isMounted) {
          setError('VideoSDK native module not linked. Please rebuild the app.');
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err.message || 'VideoSDK SDK not available';
          console.error('VideoSDKCallWrapper error:', errorMessage);

          if (
            errorMessage.includes('Native module') ||
            errorMessage.includes("doesn't seem to be linked") ||
            errorMessage.includes('null is not an object') ||
            errorMessage.includes('Cannot find module')
          ) {
            setError(
              'VideoSDK native module not linked. Please rebuild with: npx expo run:android (or npx expo run:ios)'
            );
          } else {
            setError(errorMessage);
          }
        }
      }
    };

    const timer = setTimeout(loadVideoSDKCall, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleEndCallPress = React.useCallback(() => {
    try {
      props.onCallEnd?.();
    } catch (e) {
      console.error('Error in End Call handler:', e);
      try {
        props.onCallEnd?.();
      } catch (_) {}
    }
  }, [props.onCallEnd]);

  const showFallback = error || !VideoSDKCall || sdkRenderError;
  const isLoading = !VideoSDKCall && !error && !sdkRenderError;

  if (showFallback) {
    const isLinkingError =
      error?.includes("doesn't seem to be linked") ||
      error?.includes('pod install') ||
      error?.includes('Expo Go') ||
      error?.includes('Native module') ||
      error?.includes('Cannot find module') ||
      sdkRenderError;

    return (
      <View style={styles.container}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackTitle}>
            {props.callType === 'video' ? '📹 Video Call' : '📞 Audio Call'}
          </Text>
          <Text style={styles.fallbackSubtext}>
            {isLoading ? 'Loading...' : 'Call in progress...'}
          </Text>

          {!isLoading && (isLinkingError ? (
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
                Install @videosdk.live/react-native-sdk and rebuild the app to enable calls.
              </Text>
            </>
          ))}

          <TouchableOpacity
            style={styles.endButton}
            onPress={handleEndCallPress}
            activeOpacity={0.8}
          >
            <Text style={styles.endButtonText}>End Call</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <VideoSDKErrorBoundary onError={() => setSdkRenderError(true)}>
      <VideoSDKCall {...props} />
    </VideoSDKErrorBoundary>
  );
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

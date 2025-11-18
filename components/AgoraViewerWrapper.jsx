import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Wrapper component that safely loads AgoraViewer
 * Falls back to placeholder if react-native-agora is not installed
 */
const AgoraViewerWrapper = ({ stream, userId, onClose }) => {
  const [AgoraViewer, setAgoraViewer] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    // Try to check if react-native-agora is available first
    let isMounted = true;
    
    const loadAgoraViewer = () => {
      try {
        // First check if the package exists
        const agoraPackage = require('react-native-agora');
        if (!agoraPackage) {
          throw new Error('react-native-agora package not found');
        }
        
        // If package exists, try to load the component
        // This will fail if AgoraViewer imports fail, but we catch it
        const viewerModule = require('./AgoraViewer');
        if (viewerModule && viewerModule.default) {
          if (isMounted) {
            setAgoraViewer(() => viewerModule.default);
          }
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage = err.message || 'Agora SDK not available';
          setError(errorMessage);
          
          // Check for specific linking errors
          if (errorMessage.includes("doesn't seem to be linked") || 
              errorMessage.includes("pod install") ||
              errorMessage.includes("Expo Go")) {
            console.warn('Agora SDK installed but not linked. Native modules need to be linked.');
          } else {
            console.warn('Agora SDK not available, using fallback UI:', errorMessage);
          }
        }
      }
    };

    // Use setTimeout to ensure this runs after initial render
    const timer = setTimeout(loadAgoraViewer, 0);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // Show fallback UI if Agora is not available
  if (error || !AgoraViewer) {
    const isLinkingError = error?.includes("doesn't seem to be linked") || 
                          error?.includes("pod install") ||
                          error?.includes("Expo Go");
    
    return (
      <View style={styles.container}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackText}>Live Stream</Text>
          <Text style={styles.fallbackSubtext}>
            {stream?.hostUsername || 'Broadcaster'} is live
          </Text>
          {isLinkingError ? (
            <>
              <Text style={styles.fallbackWarning}>
                ⚠️ Agora SDK not linked{'\n'}
                Native modules need to be linked
              </Text>
              <Text style={styles.fallbackInstruction}>
                For iOS:{'\n'}
                cd ios && pod install{'\n\n'}
                Then rebuild the app:{'\n'}
                npx expo run:ios
              </Text>
              <Text style={styles.fallbackInstruction}>
                For Android:{'\n'}
                Rebuild the app:{'\n'}
                npx expo run:android
              </Text>
              <Text style={styles.fallbackNote}>
                Note: Cannot use Expo Go. Use development build.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.fallbackWarning}>
                ⚠️ Agora SDK not available{'\n'}
                Install react-native-agora to enable live video
              </Text>
              <Text style={styles.fallbackInstruction}>
                Run: npm install react-native-agora
              </Text>
            </>
          )}
        </View>
      </View>
    );
  }

  // Render the real AgoraViewer component
  return <AgoraViewer stream={stream} userId={userId} onClose={onClose} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    padding: 20,
  },
  fallbackText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  fallbackSubtext: {
    color: '#a77df8',
    fontSize: 18,
    marginBottom: 20,
  },
  fallbackWarning: {
    color: '#ffa500',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  fallbackInstruction: {
    color: '#aaa',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    fontFamily: 'monospace',
    lineHeight: 16,
  },
  fallbackNote: {
    color: '#ffa500',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 15,
    fontStyle: 'italic',
    paddingHorizontal: 20,
  },
});

export default AgoraViewerWrapper;


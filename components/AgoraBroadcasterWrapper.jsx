import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Wrapper component that safely loads AgoraBroadcaster
 * Falls back to placeholder if react-native-agora is not installed
 */
const AgoraBroadcasterWrapper = ({ streamId, onStreamEnd }) => {
  const [AgoraBroadcaster, setAgoraBroadcaster] = React.useState(null);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    // Try to dynamically import AgoraBroadcaster
    let isMounted = true;
    
    const loadAgoraBroadcaster = async () => {
      try {
        // Check if react-native-agora is available
        require('react-native-agora');
        // If we get here, the package exists, so import the component
        const broadcaster = require('./AgoraBroadcaster').default;
        if (isMounted) {
          setAgoraBroadcaster(() => broadcaster);
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
            console.warn('Agora SDK not available:', errorMessage);
          }
        }
      }
    };

    loadAgoraBroadcaster();

    return () => {
      isMounted = false;
    };
  }, []);

  // Show fallback UI if Agora is not available
  if (error || !AgoraBroadcaster) {
    const isLinkingError = error?.includes("doesn't seem to be linked") || 
                          error?.includes("pod install") ||
                          error?.includes("Expo Go");
    
    return (
      <View style={styles.container}>
        <View style={styles.fallbackContainer}>
          <Text style={styles.fallbackText}>Go Live</Text>
          {isLinkingError ? (
            <>
              <Text style={styles.fallbackWarning}>
                ⚠️ Agora SDK not linked{'\n'}
                Native modules need to be linked
              </Text>
              <Text style={styles.fallbackInstruction}>
                For iOS:{'\n'}
                cd ios && pod install{'\n\n'}
                Then rebuild:{'\n'}
                npx expo run:ios
              </Text>
              <Text style={styles.fallbackInstruction}>
                For Android:{'\n'}
                Rebuild:{'\n'}
                npx expo run:android
              </Text>
              <Text style={styles.fallbackNote}>
                Note: Cannot use Expo Go. Use development build.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.fallbackWarning}>
                ⚠️ Agora SDK not installed{'\n'}
                Install react-native-agora to enable live streaming
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

  // Render the real AgoraBroadcaster component
  return <AgoraBroadcaster streamId={streamId} onStreamEnd={onStreamEnd} />;
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

export default AgoraBroadcasterWrapper;


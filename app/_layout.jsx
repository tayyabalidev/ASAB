import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import GlobalProvider, { useGlobalContext } from '../context/GlobalProvider';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking'; // ✅ fix: use from expo-linking
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { getCurrentUser, account, databases, ID, Query, getOrCreateFacebookUser, getOrCreateGoogleUser, appwriteConfig } from '../lib/appwrite';
import { useBadgeNotifications } from '../hooks/useBadgeNotifications';
import IncomingCallHandler from '../components/IncomingCallHandler';
import { canLoadVideoSdkNative } from '../lib/videosdkNativeGate';

// VideoSDK native bootstrap (mirror official ILS example) — skip in Expo Go.
if (canLoadVideoSdkNative()) {
  try {
    const { register } = require('@videosdk.live/react-native-sdk');
    register();
  } catch (registerErr) {
    if (__DEV__) {
      console.warn('[VideoSDK] register failed', registerErr);
    }
  }
}

SplashScreen.preventAutoHideAsync();

// ✅ Badge Notification Handler Component
function BadgeNotificationHandler() {
  useBadgeNotifications();
  return null;
}

// ✅ OAuth Handler Component
function OAuthHandler() {
  const router = useRouter();
  const { setUser, setIsLogged, isLogged, loading } = useGlobalContext();
  const oauthProcessingRef = useRef(false);

  useEffect(() => { 
    const handleDeepLink = async (url) => {
      if (!url) return;
      // Normalize URL for checking
      const normalizedUrl = url.toLowerCase();
      
      // Check if this is our app's deep link
      if (!normalizedUrl.includes('com.bilal.asab://') && !normalizedUrl.includes('asab://')) {
        return;
      }

      // Prevent multiple simultaneous OAuth processing
      if (oauthProcessingRef.current) {
        return;
      }

      // Handle Facebook OAuth success
      if (normalizedUrl.includes('facebook-success') || (normalizedUrl.includes('facebook') && normalizedUrl.includes('success'))) {
        oauthProcessingRef.current = true;
        
        try {
          // Wait for session to be established (with retries)
          let retries = 0;
          let accountReady = false;
          
          while (retries < 5 && !accountReady) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              const testAccount = await account.get();
              if (testAccount && testAccount.$id) {
                accountReady = true;
              }
            } catch (e) {
              retries++;
            }
          }
          
          if (!accountReady) {
            throw new Error('OAuth session not established. Please try again.');
          }
          
          // getOrCreateFacebookUser() has built-in retry logic
          const user = await getOrCreateFacebookUser();
          if (user) {
            setUser(user);
            setIsLogged(true);
            router.replace('/(tabs)/home');
          } else {
            throw new Error('Failed to create user account. Please try again.');
          }
        } catch (error) {
          Alert.alert(
            "Sign In Error", 
            error.message || "Failed to sign in with Facebook. Please try again.",
            [{ text: "OK", onPress: () => router.replace('/(auth)/sign-in') }]
          );
        } finally {
          oauthProcessingRef.current = false;
        }
        return;
      }
      
      // Handle Facebook OAuth failure
      if (normalizedUrl.includes('facebook-failure')) {
        Alert.alert(
          "Sign In Cancelled", 
          "Facebook login was cancelled or failed. Please try again.",
          [{ text: "OK", onPress: () => router.replace('/(auth)/sign-in') }]
        );
        return;
      }
      
      // Handle Google OAuth success
      if (normalizedUrl.includes('google-success') || (normalizedUrl.includes('google') && normalizedUrl.includes('success'))) {
        oauthProcessingRef.current = true;
        
        try {
          // Wait for session to be established (with retries)
          // "Missing scopes" errors mean session is being established - keep retrying
          let retries = 0;
          let accountReady = false;
          const maxRetries = 30; // Increased retries - session establishment can take time
          
          while (retries < maxRetries && !accountReady) {
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait 1.5 seconds between retries
            try {
              const testAccount = await account.get();
              // If we get here without error, the session is authenticated
              if (testAccount && testAccount.$id) {
                accountReady = true;
              } else {
                retries++;
              }
            } catch (e) {
              const errorMsg = e.message || '';
              // "Missing scopes" is normal during session establishment - continue retrying
              if (errorMsg.includes('missing scopes') || errorMsg.includes('scope')) {
                retries++;
                // Don't throw error, continue retrying
              } else {
                retries++;
              }
            }
          }
          
          if (!accountReady) {
            throw new Error('OAuth session not established after waiting. Please verify the callback URI is configured in Google Cloud Console and try again.');
          }
          
          // getOrCreateGoogleUser() has built-in retry logic
          const user = await getOrCreateGoogleUser();
          if (user) {
            setUser(user);
            setIsLogged(true);
            router.replace('/(tabs)/home');
          } else {
            throw new Error('Failed to create user account. Please try again.');
          }
        } catch (error) {
          Alert.alert(
            "Sign In Error", 
            error.message || "Failed to sign in with Google. Please verify the callback URI is configured in Google Cloud Console.",
            [{ text: "OK", onPress: () => router.replace('/(auth)/sign-in') }]
          );
        } finally {
          oauthProcessingRef.current = false;
        }
        return;
      }
      
      // Handle Google OAuth failure
      if (normalizedUrl.includes('google-failure')) {
        Alert.alert(
          "Sign In Cancelled", 
          "Google login was cancelled or failed. Please try again.",
          [{ text: "OK", onPress: () => router.replace('/(auth)/sign-in') }]
        );
        return;
      }
      
      // Handle other OAuth redirects (fallback)
      if (normalizedUrl.includes('com.bilal.asab://') && !oauthProcessingRef.current) {
        oauthProcessingRef.current = true;
        
        try {
          // Wait for session to be established
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Get the current account from Appwrite
          const currentAccount = await account.get();
          
          if (!currentAccount || !currentAccount.$id) {
            throw new Error('No account found');
          }
          
          // Check if user exists in our database
          let existingUser;
          try {
            const users = await databases.listDocuments(
              appwriteConfig.databaseId,
              appwriteConfig.userCollectionId,
              [Query.equal("accountId", currentAccount.$id)]
            );
            
            if (users.documents.length > 0) {
              existingUser = users.documents[0];
            }
          } catch (error) {
          }

          if (existingUser) {
            // User exists, set the user data
            setUser(existingUser);
            setIsLogged(true);
            router.replace('/(tabs)/home');
          } else {
            // Create new user in our database
            const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentAccount.name || 'User')}&background=random`;
            
            const newUser = await databases.createDocument(
              appwriteConfig.databaseId,
              appwriteConfig.userCollectionId,
              ID.unique(),
              {
                accountId: currentAccount.$id,
                email: currentAccount.email || '',
                username: currentAccount.name || 'User',
                avatar: avatarUrl,
              }
            );
            
            setUser(newUser);
            setIsLogged(true);
            router.replace('/(tabs)/home');
          }
        } catch (error) {
          router.replace('/(auth)/sign-in');
        } finally {
          oauthProcessingRef.current = false;
        }
      }
    };

    // ✅ Handle when app is opened from deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink(url);
      } else {
      }
    });

    // ✅ Listen while app is open
    const linkingSubscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    // ✅ Listen for app state changes (when app comes back from browser)
    // This handles cases where deep link doesn't fire but OAuth completed
    const appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      // Only probe for OAuth when user is not logged in (avoids router.replace('/home') during calls, live, etc.)
      if (nextAppState === 'active' && !oauthProcessingRef.current && !loading && !isLogged) {
        
        // Wait a bit for OAuth session to be established, then retry multiple times
        let retryCount = 0;
        const maxRetries = 20; // Check for 20 seconds (20 * 1.5s = 30s total)
        
        const checkSession = async () => {
          try {
            // Check if we have a valid session (means OAuth might have completed)
            const currentAccount = await account.get().catch((e) => {
              // If it's a "missing scopes" error, session is still establishing
              if (e.message && e.message.includes('missing scopes')) {
                return null; // Continue retrying
              }
              return null;
            });
            
            if (currentAccount && currentAccount.$id) {
              oauthProcessingRef.current = true;
              
              try {
                // Try to get or create user (works for both Facebook and Google)
                const user = await getOrCreateFacebookUser().catch(() => getOrCreateGoogleUser());
                if (user) {
                  setUser(user);
                  setIsLogged(true);
                  router.replace('/(tabs)/home');
                  oauthProcessingRef.current = false;
                  return; // Success, stop retrying
                }
              } catch (error) {
                oauthProcessingRef.current = false;
              }
            } else {
              // No valid session yet, continue retrying if we haven't exceeded max
              retryCount++;
              if (retryCount < maxRetries) {
                setTimeout(checkSession, 1500); // Retry after 1.5 seconds
              } else {
              }
            }
          } catch (error) {
            retryCount++;
            if (retryCount < maxRetries) {
              setTimeout(checkSession, 1500);
            }
          }
        };
        
        // Start checking after initial delay
        setTimeout(checkSession, 2000);
      }
    });

    return () => {
      linkingSubscription.remove();
      appStateSubscription.remove();
    };
  }, [router, setUser, setIsLogged, isLogged, loading]);

  return null;
}

// Prevent app crashes from unhandled promise rejections and global errors
function useGlobalErrorHandling() {
  useEffect(() => {
    const globalErrorHandler = (error, isFatal) => {
    };
    const rejectionHandler = (reason, promise) => {
    };

    const prev = global.ErrorUtils?.getGlobalHandler?.();
    if (global.ErrorUtils?.setGlobalHandler) {
      global.ErrorUtils.setGlobalHandler((error, isFatal) => {
        globalErrorHandler(error, isFatal);
        try {
          if (prev) prev(error, isFatal);
        } catch (e) {
          console.error(e);   
        }
      });
    };
  }, []);
}

export default function RootLayout() {
  useGlobalErrorHandling();

  // Try to load fonts, but don't fail if they don't load
  const [loaded, error] = useFonts({
    'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
    'Poppins-Medium': require('../assets/fonts/Poppins-Medium.ttf'),
    'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
    'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
  });

  useEffect(() => {
    if (error) {
     
      // Don't throw error, just log it and continue
    }
  }, [error]);

  // Native splash stays visible until Splash1 mounts or logged-in home redirect.

  // Get Stripe publishable key from environment
  // Expo automatically makes EXPO_PUBLIC_* variables available at build time
  // Try multiple sources for the key
  const stripePublishableKey = 
    process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 
    Constants.expoConfig?.extra?.stripePublishableKey ||
    Constants.expoConfig?.extra?.env?.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    // Fallback: Try to read from .env file directly (for development)
    (typeof process !== 'undefined' && process.env && process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) ||
    null;

  return (
    <StripeProvider publishableKey={stripePublishableKey || 'pk_test_placeholder_key_that_will_fail_but_allow_app_to_load'}>
      <GlobalProvider>
        <OAuthHandler />
        <BadgeNotificationHandler />
        <IncomingCallHandler />
        <Stack
          screenOptions={{
            headerShown: false, // Hide all headers by default
            headerTitle: '', // Empty title
            title: '', // Empty title
            contentStyle: { backgroundColor: 'transparent' },
          }}
        >
          <Stack.Screen 
            name="index" 
            options={{ 
              headerShown: false,
              title: '',
              headerTitle: '',
            }} 
          />
          <Stack.Screen 
            name="(auth)" 
            options={{ 
              headerShown: false,
              title: '',
              headerTitle: '',
            }} 
          />
          <Stack.Screen 
            name="(tabs)" 
            options={{ 
              headerShown: false,
              title: '',
              headerTitle: '',
              presentation: 'card',
            }} 
          />
          <Stack.Screen 
            name="post/[id]" 
            options={{ 
              headerShown: false,
              title: '',
              headerTitle: '',
            }} 
          />
        </Stack>
      </GlobalProvider>
    </StripeProvider>
  );
}


import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { Stack, SplashScreen } from 'expo-router';
import GlobalProvider, { useGlobalContext } from '../context/GlobalProvider';
import { useFonts } from 'expo-font';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking'; // ✅ fix: use from expo-linking
import { getCurrentUser, account, databases, ID, Query, getOrCreateFacebookUser, getOrCreateGoogleUser } from '../lib/appwrite';

SplashScreen.preventAutoHideAsync();

// ✅ OAuth Handler Component
function OAuthHandler() {
  const router = useRouter();
  const { setUser, setIsLogged } = useGlobalContext();
  const oauthProcessingRef = useRef(false);

  useEffect(() => {
    const handleDeepLink = async (url) => {
      console.log('🔗 Deep link received:', url);

      if (url && (url.includes('com.jsm.asabcorp://') || url.includes('asabcorp://'))) {
        console.log('✅ Valid deep link detected');

        // Handle Facebook OAuth success
        if (url.includes('facebook-success') || url.includes('facebook') || url.includes('success')) {
          console.log('📱 Handling Facebook OAuth success...');
          oauthProcessingRef.current = true;
          
          // Wait a bit for the session to be established
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            console.log('🔄 Attempting to get/create Facebook user...');
            // getOrCreateFacebookUser() has built-in retry logic
            const user = await getOrCreateFacebookUser();
            if (user) {
              console.log('✅ Facebook user created/logged in:', user);
              setUser(user);
              setIsLogged(true);
              router.replace('/(tabs)/home');
              oauthProcessingRef.current = false;
            } else {
              console.error('❌ No user returned from getOrCreateFacebookUser');
              Alert.alert("Error", "Failed to create user account. Please try again.");
              router.replace('/(auth)/sign-in');
              oauthProcessingRef.current = false;
            }
          } catch (error) {
            console.error('❌ Facebook OAuth error:', error);
            Alert.alert("Error", error.message || "Failed to sign in with Facebook. Please try again.");
            router.replace('/(auth)/sign-in');
            oauthProcessingRef.current = false;
          }
        }
        // Handle Facebook OAuth failure
        else if (url.includes('facebook-failure')) {
          console.log('❌ Facebook OAuth failure detected');
          Alert.alert("Error", "Facebook login was cancelled or failed. Please try again.");
          router.replace('/(auth)/sign-in');
        }
        // Handle Google OAuth success
        else if (url.includes('google-success') || url.includes('google')) {
          console.log('📱 Handling Google OAuth success...');
          oauthProcessingRef.current = true;
          
          // Wait a bit for the session to be established
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            console.log('🔄 Attempting to get/create Google user...');
            // getOrCreateGoogleUser() has built-in retry logic
            const user = await getOrCreateGoogleUser();
            if (user) {
              console.log('✅ Google user created/logged in:', user);
              setUser(user);
              setIsLogged(true);
              router.replace('/(tabs)/home');
              oauthProcessingRef.current = false;
            } else {
              console.error('❌ No user returned from getOrCreateGoogleUser');
              Alert.alert("Error", "Failed to create user account. Please try again.");
              router.replace('/(auth)/sign-in');
              oauthProcessingRef.current = false;
            }
          } catch (error) {
            console.error('❌ Google OAuth error:', error);
            Alert.alert("Error", error.message || "Failed to sign in with Google. Please try again.");
            router.replace('/(auth)/sign-in');
            oauthProcessingRef.current = false;
          }
        }
        // Handle Google OAuth failure
        else if (url.includes('google-failure')) {
          console.log('❌ Google OAuth failure detected');
          Alert.alert("Error", "Google login was cancelled or failed. Please try again.");
          router.replace('/(auth)/sign-in');
        }
        // Handle other OAuth
        else if (url.includes('com.jsm.asabcorp://')) {
          // Wait a bit for the session to be established
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            // Get the current account from Appwrite
            const currentAccount = await account.get();
            
            
            // Check if user exists in our database
            let existingUser;
            try {
             
              const users = await databases.listDocuments(
                '685494a1002f8417c2b2', // databaseId
                '685494cd001135a4d108', // userCollectionId
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
              
              const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(currentAccount.name)}&background=random`;
              
              const newUser = await databases.createDocument(
                '685494a1002f8417c2b2', // databaseId
                '685494cd001135a4d108', // userCollectionId
                ID.unique(),
                {
                  accountId: currentAccount.$id,
                  email: currentAccount.email,
                  username: currentAccount.name,
                  avatar: avatarUrl,
                }
              );
              
              
              setUser(newUser);
              setIsLogged(true);
              router.replace('/(tabs)/home');
              
            }
          } catch (error) {
           
            router.replace('/(auth)/sign-in');
          }
        }
      }
    };

    // ✅ Handle when app is opened from deep link
    Linking.getInitialURL().then((url) => {
      console.log('📱 Initial URL:', url);
      if (url) {
        console.log('🔗 Processing initial URL...');
        handleDeepLink(url);
      }
    });

    // ✅ Listen while app is open
    const linkingSubscription = Linking.addEventListener('url', (event) => {
      console.log('🔗 URL event received:', event.url);
      handleDeepLink(event.url);
    });

    // ✅ Listen for app state changes (when app comes back from browser)
    const appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'active' && !oauthProcessingRef.current) {
        console.log('📱 App became active - checking for OAuth session...');
        
        // Wait a bit for OAuth session to be established
        setTimeout(async () => {
          try {
            // Check if we have a valid session (means OAuth might have completed)
            const currentAccount = await account.get().catch(() => null);
            if (currentAccount && currentAccount.$id) {
              console.log('✅ OAuth session found, checking for user...');
              oauthProcessingRef.current = true;
              
              try {
                // Try to get or create user (works for both Facebook and Google)
                const user = await getOrCreateFacebookUser().catch(() => getOrCreateGoogleUser());
                if (user) {
                  console.log('✅ User created/logged in via AppState check:', user);
                  setUser(user);
                  setIsLogged(true);
                  router.replace('/(tabs)/home');
                  oauthProcessingRef.current = false;
                }
              } catch (error) {
                console.log('⚠️ Could not create/get user:', error.message);
                oauthProcessingRef.current = false;
              }
            }
          } catch (error) {
            // No session yet, that's okay
            console.log('ℹ️ No active session found');
          }
        }, 2000);
      }
    });

    return () => {
      linkingSubscription.remove();
      appStateSubscription.remove();
    };
  }, [router, setUser, setIsLogged]);

  return null;
}

export default function RootLayout() {
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

  useEffect(() => {
    // Hide splash screen even if fonts fail to load
    SplashScreen.hideAsync();
  }, [loaded]);

  // Always render the app, even if fonts fail to load
  return (
    <GlobalProvider>
      <OAuthHandler />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="post/[id]" options={{ headerShown: false }} />
      </Stack>
    </GlobalProvider>
  );
}

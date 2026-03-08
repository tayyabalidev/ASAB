import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  AppState,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from 'expo-linear-gradient';
import { images } from "../../constants";
import FormField from "../../components/FormField";
import CustomButton from "../../components/CustomButton";
import { GoogleSignInButton, LanguageSelector } from "../../components";
import ThemeToggle from "../../components/ThemeToggle";
import { signIn, getCurrentUser, signInWithFacebook, signInWithGoogle, appwriteConfig, getAccount, getOrCreateFacebookUser, getOrCreateGoogleUser } from "../../lib/appwrite";
import { useRouter } from "expo-router";
import { useGlobalContext } from "../../context/GlobalProvider";
import { useTranslation } from "react-i18next";

const SignIn = () => {
  const router = useRouter();
  const { setUser, setIsLogged, isDarkMode, user, isRTL } = useGlobalContext();
  const { t } = useTranslation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  // Reset loading states if user successfully logged in
  React.useEffect(() => {
    if (user) {
      if (isFacebookLoading) setIsFacebookLoading(false);
      if (isGoogleLoading) setIsGoogleLoading(false);
    }
  }, [user, isFacebookLoading, isGoogleLoading]);

  // Reset loading state if app comes back from background (OAuth redirect)
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && (isFacebookLoading || isGoogleLoading)) {
        // Check after a delay if user is logged in
        setTimeout(() => {
          if (user) {
            setIsFacebookLoading(false);
            setIsGoogleLoading(false);
          } else if (isFacebookLoading || isGoogleLoading) {
            // Still loading after app comes back - reset after timeout
            setTimeout(() => {
              if ((isFacebookLoading || isGoogleLoading) && !user) {
                setIsFacebookLoading(false);
                setIsGoogleLoading(false);
              }
            }, 3000);
          }
        }, 1000);
      }
    });

    // Also set timeout as backup
    const timeout = setTimeout(() => {
      if ((isFacebookLoading || isGoogleLoading) && !user) {
        setIsFacebookLoading(false);
        setIsGoogleLoading(false);
      }
    }, 15000); // Reset after 15 seconds if stuck

    return () => {
      subscription.remove();
      clearTimeout(timeout);
    };
  }, [isFacebookLoading, isGoogleLoading, user]);

  const submit = async () => {
    if (form.email === "" || form.password === "") {
      Alert.alert(t("common.error"), t("auth.fillAllFields"));
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await signIn(form.email, form.password);
      const user = await getCurrentUser();
      setUser(user);
      setIsLogged(true);
      Alert.alert(t("common.success"), t("auth.signInSuccess"));
      router.replace("/(tabs)/home");
    } catch (error) {
      Alert.alert(t("common.error"), error.message || t("auth.oauthFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFacebookLogin = async () => {
    setIsFacebookLoading(true);
    const successUrl = `${appwriteConfig.platform}://auth/facebook-success`;
    const failureUrl = `${appwriteConfig.platform}://auth/facebook-failure`;
    
    try {
      // This opens a browser/webview for Facebook OAuth
      // After successful login, Appwrite will redirect back to the app via deep link
      // The deep link handler in app/_layout.jsx will handle user creation
      await signInWithFacebook(successUrl, failureUrl);
      
      // Show instructions
      Alert.alert(
        t("auth.facebookLoginTitle"),
        t("auth.browserSteps"),
        [{ text: t("common.ok") }]
      );
      
      // Wait a bit for browser to open, then start polling
      setTimeout(() => {
        startSessionPolling();
      }, 3000);
    } catch (error) {
      Alert.alert(t("common.error"), error.message || t("auth.oauthFailed"));
      setIsFacebookLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    const successUrl = `${appwriteConfig.platform}://auth/google-success`;
    const failureUrl = `${appwriteConfig.platform}://auth/google-failure`;
    
    try {
      console.log('Starting Google OAuth with URLs:', { successUrl, failureUrl });
      // This opens a browser/webview for Google OAuth
      await signInWithGoogle(successUrl, failureUrl);
      
      console.log('Google OAuth browser opened, starting polling...');
      // Show instructions
      Alert.alert(
        t("auth.googleLoginTitle"),
        t("auth.browserSteps"),
        [{ text: t("common.ok") }]
      );
      
      // Wait a moment for browser to open, then start polling
      setTimeout(() => {
        startGoogleSessionPolling();
      }, 2000);
    } catch (error) {
      console.error('Google OAuth error:', error);
      setIsGoogleLoading(false);
      Alert.alert(
        t("common.error"), 
        error.message || t("auth.oauthFailed")
      );
    }
  };

  // Poll for OAuth session after Facebook login
  const startSessionPolling = () => {
    let pollCount = 0;
    const maxPolls = 30; // Poll for 30 seconds (30 * 1 second)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        // Check if we have a valid session
        const currentAccount = await getAccount();
        if (currentAccount && currentAccount.$id) {
          clearInterval(pollInterval);
          
          // Get or create user
          try {
            const user = await getOrCreateFacebookUser();
            if (user) {
              setUser(user);
              setIsLogged(true);
              setIsFacebookLoading(false);
              router.replace('/(tabs)/home');
            }
          } catch (error) {
            setIsFacebookLoading(false);
            Alert.alert(t("common.error"), t("auth.createUserFailed"));
          }
        }
      } catch (error) {
        // Log error for debugging
        if (pollCount % 5 === 0) { // Log every 5 seconds
        }
        
        // Session not ready yet, continue polling
        if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
          setIsFacebookLoading(false);
          
          // Show more helpful error message
          if (error.message && error.message.includes('missing scopes')) {
            Alert.alert(
              t("auth.oauthIssueTitle"),
              t("auth.oauthConfigCheck", { provider: "Facebook" })
            );
          } else {
            Alert.alert(
              t("common.info"),
              t("auth.oauthIncomplete")
            );
          }
        }
      }
    }, 1000); // Poll every 1 second
  };

  // Poll for OAuth session after Google login
  const startGoogleSessionPolling = () => {
    let pollCount = 0;
    const maxPolls = 90; // Poll for 90 seconds - session establishment can take time
    let missingScopesCount = 0; // Track consecutive "missing scopes" errors
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      
      try {
        // Check if we have a valid authenticated session
        // If account.get() succeeds without "missing scopes" error, session is ready
        const currentAccount = await getAccount();
        
        // If we get here without error, the session is authenticated
        if (currentAccount && currentAccount.$id) {
          clearInterval(pollInterval);
          missingScopesCount = 0; // Reset counter
          
          console.log('Google OAuth session authenticated, creating user...');
          
          // Get or create user
          try {
            const user = await getOrCreateGoogleUser();
            if (user) {
              setUser(user);
              setIsLogged(true);
              setIsGoogleLoading(false);
              router.replace('/(tabs)/home');
              return;
            }
          } catch (error) {
            console.error('Error creating Google user:', error);
            setIsGoogleLoading(false);
            Alert.alert(t("common.error"), error.message || t("auth.createUserFailed"));
            return;
          }
        }
      } catch (error) {
        const errorMessage = error.message || '';
        
        // "Missing scopes" means session is being established but not ready yet
        // This is normal during OAuth flow - continue polling
        if (errorMessage.includes('missing scopes') || errorMessage.includes('scope')) {
          missingScopesCount++;
          
          // Log every 10 seconds
          if (pollCount % 10 === 0) {
            console.log(`Google OAuth polling attempt ${pollCount}/${maxPolls}: Session establishing... (missing scopes - this is normal)`);
          }
          
          // If we've been getting "missing scopes" for too long, it might be a real issue
          if (missingScopesCount > 60) {
            clearInterval(pollInterval);
            setIsGoogleLoading(false);
            Alert.alert(
              t("auth.oauthIssueTitle"),
              `The Google OAuth session is taking too long to establish. Please:\n\n1. Verify the callback URI is added in Google Cloud Console:\nhttps://nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/6854922e0036a1e8dee6\n\n2. Complete the sign in flow in your browser\n\n3. Return to the app after authentication\n\n4. Try signing in again`
            );
            return;
          }
          
          // Continue polling - session is being established
          return;
        }
        
        // Log other errors every 10 seconds
        if (pollCount % 10 === 0) {
          console.log(`Google OAuth polling attempt ${pollCount}/${maxPolls}:`, errorMessage);
        }
        
        // Reset missing scopes counter if we get a different error
        missingScopesCount = 0;
        
        // Session not ready yet, continue polling
        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          setIsGoogleLoading(false);
          
          // Show more helpful error message with troubleshooting steps
          if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
            Alert.alert(
              t("auth.oauthIssueTitle"),
              `Google OAuth authentication failed. Please verify:\n\n1. The callback URI is correctly configured in Google Cloud Console\n2. The App ID and Secret are correct in Appwrite\n3. Try signing in again`
            );
          } else {
            Alert.alert(
              t("auth.oauthIssueTitle"),
              `The Google OAuth session was not established. Please verify:\n\n1. The callback URI is added in Google Cloud Console:\nhttps://nyc.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/6854922e0036a1e8dee6\n\n2. Complete the sign in flow in your browser\n\n3. Return to the app after authentication`
            );
          }
        }
      }
    }, 1000);
  };

  return (
    <LinearGradient
      colors={isDarkMode ? ['#032727', '#000'] : ['#F0FDF4', '#FFFFFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView className="h-full">
        {/* Theme & Language Controls */}
        <View className="absolute top-12 right-4 z-10">
          <View style={{ flexDirection: isRTL ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
            <LanguageSelector />
            <ThemeToggle />
          </View>
        </View>
        
        {/* Background Logo */}
        <View className={`absolute inset-0 justify-center items-center ${isDarkMode ? 'opacity-10' : 'opacity-5'}`}>
          <Image
            source={images.logo}
            resizeMode="contain"
            className="w-[370px] h-[450px]"
          />
        </View>
        
        <ScrollView>
        <View className="w-full justify-end min-h-[90vh] px-4 py-6">

          <View className="space-y-4">
            <Text className={`text-2xl font-bold text-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              {t('auth.signInTitle')}
            </Text>
            <Text className={`text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              {t('auth.signInSubtitle')}
            </Text>
          </View>

          <View className="space-y-4 mt-8">
            <FormField
              title={t('auth.emailLabel')}
              value={form.email}
              handleChangeText={(e) => setForm({ ...form, email: e })}
              otherStyles="mt-7"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder={t('auth.emailPlaceholder')}
            />

            <FormField
              title={t('auth.passwordLabel')}
              value={form.password}
              handleChangeText={(e) => setForm({ ...form, password: e })}
              otherStyles="mt-7"
              placeholder={t('auth.passwordPlaceholder')}
              isPassword
            />
          </View>

          <CustomButton
            title={t('auth.signInButton')}
            handlePress={submit}
            containerStyles="mt-7"
            isLoading={isSubmitting}
          />

          {/* Divider */}
          <View className="flex-row items-center mt-6">
            <View className={`flex-1 h-px ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
            <Text className={`mx-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {t('auth.orDivider')}
            </Text>
            <View className={`flex-1 h-px ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
          </View>

          {/* Google Login Button */}
          <GoogleSignInButton
            onPress={handleGoogleLogin}
            containerStyles="mt-6"
            isLoading={isGoogleLoading}
          />

          {/* Facebook Login Button */}
          <TouchableOpacity
            onPress={handleFacebookLogin}
            disabled={isFacebookLoading}
            className={`mt-4 flex-row items-center justify-center py-4 px-6 rounded-xl ${
              isDarkMode ? 'bg-[#1877F2]' : 'bg-[#1877F2]'
            } ${isFacebookLoading ? 'opacity-50' : ''}`}
            style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}
          >
            <Image
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/124/124010.png' }}
              className={`w-6 h-6 ${isRTL ? 'ml-3' : 'mr-3'}`}
              resizeMode="contain"
            />
            <Text className="text-white font-semibold text-base" style={{ textAlign: 'center' }}>
              {isFacebookLoading ? t('auth.signingIn') : t('auth.continueWithFacebook')}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center mt-6">
            <Text className={isDarkMode ? "text-gray-300" : "text-gray-600"}>{t('auth.noAccount')} </Text>
            <TouchableOpacity onPress={() => router.push("/sign-up")}>
              <Text className="text-secondary">{t('auth.goToSignUp')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SignIn;

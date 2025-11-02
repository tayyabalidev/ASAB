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
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from 'expo-linear-gradient';
import { images } from "../../constants";
import FormField from "../../components/FormField";
import CustomButton from "../../components/CustomButton";
import { GoogleSignInButton } from "../../components";
import ThemeToggle from "../../components/ThemeToggle";
import { signIn, getCurrentUser, signInWithFacebook, signInWithGoogle, appwriteConfig, getAccount, getOrCreateFacebookUser, getOrCreateGoogleUser } from "../../lib/appwrite";
import { useRouter } from "expo-router";
import { useGlobalContext } from "../../context/GlobalProvider";

const SignIn = () => {
  const router = useRouter();
  const { setUser, setIsLogged, isDarkMode, user } = useGlobalContext();
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
      Alert.alert("Error", "Please fill in all the fields");
    }

    setIsSubmitting(true);
    try {
      const session = await signIn(form.email, form.password);
      const user = await getCurrentUser();
      setUser(user);
      setIsLogged(true);
      Alert.alert("Success", "User signed in successfully");
      router.replace("/(tabs)/home");
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFacebookLogin = async () => {
    setIsFacebookLoading(true);
    const successUrl = `${appwriteConfig.platform}://auth/facebook-success`;
    const failureUrl = `${appwriteConfig.platform}://auth/facebook-failure`;
    
    console.log('🚀 Starting Facebook login...');
    console.log('📍 Success URL:', successUrl);
    console.log('📍 Failure URL:', failureUrl);
    
    try {
      // This opens a browser/webview for Facebook OAuth
      // After successful login, Appwrite will redirect back to the app via deep link
      // The deep link handler in app/_layout.jsx will handle user creation
      await signInWithFacebook(successUrl, failureUrl);
      console.log('✅ Facebook OAuth initiated - Browser should open now');
      
      // Show instructions
      Alert.alert(
        "Facebook Login",
        "Browser me Facebook login complete karein:\n\n1. Browser me login complete karein\n2. Browser close karke app me wapas aayein\n3. Login automatically ho jayega\n\n⚠️ IMPORTANT: Facebook Developer Console me redirect URI add kiya hua hai na?",
        [{ text: "OK" }]
      );
      
      // Wait a bit for browser to open, then start polling
      setTimeout(() => {
        console.log('⏳ Starting polling for session...');
        startSessionPolling();
      }, 3000);
    } catch (error) {
      console.error('❌ Facebook login error:', error);
      Alert.alert("Error", error.message || "Facebook login failed. Please check Appwrite configuration.");
      setIsFacebookLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    const successUrl = `${appwriteConfig.platform}://auth/google-success`;
    const failureUrl = `${appwriteConfig.platform}://auth/google-failure`;
    
    console.log('🚀 Starting Google login...');
    console.log('📍 Success URL:', successUrl);
    console.log('📍 Failure URL:', failureUrl);
    
    try {
      // This opens a browser/webview for Google OAuth
      await signInWithGoogle(successUrl, failureUrl);
      console.log('✅ Google OAuth initiated - Browser should open now');
      
      // Show instructions
      Alert.alert(
        "Google Login",
        "Browser me Google login complete karein:\n\n1. Browser me login complete karein\n2. Browser close karke app me wapas aayein\n3. Login automatically ho jayega",
        [{ text: "OK" }]
      );
      
      // Start polling for session
      startGoogleSessionPolling();
    } catch (error) {
      console.error('❌ Google login error:', error);
      Alert.alert("Error", error.message || "Google login failed. Please check Appwrite configuration.");
      setIsGoogleLoading(false);
    }
  };

  // Poll for OAuth session after Facebook login
  const startSessionPolling = () => {
    let pollCount = 0;
    const maxPolls = 30; // Poll for 30 seconds (30 * 1 second)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      console.log(`🔄 Polling for session... (${pollCount}/${maxPolls})`);
      
      try {
        // Check if we have a valid session
        const currentAccount = await getAccount();
        if (currentAccount && currentAccount.$id) {
          console.log('✅ Session found via polling!');
          clearInterval(pollInterval);
          
          // Get or create user
          try {
            const user = await getOrCreateFacebookUser();
            if (user) {
              console.log('✅ User created/logged in via polling:', user);
              setUser(user);
              setIsLogged(true);
              setIsFacebookLoading(false);
              router.replace('/(tabs)/home');
            }
          } catch (error) {
            console.error('❌ Error creating user:', error);
            setIsFacebookLoading(false);
            Alert.alert("Error", "Failed to create user. Please try again.");
          }
        }
      } catch (error) {
        // Log error for debugging
        if (pollCount % 5 === 0) { // Log every 5 seconds
          console.log(`⚠️ Session check error (${pollCount}/30):`, error.message || error);
        }
        
        // Session not ready yet, continue polling
        if (pollCount >= maxPolls) {
          console.log('⏰ Polling timeout - no session found');
          console.error('❌ Final error:', error);
          clearInterval(pollInterval);
          setIsFacebookLoading(false);
          
          // Show more helpful error message
          if (error.message && error.message.includes('missing scopes')) {
            Alert.alert(
              "OAuth Issue", 
              "Facebook OAuth session not established properly. Please check:\n\n1. Appwrite me Facebook OAuth properly configured hai\n2. Facebook App me redirect URI add kiya hua hai\n3. Browser me Facebook login complete ho gaya hai\n\nPlease try again after verifying these settings."
            );
          } else {
            Alert.alert(
              "Info", 
              "Facebook login complete nahi hui. Please:\n\n1. Browser me Facebook login complete karein\n2. Browser band karke app me wapas aayein\n3. Phir se try karein"
            );
          }
        }
      }
    }, 1000); // Poll every 1 second
  };

  // Poll for OAuth session after Google login
  const startGoogleSessionPolling = () => {
    let pollCount = 0;
    const maxPolls = 30; // Poll for 30 seconds (30 * 1 second)
    
    const pollInterval = setInterval(async () => {
      pollCount++;
      console.log(`🔄 Google: Polling for session... (${pollCount}/${maxPolls})`);
      
      try {
        // Check if we have a valid session
        const currentAccount = await getAccount();
        if (currentAccount && currentAccount.$id) {
          console.log('✅ Google: Session found via polling!');
          clearInterval(pollInterval);
          
          // Get or create user
          try {
            const user = await getOrCreateGoogleUser();
            if (user) {
              console.log('✅ Google: User created/logged in via polling:', user);
              setUser(user);
              setIsLogged(true);
              setIsGoogleLoading(false);
              router.replace('/(tabs)/home');
            }
          } catch (error) {
            console.error('❌ Google: Error creating user:', error);
            setIsGoogleLoading(false);
            Alert.alert("Error", "Failed to create user. Please try again.");
          }
        }
      } catch (error) {
        // Log error for debugging
        if (pollCount % 5 === 0) {
          console.log(`⚠️ Google: Session check error (${pollCount}/30):`, error.message || error);
        }
        
        // Session not ready yet, continue polling
        if (pollCount >= maxPolls) {
          console.log('⏰ Google: Polling timeout - no session found');
          console.error('❌ Google: Final error:', error);
          clearInterval(pollInterval);
          setIsGoogleLoading(false);
          
          // Show more helpful error message
          if (error.message && error.message.includes('missing scopes')) {
            Alert.alert(
              "OAuth Issue", 
              "Google OAuth session not established. Please:\n\n1. Appwrite me Google OAuth configured hai\n2. Google Cloud Console me redirect URI add kiya hua hai\n3. Browser me Google login complete ho gaya hai"
            );
          } else {
            Alert.alert(
              "Info", 
              "Google login complete nahi hui. Please:\n\n1. Browser me Google login complete karein\n2. Browser band karke app me wapas aayein\n3. Phir se try karein"
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
        {/* Theme Toggle */}
        <View className="absolute top-12 right-4 z-10">
          <ThemeToggle />
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
              Sign In to ASAB
            </Text>
            <Text className={`text-center ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Welcome back! Please sign in to your account
            </Text>
          </View>

          <View className="space-y-4 mt-8">
            <FormField
              title="Email"
              value={form.email}
              handleChangeText={(e) => setForm({ ...form, email: e })}
              otherStyles="mt-7"
              keyboardType="email-address"
            />

            <FormField
              title="Password"
              value={form.password}
              handleChangeText={(e) => setForm({ ...form, password: e })}
              otherStyles="mt-7"
            />
          </View>

          <CustomButton
            title="Sign In"
            handlePress={submit}
            containerStyles="mt-7"
            isLoading={isSubmitting}
          />

          {/* Divider */}
          <View className="flex-row items-center mt-6">
            <View className={`flex-1 h-px ${isDarkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />
            <Text className={`mx-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>OR</Text>
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
          >
            <Image
              source={{ uri: 'https://cdn-icons-png.flaticon.com/512/124/124010.png' }}
              className="w-6 h-6 mr-3"
              resizeMode="contain"
            />
            <Text className="text-white font-semibold text-base">
              {isFacebookLoading ? 'Signing in...' : 'Continue with Facebook'}
            </Text>
          </TouchableOpacity>

          <View className="flex-row justify-center mt-6">
            <Text className={isDarkMode ? "text-gray-300" : "text-gray-600"}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push("/sign-up")}>
              <Text className="text-secondary">Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default SignIn;

import React, { useState } from "react";
import { Link, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, ScrollView, Dimensions, Alert, Image, TouchableOpacity, AppState } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { images } from "../../constants";
import { createUser, signInWithGoogle, signInWithFacebook, appwriteConfig, getAccount, getOrCreateFacebookUser, getOrCreateGoogleUser } from "../../lib/appwrite";
import { CustomButton, FormField, GoogleSignInButton, ThemeToggle } from "../../components";
import { useGlobalContext } from "../../context/GlobalProvider";

const SignUp = () => {
  const { setUser, setIsLogged, isDarkMode, user } = useGlobalContext();

  const [isSubmitting, setSubmitting] = useState(false);
  const [isGoogleSubmitting, setGoogleSubmitting] = useState(false);
  const [isFacebookLoading, setIsFacebookLoading] = useState(false);
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  // Reset loading states if user successfully logged in
  React.useEffect(() => {
    if (user) {
      if (isFacebookLoading) setIsFacebookLoading(false);
      if (isGoogleSubmitting) setGoogleSubmitting(false);
    }
  }, [user, isFacebookLoading, isGoogleSubmitting]);

  // Reset loading state if app comes back from background (OAuth redirect)
  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && (isFacebookLoading || isGoogleSubmitting)) {
        // Check after a delay if user is logged in
        setTimeout(() => {
          if (user) {
            setIsFacebookLoading(false);
            setGoogleSubmitting(false);
          } else if (isFacebookLoading || isGoogleSubmitting) {
            // Still loading after app comes back - reset after timeout
            setTimeout(() => {
              if ((isFacebookLoading || isGoogleSubmitting) && !user) {
                setIsFacebookLoading(false);
                setGoogleSubmitting(false);
              }
            }, 3000);
          }
        }, 1000);
      }
    });

    // Also set timeout as backup
    const timeout = setTimeout(() => {
      if ((isFacebookLoading || isGoogleSubmitting) && !user) {
        setIsFacebookLoading(false);
        setGoogleSubmitting(false);
      }
    }, 15000); // Reset after 15 seconds if stuck

    return () => {
      subscription.remove();
      clearTimeout(timeout);
    };
  }, [isFacebookLoading, isGoogleSubmitting, user]);


  const submit = async () => {
    if (form.username === "" || form.email === "" || form.password === "") {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (!form.email.includes('@') || !form.email.includes('.')) {
      Alert.alert("Error", "Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const result = await createUser(form.email, form.password, form.username);
      setUser(result);
      setIsLogged(true);
      router.replace("/(tabs)/home");
    } catch (error) {
      Alert.alert("Error", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleSubmitting(true);
    const successUrl = `${appwriteConfig.platform}://auth/google-success`;
    const failureUrl = `${appwriteConfig.platform}://auth/google-failure`;
    
    console.log('🚀 Starting Google sign up...');
    console.log('📍 Success URL:', successUrl);
    console.log('📍 Failure URL:', failureUrl);
    
    try {
      // This opens a browser/webview for Google OAuth
      await signInWithGoogle(successUrl, failureUrl);
      console.log('✅ Google OAuth initiated - Browser should open now');
      
      // Show instructions
      Alert.alert(
        "Google Sign Up",
        "Browser me Google login complete karein:\n\n1. Browser me login complete karein\n2. Browser close karke app me wapas aayein\n3. Login automatically ho jayega",
        [{ text: "OK" }]
      );
      
      // Start polling for session
      startGoogleSessionPolling();
    } catch (error) {
      console.error('❌ Google sign up error:', error);
      Alert.alert("Error", error.message || "Google sign up failed. Please check Appwrite configuration.");
      setGoogleSubmitting(false);
    }
  };

  const handleFacebookSignUp = async () => {
    setIsFacebookLoading(true);
    try {
      // This opens a browser/webview for Facebook OAuth
      // After successful login, Appwrite will redirect back to the app via deep link
      // The deep link handler in app/_layout.jsx will handle user creation
      await signInWithFacebook(
        `${appwriteConfig.platform}://auth/facebook-success`,
        `${appwriteConfig.platform}://auth/facebook-failure`
      );
      
      // Start polling for session after OAuth
      startSessionPolling();
    } catch (error) {
      Alert.alert("Error", error.message || "Facebook sign up failed");
      setIsFacebookLoading(false);
    }
  };

  // Poll for OAuth session after Google sign up
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
              setGoogleSubmitting(false);
              router.replace('/(tabs)/home');
            }
          } catch (error) {
            console.error('❌ Google: Error creating user:', error);
            setGoogleSubmitting(false);
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
          setGoogleSubmitting(false);
          
          // Show more helpful error message
          if (error.message && error.message.includes('missing scopes')) {
            Alert.alert(
              "OAuth Issue", 
              "Google OAuth session not established. Please:\n\n1. Appwrite me Google OAuth configured hai\n2. Google Cloud Console me redirect URI add kiya hua hai\n3. Browser me Google login complete ho gaya hai"
            );
          } else {
            Alert.alert(
              "Info", 
              "Google sign up complete nahi hui. Please:\n\n1. Browser me Google login complete karein\n2. Browser band karke app me wapas aayein\n3. Phir se try karein"
            );
          }
        }
      }
    }, 1000);
  };

  // Poll for OAuth session after Facebook sign up
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
        // Session not ready yet, continue polling
        if (pollCount >= maxPolls) {
          console.log('⏰ Polling timeout - no session found');
          clearInterval(pollInterval);
          setIsFacebookLoading(false);
          Alert.alert("Info", "Please complete the Facebook sign up in the browser and return to the app. If you've already signed up, please try again.");
        }
      }
    }, 1000); // Poll every 1 second
  };

  return (
    <LinearGradient
      colors={isDarkMode ? ['#032727', '#000'] : ['#F0FDF4', '#FFFFFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      className="h-full"
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

            <Text className={`text-2xl font-bold font-psemibold mb-8 ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
              Sign up
            </Text>

          <FormField
            title="Username"
            value={form.username}
            handleChangeText={(e) => setForm({ ...form, username: e })}
            placeholder="Your unique username"
            otherStyles="mt-6"
          />

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

          <CustomButton
            title="Sign Up"
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

          {/* Google Sign Up Button */}
          <GoogleSignInButton
            onPress={handleGoogleSignIn}
            containerStyles="mt-6"
            isLoading={isGoogleSubmitting}
          />

          {/* Facebook Sign Up Button */}
          <TouchableOpacity
            onPress={handleFacebookSignUp}
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
              {isFacebookLoading ? 'Signing up...' : 'Sign up with Facebook'}
            </Text>
          </TouchableOpacity>

          <View className="flex justify-center pt-5 items-center">
            <Text className={isDarkMode ? "text-gray-300" : "text-gray-600"}>Already have an account? </Text>
            <Link
              href="/sign-in"
              className="text-lg font-psemibold text-secondary"
            >
              Login
            </Link>
          </View>
          
          {/* White bottom indicator line */}
          <View />
        </View>
      </ScrollView>
    </SafeAreaView>
    </LinearGradient>
  );
};

export default SignUp;

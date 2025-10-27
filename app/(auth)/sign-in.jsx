import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from 'expo-linear-gradient';
import { images } from "../../constants";
import FormField from "../../components/FormField";
import CustomButton from "../../components/CustomButton";
import ThemeToggle from "../../components/ThemeToggle";
import { signIn, getCurrentUser } from "../../lib/appwrite";
import { useRouter } from "expo-router";
import { useGlobalContext } from "../../context/GlobalProvider";

const SignIn = () => {
  const router = useRouter();
  const { setUser, setIsLogged, isDarkMode } = useGlobalContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

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

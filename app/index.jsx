import { StatusBar } from "expo-status-bar";
import { Redirect, router } from "expo-router";
import { View, Text, Image, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useState, useEffect } from "react";

import { images } from "../constants";
import { CustomButton, Loader, SplashScreen, ThemeToggle } from "../components";
import { useGlobalContext } from "../context/GlobalProvider";

const Welcome = () => {
  const { loading, isLogged, isDarkMode, theme } = useGlobalContext();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (!loading && isLogged) {
      setShowSplash(false);
    }
  }, [loading, isLogged]);

  // Show splash only for users who still need onboarding
  if (showSplash && !isLogged) {
    console.log('Showing splash screen');
    return <SplashScreen onComplete={() => {
      console.log('Splash screen completed, showing onboarding');
      setShowSplash(false);
    }} />;
  }

  // After splash screen, check if user is logged in
  if (!loading && isLogged) return <Redirect href="/home" />;

  console.log('Showing onboarding page');

  return (
    <LinearGradient
      colors={
        isDarkMode
          ? ["#1f1728", "#0f1320", theme.background]
          : ["#FFFFFF", "#F5F3FF", theme.background]
      }
      locations={[0, 0.35, 1]}
      className="h-full"
    >
      <SafeAreaView className="h-full" style={{ backgroundColor: theme.background }}>
        <Loader isLoading={loading} />
        
        {/* Theme Toggle */}
        <View className="absolute top-12 right-4 z-10">
          <ThemeToggle />
        </View>

        <ScrollView
          contentContainerStyle={{
            height: "100%",
          }}
        >
          <View className="w-full flex justify-center items-center h-full px-4">
          <Image
            source={images.blogo}
            className="max-w-[380px] w-full h-[458px]"
            resizeMode="center"
          />

          <View className="relative mt-1 items-center">
            {/* Main text */}
            <View className="items-center">
              <Text
                className="text-3xl font-bold text-center"
                style={{ color: theme.textPrimary }}
              >
                Discover Endless
              </Text>
              
              {/* Second line: Possibilities with ASAB */}
              <View className="items-center">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                  <Text
                    className="text-3xl font-bold"
                    style={{ color: theme.textPrimary }}
                  >
                    Possibilities with{" "}
                  </Text>
                  <View style={{ flexDirection: 'row' }}>
                    <Text className="text-3xl font-bold" style={{ color: theme.accent }}>A</Text>
                    <Text className="text-3xl font-bold" style={{ color: theme.accent }}>S</Text>
                    <Text className="text-3xl font-bold" style={{ color: theme.accent }}>A</Text>
                    <Text className="text-3xl font-bold" style={{ color: theme.accent }}>B</Text>
                  </View>
                </View>
                
                {/* Curved underline positioned under ASAB only */}
                <View 
                  style={{
                    marginTop: 8,
                    width: 100,
                    height: 4,
                    backgroundColor: theme.accent,
                    borderRadius: 25,
                    alignSelf: 'end',
                  }}
                />
              </View>
            </View>

            <Image
              source={images.path}
              className="w-[136px] h-[15px] absolute -bottom-2 -right-8"
              resizeMode="contain"
            />
          </View>

          <Text
            className="text-sm font-pregular mt-5 text-center"
            style={{ color: theme.textSecondary }}
          >
            Where Creativity Meets Innovation: Embark on a Journey of Limitless
            Exploration with ASAB
          </Text>

          <CustomButton
            title="Continue with Email"
            handlePress={() => router.push("/sign-in")}
            containerStyles="w-full mt-4"
          />
        </View>
      </ScrollView>

      <StatusBar backgroundColor={theme.background} style={isDarkMode ? "light" : "dark"} />
    </SafeAreaView>
    </LinearGradient>
  );
};

export default Welcome;

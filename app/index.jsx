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
  const { loading, isLogged, isDarkMode } = useGlobalContext();
  const [showSplash, setShowSplash] = useState(true);

  // Always show splash screen first, regardless of loading state
  if (showSplash) {
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
      colors={isDarkMode ? ['#321E0A', '#1a1a2e', '#000000'] : ['#FEF3E2', '#F0FDF4', '#FFFFFF']}
      locations={[0, 0.5, 1]}
      className="h-full"
    >
      <SafeAreaView className="h-full">
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
              <Text className={`text-3xl font-bold text-center ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                Discover Endless
              </Text>
              
              {/* Second line: Possibilities with ASAB */}
              <View className="items-center">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                  <Text className={`text-3xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>
                    Possibilities with{" "}
                  </Text>
                  <View style={{ flexDirection: 'row' }}>
                    <Text className="text-3xl font-bold" style={{ color: isDarkMode ? '#501478' : '#FF9C01' }}>A</Text>
                    <Text className="text-3xl font-bold" style={{ color: isDarkMode ? '#65287A' : '#FF9C01' }}>S</Text>
                    <Text className="text-3xl font-bold" style={{ color: isDarkMode ? '#7A4A3C' : '#FF9C01' }}>A</Text>
                    <Text className="text-3xl font-bold" style={{ color: isDarkMode ? '#965014' : '#FF9C01' }}>B</Text>
                  </View>
                </View>
                
                {/* Curved underline positioned under ASAB only */}
                <View 
                  style={{
                    marginTop: 8,
                    width: 100,
                    height: 4,
                    backgroundColor: isDarkMode ? '#FF8E01' : '#FF9C01',
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

          <Text className={`text-sm font-pregular mt-5 text-center ${isDarkMode ? 'text-gray-100' : 'text-gray-600'}`}>
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

      <StatusBar backgroundColor={isDarkMode ? "#321E0A" : "#FEF3E2"} style={isDarkMode ? "light" : "dark"} />
    </SafeAreaView>
    </LinearGradient>
  );
};

export default Welcome;

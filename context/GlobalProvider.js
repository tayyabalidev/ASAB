import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getCurrentUser } from "../lib/appwrite.js";
import i18n, { supportedLanguages } from "../localization/i18n";

const GlobalContext = createContext();
export const useGlobalContext = () => useContext(GlobalContext);

const GlobalProvider = ({ children }) => {
  const [isLogged, setIsLogged] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState({}); // Track follow status across the app
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode
  const [language, setLanguage] = useState(i18n.language);
  const [isRTL, setIsRTL] = useState(i18n.dir() === "rtl");

  const applyLayoutDirection = (langCode) => {
    const direction = i18n.dir(langCode);
    setIsRTL(direction === "rtl");

    if (I18nManager.isRTL !== (direction === "rtl")) {
      I18nManager.allowRTL(true);
      I18nManager.forceRTL(direction === "rtl");
    }
  };

  const changeLanguage = useCallback(
    async (langCode, persist = true) => {
      const isSupported = supportedLanguages.some((lang) => lang.code === langCode);
      if (!isSupported) {
        return;
      }

      try {
        await i18n.changeLanguage(langCode);
        setLanguage(langCode);
        applyLayoutDirection(langCode);

        if (persist) {
          await AsyncStorage.setItem("app_language", langCode);
        }
      } catch (error) {
        console.error("Error changing language:", error);
      }
    },
    []
  );

  useEffect(() => {
    // Check if getCurrentUser is available
    if (typeof getCurrentUser !== 'function') {
      console.error('getCurrentUser is not a function:', getCurrentUser);
      setLoading(false);
      return;
    }

    getCurrentUser()
      .then((res) => {
        if (res) {
          setIsLogged(true);
          setUser(res);
        } else {
          setIsLogged(false);
          setUser(null);
        }
      })
      .catch((error) => {
        console.error('Error getting current user:', error);
        setIsLogged(false);
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [changeLanguage]);

  useEffect(() => {
    const loadLanguagePreference = async () => {
      try {
        const savedLanguage = await AsyncStorage.getItem("app_language");
        if (savedLanguage) {
          await changeLanguage(savedLanguage, false);
          return;
        }

        // Ensure direction matches the initial language
        applyLayoutDirection(i18n.language);
      } catch (error) {
        console.warn("Failed to load language preference:", error);
        applyLayoutDirection(i18n.language);
      }
    };

    loadLanguagePreference();
  }, []);

  // Function to update follow status
  const updateFollowStatus = (targetUserId, isFollowing) => {
    setFollowStatus(prev => ({
      ...prev,
      [targetUserId]: isFollowing
    }));
  };

  return (
    <GlobalContext.Provider
      value={{
        isLogged,
        setIsLogged,
        user,
        setUser,
        loading,
        followStatus,
        updateFollowStatus,
        isDarkMode,
        setIsDarkMode,
        language,
        changeLanguage,
        supportedLanguages,
        isRTL,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
};

export default GlobalProvider;

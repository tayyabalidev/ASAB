import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getCurrentUser } from "../lib/appwrite.js";
import i18n, { supportedLanguages } from "../localization/i18n";

const GlobalContext = createContext();
export const useGlobalContext = () => useContext(GlobalContext);

const darkTheme = {
  background: "#020617",
  surface: "rgba(15,23,42,0.8)",
  surfaceMuted: "rgba(15,23,42,0.6)",
  overlay: "rgba(0,0,0,0.5)",
  card: "rgba(15,23,42,0.9)",
  cardSoft: "rgba(15,23,42,0.65)",
  border: "rgba(148,163,184,0.25)",
  textPrimary: "#F8FAFC",
  textSecondary: "rgba(226,232,240,0.85)",
  textTertiary: "rgba(226,232,240,0.65)",
  textMuted: "rgba(148,163,184,0.7)",
  accent: "#FF9C01",
  accentSoft: "rgba(255,156,1,0.18)",
  success: "#34D399",
  danger: "#F87171",
  warning: "#FBBF24",
  tabBar: "#020617",
  tabActive: "#FF9C01",
  tabInactive: "#76E6FF",
  inputBackground: "rgba(15,23,42,0.9)",
  inputPlaceholder: "rgba(148,163,184,0.8)",
  divider: "rgba(148,163,184,0.25)",
  badgeBackground: "rgba(255,255,255,0.12)",
  gradient: ["#0f172a", "#020617", "#000000"],
};

const lightTheme = {
  background: "#F7F9FC",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F5F9",
  overlay: "rgba(255,255,255,0.75)",
  card: "#FFFFFF",
  cardSoft: "#F9FAFB",
  border: "#E2E8F0",
  textPrimary: "#0F172A",
  textSecondary: "#475467",
  textTertiary: "#667085",
  textMuted: "#98A2B3",
  accent: "#FF9C01",
  accentSoft: "rgba(255,156,1,0.18)",
  success: "#16A34A",
  danger: "#DC2626",
  warning: "#F59E0B",
  tabBar: "#FFFFFF",
  tabActive: "#FF9C01",
  tabInactive: "#64748B",
  inputBackground: "#FFFFFF",
  inputPlaceholder: "#94A3B8",
  divider: "#E2E8F0",
  badgeBackground: "rgba(15,23,42,0.08)",
  gradient: ["#FFFFFF", "#F1F5F9", "#E2E8F0"],
};

const GlobalProvider = ({ children }) => {
  const [isLogged, setIsLogged] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState({}); // Track follow status across the app
  const [isDarkMode, setIsDarkMode] = useState(false); // Default to light mode
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

  // Load persisted theme preference
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem("app_theme_mode");
        if (savedTheme) {
          setIsDarkMode(savedTheme === "dark");
        }
      } catch (error) {
        console.warn("Failed to load theme preference:", error);
      }
    };

    loadThemePreference();
  }, []);

  // Persist theme changes
  useEffect(() => {
    AsyncStorage.setItem("app_theme_mode", isDarkMode ? "dark" : "light").catch(() => {});
  }, [isDarkMode]);

  const theme = useMemo(() => (isDarkMode ? darkTheme : lightTheme), [isDarkMode]);
  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

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
        toggleTheme,
        language,
        changeLanguage,
        supportedLanguages,
        isRTL,
        theme,
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
};

export default GlobalProvider;

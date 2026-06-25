import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { images } from "../../constants";
import FormField from "../../components/FormField";
import CustomButton from "../../components/CustomButton";
import { LanguageSelector } from "../../components";
import ThemeToggle from "../../components/ThemeToggle";
import { useGlobalContext } from "../../context/GlobalProvider";
import {
  isValidEmail,
  mapRecoveryError,
  requestPasswordRecovery,
} from "../../lib/passwordRecovery";

const ForgotPassword = () => {
  const router = useRouter();
  const { isDarkMode, isRTL } = useGlobalContext();
  const { t } = useTranslation();

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const submitLockRef = useRef(false);

  const resolveErrorMessage = (error) => {
    const code = error?.message || "";
    if (code === "INVALID_EMAIL") return t("auth.enterValidEmail");
    if (code === "NETWORK_OFFLINE") return t("auth.recoveryNetworkError");
    if (code === "READONLY_MODE") {
      return t("auth.recoveryReadonlyMode");
    }
    if (code === "RECOVERY_REDIRECT_NOT_CONFIGURED") {
      return t("auth.recoveryRedirectNotConfigured");
    }
    if (code === "RECOVERY_REDIRECT_HTTPS_REQUIRED") {
      return t("auth.recoveryRedirectHttpsRequired");
    }
    const mapped = mapRecoveryError(error);
    return mapped.startsWith("auth.") ? t(mapped) : mapped;
  };

  const handleSendResetLink = async () => {
    if (submitLockRef.current || isSubmitting) return;

    if (!email.trim()) {
      Alert.alert(t("common.error"), t("auth.recoveryEmailRequired"));
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert(t("common.error"), t("auth.enterValidEmail"));
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      await requestPasswordRecovery(email);
      setEmailSent(true);
    } catch (error) {
      Alert.alert(t("common.error"), resolveErrorMessage(error));
    } finally {
      setIsSubmitting(false);
      submitLockRef.current = false;
    }
  };

  return (
    <LinearGradient
      colors={isDarkMode ? ["#032727", "#000"] : ["#F0FDF4", "#FFFFFF"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{ flex: 1 }}
    >
      <SafeAreaView className="h-full">
        <View className="absolute top-12 right-4 z-10">
          <View
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <LanguageSelector />
            <ThemeToggle />
          </View>
        </View>

        <View
          className={`absolute inset-0 justify-center items-center ${isDarkMode ? "opacity-10" : "opacity-5"}`}
        >
          <Image
            source={images.logo}
            resizeMode="contain"
            className="w-[370px] h-[450px]"
          />
        </View>

        <ScrollView>
          <View className="w-full justify-end min-h-[90vh] px-4 py-6">
            <TouchableOpacity
              onPress={() => router.back()}
              className="mb-4"
              style={{ alignSelf: isRTL ? "flex-end" : "flex-start" }}
            >
              <Text className="text-secondary font-psemibold">
                {t("auth.backToSignIn")}
              </Text>
            </TouchableOpacity>

            <View className="space-y-4">
              <Text
                className={`text-2xl font-bold text-center ${isDarkMode ? "text-white" : "text-gray-800"}`}
              >
                {t("auth.forgotPasswordTitle")}
              </Text>
              <Text
                className={`text-center ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {emailSent
                  ? t("auth.forgotPasswordSuccess")
                  : t("auth.forgotPasswordSubtitle")}
              </Text>
            </View>

            {!emailSent ? (
              <>
                <View className="space-y-4 mt-8">
                  <FormField
                    title={t("auth.emailLabel")}
                    value={email}
                    handleChangeText={setEmail}
                    otherStyles="mt-7"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder={t("auth.emailPlaceholder")}
                    editable={!isSubmitting}
                  />
                </View>

                <CustomButton
                  title={
                    isSubmitting
                      ? t("auth.sendingResetLink")
                      : t("auth.sendResetLink")
                  }
                  handlePress={handleSendResetLink}
                  containerStyles="mt-7"
                  isLoading={isSubmitting}
                />
              </>
            ) : (
              <View className="mt-8">
                <View
                  className={`rounded-xl p-4 ${isDarkMode ? "bg-green-900/30" : "bg-green-50"}`}
                >
                  <Text
                    className={`text-center ${isDarkMode ? "text-green-200" : "text-green-800"}`}
                  >
                    {t("auth.forgotPasswordCheckInbox", { email: email.trim() })}
                  </Text>
                </View>

                <CustomButton
                  title={t("auth.backToSignIn")}
                  handlePress={() => router.replace("/(auth)/sign-in")}
                  containerStyles="mt-7"
                />

                <TouchableOpacity
                  onPress={() => {
                    setEmailSent(false);
                    setEmail("");
                  }}
                  className="mt-4"
                >
                  <Text className="text-secondary text-center font-psemibold">
                    {t("auth.sendAnotherResetLink")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default ForgotPassword;

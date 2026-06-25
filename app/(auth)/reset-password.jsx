import React, { useState, useRef, useEffect } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";

import { images } from "../../constants";
import FormField from "../../components/FormField";
import CustomButton from "../../components/CustomButton";
import { LanguageSelector } from "../../components";
import ThemeToggle from "../../components/ThemeToggle";
import { useGlobalContext } from "../../context/GlobalProvider";
import {
  completePasswordRecovery,
  getPasswordValidationError,
  mapRecoveryError,
  PASSWORD_MIN_LENGTH,
} from "../../lib/passwordRecovery";

const ResetPassword = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isDarkMode, isRTL } = useGlobalContext();
  const { t } = useTranslation();

  const userId = params.userId ? String(params.userId) : "";
  const secret = params.secret ? String(params.secret) : "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const hasValidRecoveryParams = Boolean(userId && secret);

  useEffect(() => {
    if (!hasValidRecoveryParams) {
      Alert.alert(
        t("common.error"),
        t("auth.recoveryLinkInvalid"),
        [
          {
            text: t("common.ok"),
            onPress: () => router.replace("/(auth)/forgot-password"),
          },
        ]
      );
    }
  }, [hasValidRecoveryParams, router, t]);

  const resolveErrorMessage = (error) => {
    const code = error?.message || "";
    if (code === "NETWORK_OFFLINE") return t("auth.recoveryNetworkError");
    if (code === "MISSING_RECOVERY_PARAMS") return t("auth.recoveryLinkInvalid");
    if (code === "READONLY_MODE") return t("auth.recoveryReadonlyMode");
    if (code.startsWith("auth.")) return t(code);
    const mapped = mapRecoveryError(error);
    return mapped.startsWith("auth.") ? t(mapped) : mapped;
  };

  const handleResetPassword = async () => {
    if (submitLockRef.current || isSubmitting || !hasValidRecoveryParams) return;

    if (!password || !confirmPassword) {
      Alert.alert(t("common.error"), t("auth.fillAllFields"));
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t("common.error"), t("auth.passwordsDoNotMatch"));
      return;
    }

    const validationKey = getPasswordValidationError(password);
    if (validationKey) {
      Alert.alert(t("common.error"), t(validationKey));
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);

    try {
      await completePasswordRecovery(userId, secret, password);
      Alert.alert(t("common.success"), t("auth.resetPasswordSuccess"), [
        {
          text: t("common.ok"),
          onPress: () => router.replace("/(auth)/sign-in"),
        },
      ]);
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
            <View className="space-y-4">
              <Text
                className={`text-2xl font-bold text-center ${isDarkMode ? "text-white" : "text-gray-800"}`}
              >
                {t("auth.resetPasswordTitle")}
              </Text>
              <Text
                className={`text-center ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {t("auth.resetPasswordSubtitle")}
              </Text>
              <Text
                className={`text-center text-sm ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("auth.passwordRequirements", { min: PASSWORD_MIN_LENGTH })}
              </Text>
            </View>

            <View className="space-y-4 mt-8">
              <FormField
                title={t("auth.newPasswordLabel")}
                value={password}
                handleChangeText={setPassword}
                otherStyles="mt-7"
                placeholder={t("auth.newPasswordPlaceholder")}
                isPassword
                editable={!isSubmitting && hasValidRecoveryParams}
              />

              <FormField
                title={t("auth.confirmPasswordLabel")}
                value={confirmPassword}
                handleChangeText={setConfirmPassword}
                otherStyles="mt-7"
                placeholder={t("auth.confirmPasswordPlaceholder")}
                isPassword
                editable={!isSubmitting && hasValidRecoveryParams}
              />
            </View>

            <CustomButton
              title={
                isSubmitting
                  ? t("auth.resettingPassword")
                  : t("auth.resetPasswordButton")
              }
              handlePress={handleResetPassword}
              containerStyles="mt-7"
              isLoading={isSubmitting}
            />

            <TouchableOpacity
              onPress={() => router.replace("/(auth)/sign-in")}
              className="mt-6"
            >
              <Text className="text-secondary text-center font-psemibold">
                {t("auth.backToSignIn")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default ResetPassword;

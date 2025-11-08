import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useGlobalContext } from "../context/GlobalProvider";
import { useTranslation } from "react-i18next";

const CustomButton = ({
  title,
  handlePress,
  containerStyles,
  textStyles,
  isLoading,
}) => {
  const { isDarkMode, isRTL } = useGlobalContext();
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={isLoading}
      className={containerStyles || ""}
    >
      <LinearGradient
        colors={isDarkMode ? ['#501478', '#965014'] : ['#8B5CF6', '#D97706']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        className={`rounded-xl min-h-[62px] flex flex-row justify-center items-center ${
          isLoading ? "opacity-50" : ""
        }`}
        style={{ flexDirection: isRTL ? 'row-reverse' : 'row' }}
      >
        <Text className={`text-white font-psemibold text-lg ${textStyles}`}>
          {title}
        </Text>

        {isLoading && (
          <ActivityIndicator
            animating={isLoading}
            color="#fff"
            size="small"
            className={isRTL ? "mr-2" : "ml-2"}
          />
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

// Google Sign In Button Component
const GoogleSignInButton = ({
  onPress,
  containerStyles,
  isLoading = false,
  label,
  loadingLabel,
}) => {
  const { t } = useTranslation();
  const { isDarkMode, isRTL } = useGlobalContext();

  const defaultLabel = label || t("auth.continueWithGoogle");
  const defaultLoadingLabel = loadingLabel || t("auth.signingIn");
  const textColor = isDarkMode ? "#FFFFFF" : "#000000";
  const backgroundColor = isDarkMode ? "#1F2937" : "#FFFFFF";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`rounded-xl min-h-[62px] px-4 items-center ${containerStyles} ${
        isLoading ? "opacity-50" : ""
      }`}
      disabled={isLoading}
      style={{
        backgroundColor,
        flexDirection: isRTL ? "row-reverse" : "row",
        justifyContent: "center",
      }}
    >
      <Text
        className={`font-psemibold text-lg ${isRTL ? "ml-2" : "mr-2"}`}
        style={{ color: textColor }}
      >
        🔑
      </Text>
      <Text className="font-psemibold text-lg" style={{ color: textColor }}>
        {isLoading ? defaultLoadingLabel : defaultLabel}
      </Text>

      {isLoading && (
        <ActivityIndicator
          animating={isLoading}
          color={textColor}
          size="small"
          className={isRTL ? "mr-2" : "ml-2"}
        />
      )}
    </TouchableOpacity>
  );
};

export default CustomButton;
export { GoogleSignInButton };

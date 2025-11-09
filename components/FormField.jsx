import { useState, useCallback } from "react";
import { View, Text, TextInput, TouchableOpacity, Image } from "react-native";

import { icons } from "../constants";
import { useGlobalContext } from "../context/GlobalProvider";

const FormField = ({
  title,
  value,
  placeholder,
  handleChangeText,
  otherStyles,
  isPassword = false,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const { isDarkMode, isRTL, theme } = useGlobalContext();

  const themedColor = useCallback(
    (darkValue, lightValue) => (isDarkMode ? darkValue : lightValue),
    [isDarkMode]
  );

  return (
    <View className={otherStyles || ""} style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 16,
          fontFamily: "Poppins-Medium",
          color: theme.textPrimary,
          textAlign: isRTL ? "right" : "left",
          marginBottom: 4,
        }}
      >
        {title}
      </Text>

      <View 
        style={{
          width: "100%",
          height: 60,
          paddingHorizontal: 16,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: themedColor(theme.surface, theme.surface),
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
        }}
      >
        <TextInput
          style={{
            flex: 1,
            fontFamily: "Poppins-SemiBold",
            fontSize: 16,
            color: theme.textPrimary,
            textAlign: isRTL ? "right" : "left",
          }}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={theme.inputPlaceholder}
          onChangeText={handleChangeText}
          secureTextEntry={isPassword && !showPassword}
          {...props}
        />

        {isPassword && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Image
              source={!showPassword ? icons.eye : icons.eyeHide}
              style={{
                width: 24,
                height: 24,
                tintColor: theme.textSecondary,
              }}
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default FormField;

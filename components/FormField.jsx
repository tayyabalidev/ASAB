import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Image } from "react-native";

import { icons } from "../constants";
import { useGlobalContext } from "../context/GlobalProvider";

const FormField = ({
  title,
  value,
  placeholder,
  handleChangeText,
  otherStyles,
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const { isDarkMode } = useGlobalContext();

  return (
    <View className={`space-y-2 ${otherStyles}`}>
      <Text className={`text-base font-pmedium ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>{title}</Text>

      <View 
        className={`w-full h-16 px-4 rounded-2xl border-2 flex flex-row items-center ${
          isDarkMode ? 'bg-black-100' : 'bg-gray-50'
        }`}
        style={{ borderColor: isDarkMode ? '#501478' : '#8B5CF6' }}
      >
        <TextInput
          className={`flex-1 font-psemibold text-base ${isDarkMode ? 'text-white' : 'text-gray-900'}`}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={isDarkMode ? "#7B7B8B" : "#9CA3AF"}
          onChangeText={handleChangeText}
          secureTextEntry={title === "Password" && !showPassword}
          {...props}
        />

        {title === "Password" && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Image
              source={!showPassword ? icons.eye : icons.eyeHide}
              className="w-6 h-6"
              resizeMode="contain"
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default FormField;

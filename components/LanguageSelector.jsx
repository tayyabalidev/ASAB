import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";

import { useGlobalContext } from "../context/GlobalProvider";

const LanguageSelector = ({ containerStyles }) => {
  const { language, changeLanguage, supportedLanguages, isDarkMode, isRTL } = useGlobalContext();
  const { t } = useTranslation();

  const [isVisible, setIsVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const currentLanguage = useMemo(
    () => supportedLanguages.find((item) => item.code === language),
    [language, supportedLanguages]
  );

  const filteredLanguages = useMemo(() => {
    if (!searchTerm) {
      return supportedLanguages;
    }

    const normalizedSearch = searchTerm.trim().toLowerCase();
    return supportedLanguages.filter((item) => {
      const haystack = `${item.name} ${item.nativeName}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [searchTerm, supportedLanguages]);

  const handleSelectLanguage = async (code) => {
    await changeLanguage(code);
    setIsVisible(false);
  };

  const renderLanguageItem = ({ item }) => {
    const isSelected = item.code === language;

    return (
      <TouchableOpacity
        onPress={() => handleSelectLanguage(item.code)}
        className={`flex-row justify-between items-center px-4 py-3 rounded-xl mb-2 ${
          isDarkMode ? "bg-black-100" : "bg-gray-100"
        } ${isSelected ? (isDarkMode ? "border border-[#8B5CF6]" : "border border-[#8B5CF6]") : ""}`}
        activeOpacity={0.7}
      >
        <View>
          <Text className={`text-base font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
            {item.nativeName}
          </Text>
          <Text className={`text-xs mt-1 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
            {item.name}
          </Text>
        </View>
        {isSelected && (
          <Text className={`text-sm font-medium ${isDarkMode ? "text-[#8B5CF6]" : "text-[#7C3AED]"}`}>
            {t("common.currentLanguage")}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setIsVisible(true)}
        className={`px-4 py-2 rounded-lg flex-row items-center ${containerStyles || ""}`}
        style={{
          backgroundColor: isDarkMode ? "#333" : "#f0f0f0",
        }}
      >
        <Text
          style={{
            color: isDarkMode ? "#fff" : "#000",
            fontSize: 16,
            fontWeight: "600",
          }}
        >
          🌐 {currentLanguage?.nativeName || language.toUpperCase()}
        </Text>
      </TouchableOpacity>

      <Modal animationType="fade" visible={isVisible} transparent onRequestClose={() => setIsVisible(false)}>
        <Pressable
          onPress={() => setIsVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", paddingHorizontal: 24 }}
        >
          <Pressable
            style={{
              backgroundColor: isDarkMode ? "#0a0a0a" : "#ffffff",
              borderRadius: 20,
              paddingVertical: 24,
              paddingHorizontal: 16,
              maxHeight: "80%",
            }}
            onPress={(event) => event.stopPropagation()}
          >
            <Text
              className={`text-xl font-semibold mb-4 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("common.selectLanguage")}
            </Text>

            <TextInput
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder={t("common.searchLanguages")}
              placeholderTextColor={isDarkMode ? "#7B7B8B" : "#9CA3AF"}
              className={`w-full h-12 px-4 rounded-xl border ${isDarkMode ? "bg-black-100 text-white border-[#8B5CF6]" : "bg-gray-100 text-gray-900 border-gray-200"}`}
              style={{ marginBottom: 16, textAlign: isRTL ? "right" : "left" }}
            />

            <FlatList
              data={filteredLanguages}
              keyExtractor={(item) => item.code}
              renderItem={renderLanguageItem}
              showsVerticalScrollIndicator={false}
            />

            <TouchableOpacity
              onPress={() => setIsVisible(false)}
              className={`mt-4 py-3 rounded-xl ${
                isDarkMode ? "bg-[#8B5CF6]" : "bg-[#7C3AED]"
              }`}
              activeOpacity={0.7}
            >
              <Text className="text-center text-white font-semibold text-base">
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

export default LanguageSelector;


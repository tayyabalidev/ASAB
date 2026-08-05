import { useState } from "react";
import { router } from "expo-router";
import { View, TouchableOpacity, Image, TextInput } from "react-native";

import { icons } from "../constants";

/** Opens the Instagram-style live search screen. */
const SearchInput = ({ initialQuery }) => {
  const [query, setQuery] = useState(initialQuery || "");

  const openSearch = () => {
    router.push({
      pathname: "/search",
      params: query.trim() ? { q: query.trim() } : undefined,
    });
  };

  return (
    <View className="flex flex-row items-center space-x-4 w-full h-16 px-4 bg-black-100 rounded-2xl border-2 border-black-200 focus:border-secondary">
      <TextInput
        className="text-base mt-0.5 text-white flex-1 font-pregular"
        value={query}
        placeholder="Search users and videos"
        placeholderTextColor="#CDCDE0"
        onChangeText={setQuery}
        onFocus={openSearch}
        onSubmitEditing={openSearch}
        returnKeyType="search"
      />

      <TouchableOpacity onPress={openSearch}>
        <Image source={icons.search} className="w-5 h-5" resizeMode="contain" />
      </TouchableOpacity>
    </View>
  );
};

export default SearchInput;

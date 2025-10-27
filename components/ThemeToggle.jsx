import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useGlobalContext } from '../context/GlobalProvider';

const ThemeToggle = ({ containerStyles }) => {
  const { isDarkMode, setIsDarkMode } = useGlobalContext();

  return (
    <TouchableOpacity
      onPress={() => setIsDarkMode(!isDarkMode)}
      className={`px-4 py-2 rounded-lg ${containerStyles}`}
      style={{
        backgroundColor: isDarkMode ? '#333' : '#f0f0f0',
      }}
    >
      <Text
        style={{
          color: isDarkMode ? '#fff' : '#000',
          fontSize: 16,
          fontWeight: '600',
        }}
      >
        {isDarkMode ? '☀️ Light' : '🌙 Dark'}
      </Text>
    </TouchableOpacity>
  );
};

export default ThemeToggle;

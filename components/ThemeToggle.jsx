import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useGlobalContext } from '../context/GlobalProvider';

const ThemeToggle = ({ containerStyles }) => {
  const { isDarkMode, toggleTheme, theme } = useGlobalContext();
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      onPress={toggleTheme}
      className={`px-4 py-2 rounded-lg ${containerStyles || ''}`}
      style={{
        backgroundColor: isDarkMode ? theme.surface : theme.surfaceMuted,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      <Text
        style={{
          color: theme.textPrimary,
          fontSize: 16,
          fontWeight: '600',
        }}
      >
        {isDarkMode ? t('theme.switchToLight') : t('theme.switchToDark')}
      </Text>
    </TouchableOpacity>
  );
};

export default ThemeToggle;

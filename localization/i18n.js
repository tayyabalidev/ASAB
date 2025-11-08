import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import { resources, supportedLanguages } from './resources';

const fallbackLng = 'en';

const resolveInitialLanguage = () => {
  const locale = Localization.locale || fallbackLng;
  const normalized = locale.split('-')[0]?.toLowerCase();
  const available = supportedLanguages.map((lang) => lang.code);

  if (normalized && available.includes(normalized)) {
    return normalized;
  }

  const alt = locale.split('-')[0]?.toLowerCase();
  if (alt && available.includes(alt)) {
    return alt;
  }

  return fallbackLng;
};

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      compatibilityJSON: 'v3',
      resources,
      lng: resolveInitialLanguage(),
      fallbackLng,
      supportedLngs: supportedLanguages.map((lang) => lang.code),
      interpolation: {
        escapeValue: false,
      },
    })
    .catch((error) => {
      console.error('i18n initialization error:', error);
    });
}

export default i18n;
export { supportedLanguages };


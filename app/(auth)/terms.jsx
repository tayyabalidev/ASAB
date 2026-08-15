import { ScrollView, Text, View, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useGlobalContext } from '../../context/GlobalProvider';
import { TERMS_SECTIONS } from '../../lib/termsContent';

export default function TermsScreen() {
  const { theme, isRTL } = useGlobalContext();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background || '#000' }} edges={['top']}>
      <View
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.divider || 'rgba(255,255,255,0.12)',
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ padding: 4 }}
        >
          <Feather name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            marginHorizontal: 12,
            color: theme.textPrimary,
            fontSize: 18,
            fontWeight: '700',
            textAlign: isRTL ? 'right' : 'left',
          }}
        >
          Terms of Use (EULA)
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 16, lineHeight: 20 }}>
          Please read these terms before creating an account or signing in. ASAB does not tolerate
          objectionable content or abusive users.
        </Text>
        {TERMS_SECTIONS.map((section) => (
          <View key={section.title} style={{ marginBottom: 18 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>
              {section.title}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 21 }}>
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

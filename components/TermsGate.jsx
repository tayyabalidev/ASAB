import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGlobalContext } from '../context/GlobalProvider';
import { TERMS_SECTIONS } from '../lib/termsContent';
import { acceptTerms, hasAcceptedTerms } from '../lib/moderation';

export default function TermsGate() {
  const { isLogged, loading, theme } = useGlobalContext();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (loading || !isLogged) {
      setVisible(false);
      return;
    }
    const accepted = await hasAcceptedTerms();
    setVisible(!accepted);
  }, [isLogged, loading]);

  useEffect(() => {
    check();
  }, [check]);

  const onAgree = async () => {
    setBusy(true);
    try {
      await acceptTerms();
      setVisible(false);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background || '#000' }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          <Text style={{ color: theme.textPrimary, fontSize: 22, fontWeight: '800' }}>
            Terms of Use (EULA)
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 8, lineHeight: 20 }}>
            You must agree to these terms to continue. ASAB has zero tolerance for objectionable
            content and abusive users.
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
          {TERMS_SECTIONS.map((section) => (
            <View key={section.title} style={{ marginBottom: 16 }}>
              <Text style={{ color: theme.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
                {section.title}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 14, lineHeight: 20 }}>
                {section.body}
              </Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ padding: 20, paddingBottom: 28 }}>
          <TouchableOpacity
            onPress={onAgree}
            disabled={busy}
            style={{
              backgroundColor: theme.accent || '#FF9C01',
              borderRadius: 14,
              paddingVertical: 16,
              alignItems: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#111', fontSize: 16, fontWeight: '800' }}>
              {busy ? 'Saving…' : 'I Agree — Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

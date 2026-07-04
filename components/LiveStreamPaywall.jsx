import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CustomButton } from './CustomButton';
import LiveStreamPaywallActiveCheckout from './LiveStreamPaywallActiveCheckout';
import {
  calculateStreamAccessFees,
  getStreamAccessPrice,
} from '../lib/streamAccess';

const DEFAULT_FEATURES = [
  'Instant access after payment',
  'Watch for the full live session',
  'Secure payment via Stripe',
];

function resolveFeatureList(t) {
  const raw = t('paidStream.features', { returnObjects: true, defaultValue: DEFAULT_FEATURES });
  return Array.isArray(raw) ? raw : DEFAULT_FEATURES;
}

function formatMoney(currency, amount) {
  return `${currency} $${Number(amount).toFixed(2)}`;
}

export default function LiveStreamPaywall({ stream, user, onAccessGranted, onClose }) {
  const { t } = useTranslation();
  const [checkoutActive, setCheckoutActive] = useState(false);

  const price = getStreamAccessPrice(stream);
  const currency = String(stream?.currency || 'USD').toUpperCase();
  const fees = useMemo(() => calculateStreamAccessFees(price), [price]);
  const features = useMemo(() => resolveFeatureList(t), [t]);

  if (!fees) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerWrap}>
          <Text style={styles.errorTitle}>{t('paidStream.invalidPrice')}</Text>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>{t('common.close')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (checkoutActive) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.centerWrap}>
          <LiveStreamPaywallActiveCheckout
            stream={stream}
            user={user}
            fees={fees}
            currency={currency}
            onAccessGranted={onAccessGranted}
            onCancel={() => setCheckoutActive(false)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <TouchableOpacity style={styles.closeButton} onPress={onClose} accessibilityLabel="Close">
        <Feather name="x" size={24} color="#fff" />
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.lockBadge}>
          <Feather name="lock" size={28} color="#fff" />
        </View>

        <Text style={styles.title}>{t('paidStream.title')}</Text>
        <Text style={styles.subtitle}>{t('paidStream.subtitle')}</Text>

        <View style={styles.streamCard}>
          <View style={styles.thumbnailPlaceholder}>
            <Feather name="video" size={32} color="#a77df8" />
          </View>
          <View style={styles.streamInfo}>
            <Text style={styles.streamTitle} numberOfLines={2}>
              {stream?.title || t('liveGo.previewTitle')}
            </Text>
            <Text style={styles.hostName}>@{stream?.hostUsername || 'host'}</Text>
          </View>
        </View>

        <View style={styles.priceCard}>
          <Text style={styles.priceLabel}>{t('paidStream.accessPrice')}</Text>
          <Text style={styles.priceValue}>{formatMoney(currency, price)}</Text>
          <Text style={styles.feeNote}>
            {t('paidStream.feeNotePlain', {
              fee: fees.platformFee.toFixed(2),
              host: fees.hostReceives.toFixed(2),
              defaultValue: `Platform fee: $${fees.platformFee.toFixed(2)} · Host receives: $${fees.hostReceives.toFixed(2)}`,
            })}
          </Text>
        </View>

        <View style={styles.features}>
          {features.map((feature, index) => (
            <Text key={index} style={styles.featureItem}>
              ✓ {feature}
            </Text>
          ))}
        </View>

        <CustomButton
          title={t('paidStream.purchaseButtonPlain', {
            amount: price.toFixed(2),
            defaultValue: `Unlock for $${price.toFixed(2)}`,
          })}
          handlePress={() => setCheckoutActive(true)}
          containerStyles={styles.purchaseButton}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
  },
  centerWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 32,
    justifyContent: 'center',
  },
  lockBadge: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(167, 125, 248, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(167, 125, 248, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: '#bbb',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  streamCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  thumbnailPlaceholder: {
    width: 88,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  streamInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  streamTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  hostName: {
    color: '#a77df8',
    fontSize: 14,
  },
  priceCard: {
    backgroundColor: 'rgba(167, 125, 248, 0.12)',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(167, 125, 248, 0.35)',
    alignItems: 'center',
  },
  priceLabel: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 6,
  },
  priceValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 8,
  },
  feeNote: {
    color: '#999',
    fontSize: 12,
    textAlign: 'center',
  },
  features: {
    marginBottom: 24,
  },
  featureItem: {
    color: '#ddd',
    fontSize: 14,
    marginBottom: 8,
    textAlign: 'center',
  },
  purchaseButton: {
    marginTop: 4,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  secondaryButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(167, 125, 248, 0.25)',
  },
  secondaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import {
  calculateStreamAccessFees,
  getStreamAccessCurrency,
  getStreamAccessPrice,
} from '../lib/streamAccess';
import { resolveLiveStreamThumbnailUrl } from '../lib/livestream';
import CustomButton from './CustomButton';
import LiveStreamPaywallActiveCheckout from './LiveStreamPaywallActiveCheckout';

function formatMoney(amount, currency = 'USD') {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '$0.00';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: String(currency || 'USD').toUpperCase(),
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export default function LiveStreamPaywall({
  stream,
  user,
  accessInfo,
  checkingAccess = false,
  onAccessGranted,
  onClose,
  onRetryAccess,
}) {
  const { t } = useTranslation();
  const [checkoutActive, setCheckoutActive] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const price = accessInfo?.price ?? getStreamAccessPrice(stream);
  const currency = accessInfo?.currency ?? getStreamAccessCurrency(stream);
  const fees = useMemo(() => calculateStreamAccessFees(price), [price]);
  const thumbnailUri = resolveLiveStreamThumbnailUrl(stream);
  const isLoggedIn = Boolean(user?.$id);
  const serverUnreachable = accessInfo?.reason === 'server_unreachable';

  const handlePurchasePress = () => {
    if (!isLoggedIn) {
      Alert.alert(t('common.error'), t('alerts.loginRequired'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('paidStream.signIn'), onPress: () => router.push('/(auth)/sign-in') },
      ]);
      return;
    }
    setCheckoutActive(true);
  };

  const handleCheckoutSuccess = () => {
    setCheckoutActive(false);
    onAccessGranted?.();
  };

  const handleCheckoutError = (error) => {
    setCheckoutActive(false);
    Alert.alert(
      t('common.error'),
      String(error?.message || t('paidStream.purchaseFailed'))
    );
  };

  const handleRetry = async () => {
    if (!onRetryAccess) return;
    setRetrying(true);
    try {
      await onRetryAccess();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ImageBackground
        source={{ uri: thumbnailUri || stream?.hostAvatar }}
        style={styles.background}
        blurRadius={Platform.OS === 'ios' ? 18 : 12}
      >
        <View style={styles.overlay} />

        <TouchableOpacity style={styles.closeBtn} onPress={onClose} accessibilityLabel={t('common.close')}>
          <Feather name="x" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.content}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('paidStream.badge')}</Text>
          </View>

          <Text style={styles.title} numberOfLines={2}>
            {stream?.title || t('paidStream.defaultTitle')}
          </Text>
          <Text style={styles.host}>
            {t('paidStream.hostedBy', { name: stream?.hostUsername || t('paidStream.host') })}
          </Text>

          {checkingAccess || retrying ? (
            <View style={styles.checkingWrap}>
              <ActivityIndicator color="#A77DF8" size="large" />
              <Text style={styles.checkingText}>{t('paidStream.checkingAccess')}</Text>
            </View>
          ) : serverUnreachable ? (
            <View style={styles.blockedWrap}>
              <Text style={styles.blockedTitle}>{t('paidStream.serverUnreachableTitle')}</Text>
              <Text style={styles.blockedBody}>{t('paidStream.serverUnreachableBody')}</Text>
              <CustomButton
                title={t('paidStream.retry')}
                handlePress={handleRetry}
                isLoading={retrying}
                containerStyles="mt-4 w-full"
              />
            </View>
          ) : checkoutActive && isLoggedIn ? (
            <LiveStreamPaywallActiveCheckout
              streamId={stream.$id}
              buyerId={user.$id}
              onSuccess={handleCheckoutSuccess}
              onCancel={() => setCheckoutActive(false)}
              onError={handleCheckoutError}
            />
          ) : (
            <>
              <View style={styles.priceCard}>
                <Text style={styles.priceLabel}>{t('paidStream.ticketPrice')}</Text>
                <Text style={styles.priceValue}>{formatMoney(fees.amount, currency)}</Text>
                <Text style={styles.feeNote}>
                  {t('paidStream.feeNote', {
                    fee: formatMoney(fees.platformFee, currency),
                    host: formatMoney(fees.hostReceives, currency),
                  })}
                </Text>
              </View>

              <Text style={styles.disclaimer}>{t('paidStream.disclaimer')}</Text>

              <CustomButton
                title={
                  isLoggedIn ? t('paidStream.purchaseAccess') : t('paidStream.signInToPurchase')
                }
                handlePress={handlePurchasePress}
                containerStyles="mt-2 w-full"
              />
            </>
          )}
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  background: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    zIndex: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(167, 125, 248, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeText: {
    color: '#E9D5FF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 8,
  },
  host: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    marginBottom: 24,
  },
  priceCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  priceLabel: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 13,
    marginBottom: 6,
  },
  priceValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 8,
  },
  feeNote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    lineHeight: 18,
  },
  disclaimer: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
    textAlign: 'center',
  },
  checkingWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  checkingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
  },
  blockedWrap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  blockedTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  blockedBody: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});

import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useStreamAccessCheckout } from '../lib/streamAccessCheckout';

/**
 * Mounts Stripe checkout only after the user taps Purchase on the paywall.
 */
export default function LiveStreamPaywallActiveCheckout({
  streamId,
  buyerId,
  onSuccess,
  onCancel,
  onError,
}) {
  const { t } = useTranslation();
  const { purchaseAccess } = useStreamAccessCheckout();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const result = await purchaseAccess(streamId, buyerId);
        if (!cancelled) onSuccess?.(result);
      } catch (error) {
        if (cancelled) return;
        const message = String(error?.message || error || '');
        if (message === 'Payment cancelled') {
          onCancel?.();
          return;
        }
        onError?.(error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [streamId, buyerId, purchaseAccess, onSuccess, onCancel, onError]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color="#A77DF8" />
      <Text style={styles.text}>{t('paidStream.processingPayment')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  text: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    textAlign: 'center',
  },
});

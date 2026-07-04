import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { useStreamAccessCheckout } from './LiveStreamPaywallCheckout';

/**
 * Mounted only after user taps purchase — keeps useStripe off the initial paywall screen.
 */
export default function LiveStreamPaywallActiveCheckout({
  stream,
  user,
  fees,
  currency,
  onAccessGranted,
  onCancel,
}) {
  const { purchaseAccess, processing } = useStreamAccessCheckout();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      const result = await purchaseAccess({ stream, user, fees, currency });
      if (cancelled) return;
      if (result?.ok) {
        onAccessGranted?.();
      } else {
        onCancel?.();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stream, user, fees, currency, purchaseAccess, onAccessGranted, onCancel]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color="#a77df8" />
      <Text style={styles.label}>{processing ? 'Opening secure checkout…' : 'Preparing checkout…'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  label: {
    color: '#bbb',
    marginTop: 12,
    fontSize: 14,
  },
});

import React, { useState } from 'react';
import { Alert } from 'react-native';
import { useStripe } from '@stripe/stripe-react-native';
import { useTranslation } from 'react-i18next';
import { processStreamAccessPayment } from '../lib/paymentService';
import {
  createStreamPurchase,
  updateStreamPurchaseStatus,
} from '../lib/streamAccess';

/**
 * Stripe checkout — isolated so useStripe only runs when user taps purchase.
 */
export async function runStreamAccessCheckout({
  stripe,
  stream,
  user,
  fees,
  currency,
  t,
}) {
  if (!user?.$id) {
    Alert.alert(t('common.error'), t('alerts.loginRequired'));
    return { ok: false };
  }
  if (!stripe?.initPaymentSheet || !stripe?.presentPaymentSheet) {
    Alert.alert(t('common.error'), t('paidStream.stripeNotReady'));
    return { ok: false };
  }

  const purchase = await createStreamPurchase({
    streamId: stream.$id,
    buyerId: user.$id,
    hostId: stream.hostId,
    amount: fees.amount,
    platformFee: fees.platformFee,
    hostReceives: fees.hostReceives,
    status: 'pending',
    currency,
  });

  const paymentResult = await processStreamAccessPayment(
    stripe,
    fees.amount,
    user.$id,
    stream.hostId,
    stream.$id,
    currency.toLowerCase()
  );

  if (paymentResult.success) {
    await updateStreamPurchaseStatus(
      purchase.$id,
      'completed',
      paymentResult.paymentIntentId
    );
    return { ok: true };
  }

  return { ok: false };
}

export function useStreamAccessCheckout() {
  const stripe = useStripe();
  const { t } = useTranslation();
  const [processing, setProcessing] = useState(false);

  const purchaseAccess = async ({ stream, user, fees, currency }) => {
    setProcessing(true);
    try {
      return await runStreamAccessCheckout({
        stripe,
        stream,
        user,
        fees,
        currency,
        t,
      });
    } catch (error) {
      const message = error?.message || t('paidStream.purchaseError');
      if (!String(message).toLowerCase().includes('cancel')) {
        Alert.alert(t('common.error'), message);
      }
      return { ok: false };
    } finally {
      setProcessing(false);
    }
  };

  return { purchaseAccess, processing, stripeReady: Boolean(stripe?.initPaymentSheet) };
}

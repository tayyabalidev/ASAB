import { useCallback, useState } from "react";
import { useStripe } from "@stripe/stripe-react-native";
import { processStreamAccessPayment } from "../lib/paymentService";

/**
 * Stripe checkout hook for paid live stream tickets (Step 3).
 * Use inside StripeProvider — paywall UI mounts this only when user taps Purchase.
 */
export function useStreamAccessCheckout() {
  const stripe = useStripe();
  const [loading, setLoading] = useState(false);

  const purchaseAccess = useCallback(
    async (streamId, buyerId) => {
      if (!streamId || !buyerId) {
        throw new Error("Stream and buyer are required.");
      }
      setLoading(true);
      try {
        return await processStreamAccessPayment(stripe, streamId, buyerId);
      } finally {
        setLoading(false);
      }
    },
    [stripe]
  );

  return { purchaseAccess, loading, stripeReady: Boolean(stripe) };
}

/**
 * One-shot checkout without hook (e.g. tests or imperative callers with stripe instance).
 */
export async function runStreamAccessCheckout(stripe, streamId, buyerId) {
  return processStreamAccessPayment(stripe, streamId, buyerId);
}

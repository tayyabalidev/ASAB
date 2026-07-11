/**
 * Payment Service for Donations
 * Handles payment processing with Stripe React Native SDK
 */

// Get server URL from environment or use default
// For real devices, use your computer's IP address (e.g., http://192.168.1.100:3001)
// For emulator/simulator, localhost works
const PROCESSING_SERVER_URL = process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL || 'http://localhost:3001';

function connectionErrorMessage() {
  return (
    `Cannot connect to payment server.\n\n` +
    `Server URL: ${PROCESSING_SERVER_URL}\n\n` +
    `Solutions:\n` +
    `1. Make sure server is running: cd server && npm start\n` +
    `2. For real device, update .env with your computer's IP:\n` +
    `   EXPO_PUBLIC_PROCESSING_SERVER_URL=http://YOUR_IP:3001\n` +
    `3. Restart Expo after changing .env`
  );
}

function unreachableServerMessage() {
  return (
    `Payment server is not reachable at ${PROCESSING_SERVER_URL}.\n\n` +
    `Please ensure:\n` +
    `1. Server is running (cd server && npm start)\n` +
    `2. For real devices, set EXPO_PUBLIC_PROCESSING_SERVER_URL to your computer's IP (e.g., http://192.168.1.100:3001)\n` +
    `3. Both devices are on the same WiFi network`
  );
}

function wrapNetworkError(error, prefix) {
  const message = String(error?.message || error || '');
  if (message.includes('Network request failed') || message.includes('Failed to fetch')) {
    return new Error(connectionErrorMessage());
  }
  return new Error(`${prefix}: ${message}`);
}

// Helper to check if server URL is accessible
const isServerReachable = async (url) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${url}/api/health`, { 
      method: 'GET',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Create payment intent for donation
 * @param {number} amount - Donation amount in dollars
 * @param {string} donorId - ID of the donor
 * @param {string} creatorId - ID of the creator receiving donation
 * @returns {Promise<Object>} Payment intent with client secret
 */
export async function createPaymentIntent(amount, donorId, creatorId) {
  try {
    // Check if server is reachable first
    const serverReachable = await isServerReachable(PROCESSING_SERVER_URL).catch(() => false);
    
    if (!serverReachable) {
      throw new Error(
        `Payment server is not reachable at ${PROCESSING_SERVER_URL}.\n\n` +
        `Please ensure:\n` +
        `1. Server is running (cd server && npm start)\n` +
        `2. For real devices, set EXPO_PUBLIC_PROCESSING_SERVER_URL to your computer's IP (e.g., http://192.168.1.100:3001)\n` +
        `3. Both devices are on the same WiFi network`
      );
    }

    const response = await fetch(`${PROCESSING_SERVER_URL}/api/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: parseFloat(amount),
        currency: 'usd',
        donorId,
        creatorId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    
    // Provide more helpful error messages
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      throw new Error(connectionErrorMessage());
    }
    
    throw new Error(`Failed to create payment intent: ${error.message}`);
  }
}

/**
 * Confirm payment with payment method on server
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @param {string} paymentMethodId - Stripe payment method ID from client
 * @param {Object} donationData - Donation data to store
 * @returns {Promise<Object>} Payment confirmation result
 */
export async function confirmPaymentWithMethod(paymentIntentId, paymentMethodId, donationData = {}) {
  try {
    const response = await fetch(`${PROCESSING_SERVER_URL}/api/confirm-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentIntentId,
        paymentMethodId,
        donationData,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`Failed to confirm payment: ${error.message}`);
  }
}

/**
 * Process donation with Stripe SDK - collects card and processes payment
 * @param {Object} stripe - Stripe instance from useStripe hook
 * @param {number} amount - Donation amount
 * @param {string} donorId - Donor user ID
 * @param {string} creatorId - Creator user ID
 * @returns {Promise<Object>} Payment result
 */
export async function processDonationPayment(stripe, amount, donorId, creatorId) {
  try {
    // Step 1: Create payment intent on server
    const paymentIntent = await createPaymentIntent(amount, donorId, creatorId);
    
    if (!paymentIntent.clientSecret) {
      throw new Error('No client secret returned from server');
    }

    // Step 2: Initialize payment sheet with Stripe SDK
    const { error: initError } = await stripe.initPaymentSheet({
      paymentIntentClientSecret: paymentIntent.clientSecret,
      merchantDisplayName: 'ASAB',
    });

    if (initError) {
      throw new Error(`Payment initialization failed: ${initError.message}`);
    }

    // Step 3: Present payment sheet to user
    const { error: presentError, paymentIntent: confirmedIntent } = await stripe.presentPaymentSheet();

    if (presentError) {
      // User cancelled or error occurred
      if (presentError.code === 'Canceled') {
        throw new Error('Payment cancelled');
      }
      throw new Error(`Payment failed: ${presentError.message}`);
    }

    // Step 4: Payment sheet completed successfully - verify with server
    // Note: If presentPaymentSheet() returns without error, payment was successful
    // The confirmedIntent might be null/undefined, but we can verify status from server
    
    // Get payment method ID if available from confirmed intent
    const paymentMethodId = confirmedIntent?.paymentMethod || null;
    
    // Verify payment status with server (server will check actual Stripe status)
    const confirmation = await confirmPaymentWithMethod(
      paymentIntent.paymentIntentId,
      paymentMethodId,
      {
        amount,
        donorId,
        creatorId,
      }
    );

    // Server has verified the payment status
    if (confirmation.success) {
      return {
        success: true,
        paymentIntentId: paymentIntent.paymentIntentId,
        amount: confirmation.amount || amount,
      };
    } else {
      // Payment didn't succeed on server side
      throw new Error(confirmation.message || `Payment status: ${confirmation.status || 'unknown'}`);
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Legacy function for backwards compatibility - now uses Stripe SDK
 * @param {number} amount - Donation amount
 * @param {string} donorId - Donor user ID
 * @param {string} creatorId - Creator user ID
 * @returns {Promise<Object>} Payment result
 * @deprecated Use processDonationPayment with stripe instance instead
 */
export async function processDonationPaymentLegacy(amount, donorId, creatorId) {
  throw new Error('This function is deprecated. Use processDonationPayment with Stripe SDK instead.');
}

/**
 * Create payment intent for advertising subscription
 * @param {number} amount - Advertising subscription amount in dollars
 * @param {string} advertiserId - ID of the advertiser
 * @param {string} subscriptionPlan - Plan type ('daily', 'weekly', 'monthly')
 * @returns {Promise<Object>} Payment intent with client secret
 */
export async function createAdvertisingPaymentIntent(amount, advertiserId, subscriptionPlan) {
  try {
    const serverReachable = await isServerReachable(PROCESSING_SERVER_URL).catch(() => false);
    
    if (!serverReachable) {
      throw new Error(
        `Payment server is not reachable at ${PROCESSING_SERVER_URL}.\n\n` +
        `Please ensure:\n` +
        `1. Server is running (cd server && npm start)\n` +
        `2. For real devices, set EXPO_PUBLIC_PROCESSING_SERVER_URL to your computer's IP (e.g., http://192.168.1.100:3001)\n` +
        `3. Both devices are on the same WiFi network`
      );
    }

    const response = await fetch(`${PROCESSING_SERVER_URL}/api/create-advertising-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: parseFloat(amount),
        currency: 'usd',
        advertiserId,
        subscriptionPlan,
        type: 'advertising',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    
    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      throw new Error(connectionErrorMessage());
    }
    
    throw new Error(`Failed to create advertising payment intent: ${error.message}`);
  }
}

/**
 * Process advertising subscription payment with Stripe SDK
 * @param {Object} stripe - Stripe instance from useStripe hook
 * @param {number} amount - Advertising subscription amount
 * @param {string} advertiserId - Advertiser user ID
 * @param {string} subscriptionPlan - Plan type ('daily', 'weekly', 'monthly')
 * @returns {Promise<Object>} Payment result
 */
export async function processAdvertisingPayment(stripe, amount, advertiserId, subscriptionPlan) {
  try {
    // Step 1: Create payment intent on server
    const paymentIntent = await createAdvertisingPaymentIntent(amount, advertiserId, subscriptionPlan);
    
    if (!paymentIntent.clientSecret) {
      throw new Error('No client secret returned from server');
    }

    // Step 2: Initialize payment sheet with Stripe SDK
    const { error: initError } = await stripe.initPaymentSheet({
      paymentIntentClientSecret: paymentIntent.clientSecret,
      merchantDisplayName: 'ASAB Advertising',
    });

    if (initError) {
      throw new Error(`Payment initialization failed: ${initError.message}`);
    }

    // Step 3: Present payment sheet to user
    const { error: presentError, paymentIntent: confirmedIntent } = await stripe.presentPaymentSheet();

    if (presentError) {
      if (presentError.code === 'Canceled') {
        throw new Error('Payment cancelled');
      }
      throw new Error(`Payment failed: ${presentError.message}`);
    }

    // Step 4: Verify payment status with server
    const paymentMethodId = confirmedIntent?.paymentMethod || null;
    
    const confirmation = await confirmPaymentWithMethod(
      paymentIntent.paymentIntentId,
      paymentMethodId,
      {
        amount,
        advertiserId,
        subscriptionPlan,
        type: 'advertising',
      }
    );

    if (confirmation.success) {
      return {
        success: true,
        paymentIntentId: paymentIntent.paymentIntentId,
        amount: confirmation.amount || amount,
      };
    } else {
      throw new Error(confirmation.message || `Payment status: ${confirmation.status || 'unknown'}`);
    }
  } catch (error) {
    throw error;
  }
}

// ==================== PAID LIVE STREAM ACCESS ====================

/**
 * Server-side entitlement check (source of truth for paid streams).
 * @param {string} streamId
 * @param {string} userId
 * @returns {Promise<{ allowed: boolean, reason?: string, isPaid?: boolean, price?: number, currency?: string, purchaseId?: string, isHost?: boolean }>}
 */
export async function verifyStreamAccessOnServer(streamId, userId) {
  const sid = String(streamId || '').trim();
  const uid = String(userId || '').trim();
  if (!sid || !uid) {
    return { allowed: false, reason: 'missing_params' };
  }

  try {
    const serverReachable = await isServerReachable(PROCESSING_SERVER_URL).catch(() => false);
    if (!serverReachable) {
      return { allowed: false, reason: 'server_unreachable' };
    }

    const params = new URLSearchParams({ streamId: sid, userId: uid });
    const response = await fetch(
      `${PROCESSING_SERVER_URL}/api/check-stream-access?${params.toString()}`,
      { method: 'GET' }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        allowed: false,
        reason: data?.reason || 'server_error',
        message: data?.error || data?.message || `HTTP ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    return {
      allowed: false,
      reason: 'server_error',
      message: error?.message || String(error),
    };
  }
}

/**
 * Create Stripe PaymentIntent for a paid live stream ticket.
 * @param {string} streamId
 * @param {string} buyerId
 */
export async function createStreamAccessPaymentIntent(streamId, buyerId) {
  try {
    const serverReachable = await isServerReachable(PROCESSING_SERVER_URL).catch(() => false);
    if (!serverReachable) {
      throw new Error(unreachableServerMessage());
    }

    const response = await fetch(
      `${PROCESSING_SERVER_URL}/api/create-stream-access-payment-intent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          streamId: String(streamId || '').trim(),
          buyerId: String(buyerId || '').trim(),
        }),
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    throw wrapNetworkError(error, 'Failed to create stream access payment intent');
  }
}

/**
 * Confirm stream ticket payment after Stripe Payment Sheet completes.
 * @param {string} paymentIntentId
 * @param {string} [purchaseId]
 */
export async function confirmStreamAccessPayment(paymentIntentId, purchaseId = null) {
  try {
    const response = await fetch(`${PROCESSING_SERVER_URL}/api/confirm-stream-access-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paymentIntentId,
        purchaseId: purchaseId || undefined,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    throw wrapNetworkError(error, 'Failed to confirm stream access payment');
  }
}

/**
 * Purchase paid live stream access via Stripe Payment Sheet.
 * @param {Object} stripe - Stripe instance from useStripe hook
 * @param {string} streamId
 * @param {string} buyerId
 * @returns {Promise<Object>} Payment result
 */
export async function processStreamAccessPayment(stripe, streamId, buyerId) {
  if (!stripe?.initPaymentSheet || !stripe?.presentPaymentSheet) {
    throw new Error(
      'Stripe SDK methods not available. Make sure StripeProvider is configured with a valid publishable key.'
    );
  }

  const sid = String(streamId || '').trim();
  const bid = String(buyerId || '').trim();
  if (!sid || !bid) {
    throw new Error('Stream and buyer are required to purchase access.');
  }

  const paymentIntent = await createStreamAccessPaymentIntent(sid, bid);

  if (paymentIntent.alreadyPurchased) {
    return {
      success: true,
      alreadyPurchased: true,
      purchaseId: paymentIntent.purchaseId,
      streamId: sid,
      buyerId: bid,
    };
  }

  if (!paymentIntent.clientSecret) {
    throw new Error('No client secret returned from server');
  }

  const { error: initError } = await stripe.initPaymentSheet({
    paymentIntentClientSecret: paymentIntent.clientSecret,
    merchantDisplayName: 'ASAB Live',
  });

  if (initError) {
    throw new Error(`Payment initialization failed: ${initError.message}`);
  }

  const { error: presentError } = await stripe.presentPaymentSheet();

  if (presentError) {
    if (presentError.code === 'Canceled') {
      throw new Error('Payment cancelled');
    }
    throw new Error(`Payment failed: ${presentError.message}`);
  }

  const confirmation = await confirmStreamAccessPayment(
    paymentIntent.paymentIntentId,
    paymentIntent.purchaseId
  );

  if (!confirmation.success) {
    throw new Error(confirmation.message || `Payment status: ${confirmation.status || 'unknown'}`);
  }

  return {
    success: true,
    paymentIntentId: paymentIntent.paymentIntentId,
    purchaseId: confirmation.purchaseId || paymentIntent.purchaseId,
    streamId: confirmation.streamId || sid,
    buyerId: confirmation.buyerId || bid,
    amount: confirmation.amount ?? paymentIntent.amount,
    platformFee: paymentIntent.platformFee,
    hostReceives: paymentIntent.hostReceives,
    currency: paymentIntent.currency,
  };
}

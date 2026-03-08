/**
 * Payment Service for Donations
 * Handles payment processing with Stripe React Native SDK
 */

// Get server URL from environment or use default
// For real devices, use your computer's IP address (e.g., http://192.168.1.100:3001)
// For emulator/simulator, localhost works
const PROCESSING_SERVER_URL = process.env.EXPO_PUBLIC_PROCESSING_SERVER_URL || 'http://localhost:3001';

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
      throw new Error(
        `Cannot connect to payment server.\n\n` +
        `Server URL: ${PROCESSING_SERVER_URL}\n\n` +
        `Solutions:\n` +
        `1. Make sure server is running: cd server && npm start\n` +
        `2. For real device, update .env with your computer's IP:\n` +
        `   EXPO_PUBLIC_PROCESSING_SERVER_URL=http://YOUR_IP:3001\n` +
        `3. Restart Expo after changing .env`
      );
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
      throw new Error(
        `Cannot connect to payment server.\n\n` +
        `Server URL: ${PROCESSING_SERVER_URL}\n\n` +
        `Solutions:\n` +
        `1. Make sure server is running: cd server && npm start\n` +
        `2. For real device, update .env with your computer's IP:\n` +
        `   EXPO_PUBLIC_PROCESSING_SERVER_URL=http://YOUR_IP:3001\n` +
        `3. Restart Expo after changing .env`
      );
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
import React, { useState, useMemo, useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, TouchableOpacity, TextInput, Alert, ScrollView, Image } from "react-native";
import { useTranslation } from "react-i18next";
import { icons } from "../../constants";
import { useGlobalContext } from "../../context/GlobalProvider";
import { useStripe } from "@stripe/stripe-react-native";
import { processDonationPayment } from "../../lib/paymentService";
import { 
  createDonation, 
  updateDonationStatus, 
  getRecentDonations,
  getCreatorTotalDonations 
} from "../../lib/appwrite";

const DonationPage = () => {
  const { user, isRTL } = useGlobalContext();
  const { t } = useTranslation();
  const stripe = useStripe();
  const params = useLocalSearchParams();
  const creatorId = params.creatorId || user?.$id; // Use creatorId from params, or default to current user
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [donationMessage, setDonationMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [creatorData, setCreatorData] = useState(null);
  const [totalRaised, setTotalRaised] = useState(0);
  const [recentDonations, setRecentDonations] = useState([]);

  const presetAmounts = useMemo(
    () => [
      {
        amount: 1,
        label: t("donation.preset.1.label"),
        description: t("donation.preset.1.description"),
      },
      {
        amount: 5,
        label: t("donation.preset.5.label"),
        description: t("donation.preset.5.description"),
      },
      {
        amount: 10,
        label: t("donation.preset.10.label"),
        description: t("donation.preset.10.description"),
      },
    ],
    [t]
  );

  // Load creator data and donation stats
  useEffect(() => {
    const loadCreatorData = async () => {
      try {
        // Load total raised
        const total = await getCreatorTotalDonations(creatorId);
        setTotalRaised(total);

        // Load recent donations
        const recent = await getRecentDonations(creatorId, 5);
        setRecentDonations(recent);

        // For now, use current user as creator data
        // In production, fetch creator data by creatorId
        setCreatorData(user);
      } catch (error) {
      }
    };

    if (creatorId) {
      loadCreatorData();
    }
  }, [creatorId, user]);

  const handleAmountSelect = (amount) => {
    if (selectedAmount === amount) {
      setSelectedAmount(null);
    } else {
      setSelectedAmount(amount);
      setShowCustomInput(false);
      setCustomAmount("");
    }
  };

  const handleCustomAmount = () => {
    if (showCustomInput) {
      setShowCustomInput(false);
      setCustomAmount("");
    } else {
      setShowCustomInput(true);
      setSelectedAmount(null);
    }
  };

  const resetForm = () => {
    setSelectedAmount(null);
    setCustomAmount("");
    setShowCustomInput(false);
    setDonationMessage("");
    setIsProcessing(false);
  };

  const handleDonate = async () => {
    if (!selectedAmount && !customAmount) {
      Alert.alert(t("common.error"), t("donation.errors.selectAmount"));
      return;
    }

    if (!user || !user.$id) {
      Alert.alert(t("common.error"), "Please sign in to make a donation");
      return;
    }

    const finalAmount = selectedAmount || parseFloat(customAmount);
    
    if (isNaN(finalAmount) || finalAmount <= 0) {
      Alert.alert(t("common.error"), t("donation.errors.invalidAmount"));
      return;
    }

    setIsProcessing(true);

    try {
      const platformFee = finalAmount * 0.10;
      const creatorReceives = finalAmount - platformFee;

      // Create donation record first (with pending status)
      const donation = await createDonation({
        donorId: user.$id,
        creatorId: creatorId,
        amount: finalAmount,
        platformFee: platformFee,
        creatorReceives: creatorReceives,
        message: donationMessage,
        status: "pending"
      });

      // Process payment with Stripe SDK
      if (!stripe) {
        throw new Error("Stripe is not initialized. Please check your Stripe publishable key configuration in .env file and restart Expo.");
      }

      // Check if Stripe is properly initialized
      if (!stripe.initPaymentSheet || !stripe.presentPaymentSheet) {
        throw new Error("Stripe SDK methods not available. Make sure StripeProvider is properly configured with a valid publishable key.");
      }

      const paymentResult = await processDonationPayment(
        stripe,
        finalAmount,
        user.$id,
        creatorId
      );

      if (paymentResult.success) {
        // Update donation status to completed
        await updateDonationStatus(donation.$id, "completed", paymentResult.paymentIntentId);

        // Refresh donation stats
        const total = await getCreatorTotalDonations(creatorId);
        setTotalRaised(total);
        const recent = await getRecentDonations(creatorId, 5);
        setRecentDonations(recent);

        Alert.alert(
          t("donation.successTitle"),
          t("donation.successMessage", {
            amount: finalAmount.toFixed(2),
            creator: creatorReceives.toFixed(2),
          }),
          [
            {
              text: t("donation.shareButton"),
              onPress: () => {
                Alert.alert(t("donation.shareThanksTitle"), t("donation.shareThanksMessage"));
                resetForm();
              }
            },
            {
              text: t("donation.doneButton"),
              onPress: () => {
                resetForm();
                router.replace('/home');
              }
            }
          ]
        );
      } else {
        // Payment failed
        await updateDonationStatus(donation.$id, "failed");
        Alert.alert(t("common.error"), "Payment failed. Please try again.");
      }
    } catch (error) {
      Alert.alert(
        t("common.error"), 
        error.message || t("donation.errors.processFailed")
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const getSelectedAmountValue = () => {
    return selectedAmount || (customAmount ? parseFloat(customAmount) : 0);
  };

  // Helper function to get time ago
  const getTimeAgo = (date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return "just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return `${Math.floor(diffInSeconds / 604800)} weeks ago`;
  };

  return (
    <SafeAreaView className="bg-primary h-full">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-6">
        <TouchableOpacity onPress={() => router.replace('/home')}>
          <Image
            source={icons.leftArrow}
            resizeMode="contain"
            className="w-6 h-6"
          />
        </TouchableOpacity>
        <Text className="text-white text-lg font-bold" style={{ textAlign: isRTL ? "right" : "center" }}>
          {t("donation.headerTitle")}
        </Text>
        <View className="w-6" />
      </View>

      <ScrollView className="flex-1 px-4">
        {/* Creator Info */}
        <View className="items-center mb-8">
          <View className="w-20 h-20 bg-green-400 border-2 border-white rounded-full items-center justify-center mb-4">
            {user?.avatar ? (
              <Image
                source={{ uri: user.avatar }}
                className="w-full h-full rounded-full"
                resizeMode="cover"
              />
            ) : (
              <Text className="text-black text-xl font-bold">
                {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
              </Text>
            )}
          </View>
          <Text className="text-white text-xl font-bold mb-1">
            {user?.username || "Creator"}
          </Text>
          <Text className="text-gray-400 text-center mb-4" style={{ textAlign: isRTL ? "right" : "center" }}>
            {t("donation.supportMessage")}
          </Text>
          
          {/* Progress Bar */}
          <View className="w-full bg-gray-700 rounded-full h-2 mb-2">
            <View 
              className="bg-green-400 h-2 rounded-full" 
              style={{ width: `${Math.min((totalRaised / 2000) * 100, 100)}%` }} 
            />
          </View>
          <Text className="text-gray-400 text-sm" style={{ textAlign: isRTL ? "right" : "center" }}>
            {t("donation.progressLabel", { 
              raised: totalRaised.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 
              goal: "2,000" 
            })}
          </Text>
        </View>

        {/* Donation Amounts */}
        <View className="mb-8">
          <Text className="text-white text-lg font-semibold mb-4" style={{ textAlign: isRTL ? "right" : "left" }}>
            {t("donation.chooseAmount")}
          </Text>
          
          {/* Preset Amounts */}
          <View className="space-y-3 mb-4">
            {presetAmounts.map((preset, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleAmountSelect(preset.amount)}
                className={`p-4 rounded-xl border-2 ${
                  selectedAmount === preset.amount 
                    ? 'border-green-400 bg-green-400 bg-opacity-20' 
                    : 'border-gray-600 bg-gray-800'
                }`}
              >
                <View className="flex-row items-center justify-between">
                  <View>
                    <Text className={`text-lg font-bold ${
                      selectedAmount === preset.amount ? 'text-white' : 'text-white'
                    }`}>
                      {preset.label}
                    </Text>
                    <Text className={`text-sm ${
                      selectedAmount === preset.amount ? 'text-white font-medium' : 'text-gray-400'
                  }`} style={{ textAlign: isRTL ? "right" : "left" }}>
                      {preset.description}
                    </Text>
                  </View>
                  <View className={`w-6 h-6 rounded-full border-2 ${
                    selectedAmount === preset.amount 
                      ? 'border-green-400 bg-green-400' 
                      : 'border-gray-400'
                  }`}>
                    {selectedAmount === preset.amount && (
                      <View className="w-full h-full rounded-full bg-green-400 items-center justify-center">
                        <Text className="text-white text-xs font-bold">✓</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Amount */}
          <TouchableOpacity
            onPress={handleCustomAmount}
            className={`p-4 rounded-xl border-2 ${
              showCustomInput 
                ? 'border-green-400 bg-green-400 bg-opacity-20' 
                : 'border-gray-600 bg-gray-800'
            }`}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text className={`text-lg font-bold ${
                  showCustomInput ? 'text-white' : 'text-white'
                }`} style={{ textAlign: isRTL ? "right" : "left" }}>
                  {t("donation.customTitle")}
                </Text>
                <Text className={`text-sm ${
                  showCustomInput ? 'text-white font-medium' : 'text-gray-400'
                }`} style={{ textAlign: isRTL ? "right" : "left" }}>
                  {t("donation.customSubtitle")}
                </Text>
              </View>
              <View className={`w-6 h-6 rounded-full border-2 ${
                showCustomInput 
                  ? 'border-green-400 bg-green-400' 
                  : 'border-gray-400'
              }`}>
                {showCustomInput && (
                  <View className="w-full h-full rounded-full bg-green-400 items-center justify-center">
                    <Text className="text-white text-xs font-bold">✓</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>

          {/* Custom Amount Input */}
          {showCustomInput && (
            <View className="mt-4 p-4 bg-gray-800 rounded-xl">
              <Text className="text-white text-sm mb-2" style={{ textAlign: isRTL ? "right" : "left" }}>
                {t("donation.customLabel")}
              </Text>
              <TextInput
                value={customAmount}
                onChangeText={setCustomAmount}
                placeholder="0.00"
                placeholderTextColor="#666"
                keyboardType="numeric"
                className="bg-gray-700 text-white p-3 rounded-lg text-lg font-semibold"
                style={{ textAlign: isRTL ? "right" : "left" }}
              />
            </View>
          )}
        </View>

        {/* Optional Message */}
        <View className="mb-8">
          <Text className="text-white text-lg font-semibold mb-4" style={{ textAlign: isRTL ? "right" : "left" }}>
            {t("donation.messageTitle")}
          </Text>
          <TextInput
            value={donationMessage}
            onChangeText={setDonationMessage}
            placeholder={t("donation.messagePlaceholder")}
            placeholderTextColor="#666"
            multiline
            numberOfLines={3}
            className="bg-gray-800 text-white p-4 rounded-xl text-base"
            style={{ textAlignVertical: 'top', textAlign: isRTL ? "right" : "left" }}
          />
        </View>

        {/* Donation Summary */}
        {getSelectedAmountValue() > 0 && (() => {
          const donationAmount = getSelectedAmountValue();
          const platformFee = donationAmount * 0.10; // 10% fee
          const creatorReceives = donationAmount - platformFee;
          const totalCharged = donationAmount;
          
          return (
            <View className="mb-8 p-4 bg-gray-800 rounded-xl">
              <Text className="text-white text-lg font-semibold mb-2" style={{ textAlign: isRTL ? "right" : "left" }}>
                {t("donation.summaryTitle")}
              </Text>
              <View className="flex-row justify-between items-center">
                <Text className="text-gray-400">{t("donation.summaryDonation")}</Text>
                <Text className="text-white text-xl font-bold">
                  ${donationAmount.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between items-center mt-2">
                <Text className="text-gray-400">{t("donation.summaryFee")}</Text>
                <Text className="text-orange-400">
                  -${platformFee.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between items-center mt-1">
                <Text className="text-gray-400 text-sm">{t("donation.summaryCreator")}</Text>
                <Text className="text-green-400 font-semibold">
                  ${creatorReceives.toFixed(2)}
                </Text>
              </View>
              <View className="border-t border-gray-600 mt-3 pt-3">
                <View className="flex-row justify-between items-center">
                  <Text className="text-white text-lg font-bold">
                    {t("donation.summaryTotal")}
                  </Text>
                  <Text className="text-green-400 text-xl font-bold">
                    ${totalCharged.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* Donate Button */}
        <TouchableOpacity
          onPress={handleDonate}
          disabled={!getSelectedAmountValue() || isProcessing}
          className={`p-4 rounded-xl mb-8 ${
            getSelectedAmountValue() && !isProcessing
              ? 'bg-green-500' 
              : 'bg-gray-600'
          }`}
        >
          <Text className="text-white text-center text-lg font-bold">
            {isProcessing
              ? t("donation.processing")
              : getSelectedAmountValue()
                ? t("donation.donateButton", {
                    amount: getSelectedAmountValue().toFixed(2),
                  })
                : t("donation.donateDisabled")}
          </Text>
        </TouchableOpacity>

        {/* Recent Donations */}
        <View className="mb-8">
          <Text className="text-white text-lg font-semibold mb-4" style={{ textAlign: isRTL ? "right" : "left" }}>
            {t("donation.supportersTitle")}
          </Text>
          <View className="space-y-2">
            {recentDonations.length > 0 ? (
              recentDonations.map((donation, index) => {
                const donationDate = new Date(donation.$createdAt);
                const timeAgo = getTimeAgo(donationDate);
                
                return (
                  <View key={donation.$id || index} className="flex-row items-center justify-between bg-gray-800 p-3 rounded-lg">
                    <View className="flex-row items-center">
                      <View className="w-8 h-8 bg-green-400 rounded-full items-center justify-center mr-3">
                        {donation.donorAvatar ? (
                          <Image
                            source={{ uri: donation.donorAvatar }}
                            className="w-full h-full rounded-full"
                            resizeMode="cover"
                          />
                        ) : (
                          <Text className="text-black text-xs font-bold">
                            {donation.donorName?.charAt(0) || 'A'}
                          </Text>
                        )}
                      </View>
                      <Text className="text-white font-medium">
                        {donation.donorName || "Anonymous"}
                      </Text>
                    </View>
                    <View className="items-end">
                      <Text className="text-green-400 font-bold">
                        ${parseFloat(donation.amount).toFixed(2)}
                      </Text>
                      <Text className="text-gray-400 text-xs">{timeAgo}</Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <View className="bg-gray-800 p-6 rounded-lg items-center justify-center">
                <Text className="text-gray-400 text-center" style={{ textAlign: isRTL ? "right" : "center" }}>
                  {t("donation.noSupportersYet") || "No supporters yet. Be the first to support this creator!"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Trust Indicators */}
        <View className="mb-8">
          <Text className="text-gray-400 text-sm text-center mb-4" style={{ textAlign: isRTL ? "right" : "center" }}>
            {t("donation.trustIndicators")}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default DonationPage;

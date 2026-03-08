import React, { useCallback, useMemo, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, TouchableOpacity, ScrollView, RefreshControl, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { useGlobalContext } from "../../context/GlobalProvider";
import { isAdminUser } from "../../lib/admin";
import {
  getAllDonations,
  getAllPayouts,
  getTotalPlatformFees,
  getPendingPayoutAmount,
  updatePayoutStatus,
  processPayout,
  databases,
  appwriteConfig,
} from "../../lib/appwrite";

const money = (n) => {
  const num = Number(n || 0);
  return `$${num.toFixed(2)}`;
};

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString();
};

const AdminDashboard = () => {
  const { user, theme, isDarkMode } = useGlobalContext();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const [totalFees, setTotalFees] = useState(0);
  const [totalDonationVolume, setTotalDonationVolume] = useState(0);
  const [donations, setDonations] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [pendingByCreator, setPendingByCreator] = useState([]);
  const [userMap, setUserMap] = useState({});

  const gradientColors = useMemo(
    () => (isDarkMode ? ["#0f172a", "#020617", "#000000"] : ["#FFFFFF", "#F5F3FF", theme.background]),
    [isDarkMode, theme.background]
  );

  const canAccess = useMemo(() => isAdminUser(user), [user]);

  const loadUsers = useCallback(async (ids) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (!unique.length) return;

    const next = {};
    for (const id of unique) {
      try {
        const doc = await databases.getDocument(appwriteConfig.databaseId, appwriteConfig.userCollectionId, id);
        next[id] = {
          name: doc.username || doc.email || id,
          email: doc.email || "",
        };
      } catch (e) {
        next[id] = { name: id, email: "" };
      }
    }
    setUserMap((prev) => ({ ...prev, ...next }));
  }, []);

  const load = useCallback(async () => {
    if (!canAccess) return;
    try {
      setLoading(true);
      const [fees, allDonations, allPayouts] = await Promise.all([
        getTotalPlatformFees(),
        getAllDonations(50),
        getAllPayouts(50),
      ]);

      setTotalFees(fees || 0);
      setTotalDonationVolume((allDonations || []).reduce((sum, d) => sum + Number(d.amount || 0), 0));
      setDonations(allDonations || []);
      setPayouts(allPayouts || []);

      // Compute pending payout by creator for creators we’ve seen recently
      const creatorIds = Array.from(
        new Set((allDonations || []).map((d) => d.creatorId).filter(Boolean))
      ).slice(0, 20); // cap to avoid excessive queries

      const pending = await Promise.all(
        creatorIds.map(async (creatorId) => {
          const amount = await getPendingPayoutAmount(creatorId);
          return { creatorId, amount };
        })
      );
      setPendingByCreator(pending.sort((a, b) => (b.amount || 0) - (a.amount || 0)));

      const idsNeeded = [
        ...(allDonations || []).map((d) => d.donorId),
        ...(allDonations || []).map((d) => d.creatorId),
        ...(allPayouts || []).map((p) => p.creatorId),
        ...creatorIds,
      ];
      await loadUsers(idsNeeded);
    } catch (e) {
      Alert.alert("Error", e.message || "Failed to load admin dashboard");
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (!canAccess) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.textPrimary, fontSize: 20, fontFamily: "Poppins-SemiBold" }}>
            Admin Dashboard
          </Text>
          <Text style={{ color: theme.textSecondary, marginTop: 10 }}>
            Access denied.
          </Text>
          <Text style={{ color: theme.textSecondary, marginTop: 6 }}>
            Configure admins via `EXPO_PUBLIC_ADMIN_EMAILS`.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              marginTop: 16,
              backgroundColor: theme.accent,
              paddingVertical: 10,
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontFamily: "Poppins-Medium" }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      <LinearGradient colors={gradientColors} style={{ flex: 1 }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 16,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: theme.textPrimary, fontSize: 16 }}>Back</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.textPrimary, fontSize: 18, fontFamily: "Poppins-SemiBold" }}>
            Admin Dashboard
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textPrimary} />}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        >
          <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <Text style={{ color: theme.textSecondary, marginBottom: 6 }}>Total ASAB platform fees (10%)</Text>
            <Text style={{ color: theme.textPrimary, fontSize: 28, fontFamily: "Poppins-SemiBold" }}>
              {money(totalFees)}
            </Text>
            <Text style={{ color: theme.textSecondary, marginTop: 6 }}>
              Based on completed donations.
            </Text>
            <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.textSecondary }}>Total donation volume</Text>
              <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-Medium" }}>{money(totalDonationVolume)}</Text>
            </View>
            <View style={{ marginTop: 6, flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.textSecondary }}>Donation count</Text>
              <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-Medium" }}>{donations.length}</Text>
            </View>
          </View>

          <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontFamily: "Poppins-SemiBold", marginBottom: 10 }}>
              Pending payouts (top creators)
            </Text>
            {pendingByCreator.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>{loading ? "Loading..." : "No data yet."}</Text>
            ) : (
              pendingByCreator.map((row) => (
                <View
                  key={row.creatorId}
                  style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}
                >
                  <Text style={{ color: theme.textSecondary }} numberOfLines={1}>
                    {userMap[row.creatorId]?.name || row.creatorId}
                  </Text>
                  <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-Medium" }}>{money(row.amount)}</Text>
                </View>
              ))
            )}
          </View>

          <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontFamily: "Poppins-SemiBold", marginBottom: 10 }}>
              Recent donations
            </Text>
            {donations.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>{loading ? "Loading..." : "No donations found."}</Text>
            ) : (
              donations.slice(0, 15).map((d) => (
                <View key={d.$id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-Medium" }}>
                    {money(d.amount)} • Fee {money(d.platformFee)} • Creator {money(d.creatorReceives)}
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 4 }} numberOfLines={2}>
                    donor: {userMap[d.donorId]?.name || d.donorId}
                    {"  •  "}
                    creator: {userMap[d.creatorId]?.name || d.creatorId}
                    {"  •  "}
                    status: {d.status}
                  </Text>
                  {d.donationDate && (
                    <Text style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                      {fmtDate(d.donationDate)}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>

          <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16, marginBottom: 14 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontFamily: "Poppins-SemiBold", marginBottom: 10 }}>
              Pending Payout Requests
            </Text>
            {payouts.filter(p => p.status === 'Pending' || p.status === 'pending').length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>{loading ? "Loading..." : "No pending payouts."}</Text>
            ) : (
              payouts
                .filter(p => p.status === 'Pending' || p.status === 'pending')
                .slice(0, 10)
                .map((p) => (
                  <View key={p.$id} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-SemiBold", fontSize: 16 }}>
                          {money(p.amount)}
                        </Text>
                        <Text style={{ color: theme.textSecondary, marginTop: 4, fontSize: 13 }}>
                          Creator: {userMap[p.creatorId]?.name || p.creatorId}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                          Method: {p.payoutMethod || 'bankTransfer'}
                        </Text>
                        {p.createdAt && (
                          <Text style={{ color: theme.textSecondary, marginTop: 2, fontSize: 12 }}>
                            Requested: {fmtDate(p.createdAt)}
                          </Text>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          onPress={async () => {
                            Alert.alert(
                              "Approve & Process Payout",
                              `Approve and process payout of ${money(p.amount)} to ${userMap[p.creatorId]?.name || p.creatorId}?\n\nThis will automatically send the payment via Stripe.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Approve & Pay",
                                  onPress: async () => {
                                    try {
                                      // First, try to process the payout via Stripe
                                      let transactionId = null;
                                      let requiresManualProcessing = false;
                                      
                                      try {
                                        // Get creator's Stripe account ID if available
                                        let creatorStripeAccountId = null;
                                        try {
                                          const creatorDoc = await databases.getDocument(
                                            appwriteConfig.databaseId,
                                            appwriteConfig.userCollectionId,
                                            p.creatorId
                                          );
                                          creatorStripeAccountId = creatorDoc.stripeAccountId || null;
                                          
                                          // If account exists, verify it's ready for transfers
                                          if (creatorStripeAccountId) {
                                            try {
                                              const { getStripeAccountStatus } = await import("../../lib/appwrite");
                                              const status = await getStripeAccountStatus(creatorStripeAccountId);
                                              if (!status.transfersEnabled) {
                                                creatorStripeAccountId = null; // Account not ready
                                              }
                                            } catch (statusError) {
                                            }
                                          }
                                        } catch (e) {
                                        }

                                        // Process payout via Stripe
                                        const payoutResult = await processPayout(
                                          p.$id,
                                          p.creatorId,
                                          p.amount,
                                          p.currency || 'USD',
                                          creatorStripeAccountId
                                        );
                                        
                                        if (payoutResult.success && payoutResult.transferId) {
                                          transactionId = payoutResult.transferId;
                                        }
                                      } catch (payoutError) {
                                        // Check if it requires manual processing
                                        if (payoutError.message?.includes('bank account not linked') || 
                                            payoutError.message?.includes('requiresManualProcessing')) {
                                          requiresManualProcessing = true;
                                        } else {
                                          // Other error - ask admin what to do
                                          Alert.alert(
                                            "Stripe Processing Failed",
                                            `Automatic payment failed: ${payoutError.message}\n\nWould you like to approve manually?`,
                                            [
                                              { text: "Cancel", style: "cancel" },
                                              {
                                                text: "Approve Manually",
                                                onPress: async () => {
                                                  try {
                                                    await updatePayoutStatus(p.$id, "Completed");
                                                    Alert.alert("Success", "Payout approved. Please process payment manually.");
                                                    await load();
                                                  } catch (error) {
                                                    Alert.alert("Error", error.message || "Failed to approve payout");
                                                  }
                                                }
                                              }
                                            ]
                                          );
                                          return;
                                        }
                                      }

                                      // Update status to Completed with transaction ID
                                      await updatePayoutStatus(p.$id, "Completed", transactionId);
                                      
                                      if (requiresManualProcessing) {
                                        Alert.alert(
                                          "Approved - Manual Processing Required",
                                          "Payout approved but requires manual processing.\n\nCreator needs to link their payment method. Please process payment manually via Stripe Dashboard."
                                        );
                                      } else {
                                        Alert.alert(
                                          "Success", 
                                          `Payout processed successfully!\n\nTransaction ID: ${transactionId || 'N/A'}\nAmount: ${money(p.amount)}`
                                        );
                                      }
                                      
                                      // Refresh data
                                      await load();
                                    } catch (error) {
                                      Alert.alert("Error", error.message || "Failed to approve payout");
                                    }
                                  }
                                }
                              ]
                            );
                          }}
                          style={{
                            backgroundColor: '#32CD32',
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Approve & Pay</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={async () => {
                            Alert.alert(
                              "Reject Payout",
                              `Reject payout of ${money(p.amount)}?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Reject",
                                  style: "destructive",
                                  onPress: async () => {
                                    try {
                                      // Update status to Failed
                                      await updatePayoutStatus(p.$id, "Failed");
                                      Alert.alert("Success", "Payout rejected.");
                                      // Refresh data
                                      await load();
                                    } catch (error) {
                                      Alert.alert("Error", error.message || "Failed to reject payout");
                                    }
                                  }
                                }
                              ]
                            );
                          }}
                          style={{
                            backgroundColor: '#FF4444',
                            paddingHorizontal: 16,
                            paddingVertical: 8,
                            borderRadius: 8,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Reject</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
            )}
          </View>

          <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontFamily: "Poppins-SemiBold", marginBottom: 10 }}>
              All Payouts History
            </Text>
            {payouts.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>{loading ? "Loading..." : "No payouts found."}</Text>
            ) : (
              payouts.slice(0, 15).map((p) => {
                const getStatusColor = (status) => {
                  const statusLower = (status || '').toLowerCase();
                  if (statusLower === 'completed') return '#32CD32';
                  if (statusLower === 'pending') return '#FFD700';
                  if (statusLower === 'failed') return '#FF4444';
                  return theme.textSecondary;
                };
                
                return (
                  <View key={p.$id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-Medium" }}>
                          {money(p.amount)} • {p.payoutMethod || 'bankTransfer'}
                        </Text>
                        <Text style={{ color: theme.textSecondary, marginTop: 4 }} numberOfLines={2}>
                          creator: {userMap[p.creatorId]?.name || p.creatorId}
                        </Text>
                        {p.createdAt && (
                          <Text style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                            {fmtDate(p.createdAt)}
                          </Text>
                        )}
                      </View>
                      <View style={{
                        backgroundColor: getStatusColor(p.status) + '20',
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: getStatusColor(p.status) + '40'
                      }}>
                        <Text style={{ 
                          color: getStatusColor(p.status), 
                          fontWeight: '600', 
                          fontSize: 12,
                          textTransform: 'capitalize'
                        }}>
                          {p.status}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default AdminDashboard;


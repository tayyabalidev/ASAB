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

          <View style={{ backgroundColor: theme.surface, borderRadius: 14, padding: 16 }}>
            <Text style={{ color: theme.textPrimary, fontSize: 16, fontFamily: "Poppins-SemiBold", marginBottom: 10 }}>
              Recent payouts
            </Text>
            {payouts.length === 0 ? (
              <Text style={{ color: theme.textSecondary }}>{loading ? "Loading..." : "No payouts found."}</Text>
            ) : (
              payouts.slice(0, 15).map((p) => (
                <View key={p.$id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                  <Text style={{ color: theme.textPrimary, fontFamily: "Poppins-Medium" }}>
                    {money(p.amount)} • {p.status} • {p.payoutMethod}
                  </Text>
                  <Text style={{ color: theme.textSecondary, marginTop: 4 }} numberOfLines={2}>
                    creator: {userMap[p.creatorId]?.name || p.creatorId} • donations: {(p.donationIds || []).length}
                  </Text>
                  {p.createdAt && (
                    <Text style={{ color: theme.textSecondary, marginTop: 2 }} numberOfLines={1}>
                      {fmtDate(p.createdAt)}
                    </Text>
                  )}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default AdminDashboard;


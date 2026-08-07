import { useCallback, useEffect, useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getBookings, type MobileBooking } from "@/lib/bookings";
import { openWebPath } from "@/lib/web";
import { useAuth } from "@/providers/AuthProvider";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export default function TripsScreen() {
  const { initialized, session, user } = useAuth();
  const [bookings, setBookings] = useState<MobileBooking[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!session?.access_token) return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const result = await getBookings(session.access_token);
      setBookings(result.bookings);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load your trips.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (user) void load();
    else setBookings([]);
  }, [load, user]);

  if (!initialized) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color="#6d28d9" /></View></SafeAreaView>;
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyPage}>
          <Text style={styles.kicker}>YOUR TRIPS</Text>
          <Text style={styles.title}>Sign in to see your reservations.</Text>
          <Text style={styles.body}>Your booking requests, confirmations, payment status, dates, and totals will appear here.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push("/sign-in")} style={styles.primary}><Text style={styles.primaryText}>Sign in</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl onRefresh={() => void load(true)} refreshing={refreshing} tintColor="#6d28d9" />}
      >
        <Text style={styles.kicker}>YOUR TRIPS</Text>
        <Text style={styles.title}>Reservations in one place.</Text>
        <Text style={styles.body}>Pull down to refresh after a hotel partner reviews your request or a payment is processed.</Text>

        {loading ? <ActivityIndicator color="#6d28d9" style={styles.spinner} /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {!loading && !error && bookings.length === 0 ? (
          <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No trips yet</Text><Text style={styles.emptyText}>Search for a hotel and send your first booking request.</Text></View>
        ) : null}

        {bookings.map((booking) => (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleGroup}>
                <Text style={styles.hotel}>{booking.properties?.name ?? "iRatePilot hotel"}</Text>
                <Text style={styles.location}>{booking.properties ? `${booking.properties.city}, ${booking.properties.country}` : "Partner property"}</Text>
              </View>
              <Text style={styles.status}>{booking.status.replaceAll("_", " ")}</Text>
            </View>
            <Text style={styles.code}>{booking.confirmation_code}</Text>
            <View style={styles.row}><Text style={styles.rowLabel}>Stay</Text><Text style={styles.rowValue}>{booking.check_in} – {booking.check_out}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Room</Text><Text style={styles.rowValue}>{booking.rooms?.name ?? "Selected room"} · {booking.guests} {booking.guests === 1 ? "guest" : "guests"}</Text></View>
            <View style={styles.row}><Text style={styles.rowLabel}>Total</Text><Text style={styles.total}>{money(booking.total)}</Text></View>
            <View style={styles.payment}>
              <Text style={styles.paymentTitle}>{booking.payment_collected ? "Payment recorded" : booking.status === "pending" ? "No payment due while pending" : "Payment not collected"}</Text>
              <Text style={styles.paymentText}>{booking.payment_collected ? "Your transaction is linked to this reservation." : "Only use iRatePilot’s secure payment flow when this reservation becomes eligible."}</Text>
            </View>
            <Pressable accessibilityRole="link" onPress={() => openWebPath(`/booking-confirmation?code=${encodeURIComponent(booking.confirmation_code)}`)} style={styles.secondary}>
              <Text style={styles.secondaryText}>Open full reservation details</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  emptyPage: { flex: 1, justifyContent: "center", padding: 28 },
  content: { padding: 24, paddingBottom: 48 },
  kicker: { color: "#7c3aed", fontSize: 12, fontWeight: "800", letterSpacing: 1.3, marginTop: 12 },
  title: { color: "#0f172a", fontSize: 36, fontWeight: "900", letterSpacing: -1.2, lineHeight: 42, marginTop: 10 },
  body: { color: "#475569", fontSize: 16, lineHeight: 25, marginTop: 12 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginTop: 28, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  spinner: { marginTop: 32 },
  error: { backgroundColor: "#fff1f2", borderRadius: 12, color: "#9f1239", marginTop: 24, padding: 14 },
  emptyCard: { backgroundColor: "#ffffff", borderRadius: 18, marginTop: 26, padding: 22 },
  emptyTitle: { color: "#0f172a", fontSize: 19, fontWeight: "900" },
  emptyText: { color: "#64748b", fontSize: 14, lineHeight: 21, marginTop: 6 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 20, borderWidth: 1, marginTop: 20, padding: 19 },
  cardHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  cardTitleGroup: { flex: 1, paddingRight: 10 },
  hotel: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  location: { color: "#64748b", fontSize: 13, marginTop: 3 },
  status: { backgroundColor: "#ede9fe", borderRadius: 8, color: "#5b21b6", fontSize: 11, fontWeight: "900", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 6, textTransform: "uppercase" },
  code: { color: "#6d28d9", fontSize: 13, fontWeight: "900", marginTop: 14 },
  row: { borderTopColor: "#e2e8f0", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 13, paddingTop: 13 },
  rowLabel: { color: "#64748b", fontSize: 13 },
  rowValue: { color: "#334155", flex: 1, fontSize: 13, fontWeight: "700", marginLeft: 16, textAlign: "right" },
  total: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  payment: { backgroundColor: "#f8fafc", borderRadius: 12, marginTop: 15, padding: 13 },
  paymentTitle: { color: "#334155", fontSize: 13, fontWeight: "900" },
  paymentText: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 4 },
  secondary: { alignItems: "center", borderColor: "#6d28d9", borderRadius: 12, borderWidth: 1, marginTop: 15, padding: 13 },
  secondaryText: { color: "#6d28d9", fontSize: 13, fontWeight: "900" },
});

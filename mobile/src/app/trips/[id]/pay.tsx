import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStripe } from "@stripe/stripe-react-native";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { createBookingPaymentIntent, type BookingPaymentIntent } from "@/lib/bookings";
import { useAuth } from "@/providers/AuthProvider";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function PayForTripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session, user } = useAuth();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [intent, setIntent] = useState<BookingPaymentIntent | null>(null);
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accessToken = session?.access_token;
  const authenticationError = !id || !accessToken ? "Sign in again to prepare this payment." : null;
  const displayedError = error ?? authenticationError;

  useEffect(() => {
    if (!id || !accessToken) return;

    let active = true;
    void createBookingPaymentIntent(id, accessToken)
      .then(async (result) => {
        if (!active) return;
        setIntent(result);
        const initialized = await initPaymentSheet({
          merchantDisplayName: "iRatePilot",
          paymentIntentClientSecret: result.clientSecret,
          allowsDelayedPaymentMethods: false,
          returnURL: "iratepilot://stripe-redirect",
          defaultBillingDetails: { email: user?.email ?? undefined },
        });
        if (!active) return;
        if (initialized.error) throw new Error(initialized.error.message);
        setReady(true);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Unable to prepare secure payment.");
      });

    return () => {
      active = false;
    };
  }, [accessToken, id, initPaymentSheet, user?.email]);

  async function pay() {
    setPaying(true);
    setError(null);
    const result = await presentPaymentSheet();
    setPaying(false);
    if (result.error) {
      if (result.error.code !== "Canceled") setError(result.error.message);
      return;
    }
    setComplete(true);
  }

  if (complete) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.page}>
          <Text style={styles.kicker}>PAYMENT SUBMITTED</Text>
          <Text style={styles.title}>Your payment is processing securely.</Text>
          <Text style={styles.body}>Stripe will notify iRatePilot’s server. Pull to refresh Trips after a moment to see the authoritative payment status.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.replace("/(tabs)/trips")} style={styles.primary}>
            <Text style={styles.primaryText}>Return to Trips</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.page}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}><Text style={styles.back}>‹ Back to Trips</Text></Pressable>
        <Text style={styles.kicker}>SECURE CHECKOUT</Text>
        <Text style={styles.title}>Pay for your approved stay.</Text>
        {intent ? (
          <View style={styles.summary}>
            <Text style={styles.hotel}>{intent.breakdown.propertyName}</Text>
            <Text style={styles.room}>{intent.breakdown.roomName}</Text>
            <Text style={styles.code}>{intent.breakdown.confirmationCode}</Text>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>{money(intent.breakdown.total)}</Text></View>
            {intent.paymentMode === "test" ? <Text style={styles.test}>TEST MODE · No live charge</Text> : null}
          </View>
        ) : null}
        {!ready && !displayedError ? <ActivityIndicator color="#6d28d9" style={styles.spinner} /> : null}
        {displayedError ? <Text accessibilityRole="alert" style={styles.error}>{displayedError}</Text> : null}
        <Pressable accessibilityRole="button" disabled={!ready || paying} onPress={() => void pay()} style={[styles.primary, (!ready || paying) && styles.disabled]}>
          <Text style={styles.primaryText}>{paying ? "Opening secure checkout…" : "Pay now"}</Text>
        </Pressable>
        <Text style={styles.disclaimer}>Card details are collected by Stripe and are never stored by iRatePilot. A signed server webhook confirms the transaction.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#f8fafc", flex: 1 },
  page: { flex: 1, justifyContent: "center", padding: 26 },
  back: { color: "#6d28d9", fontSize: 15, fontWeight: "800", marginBottom: 28 },
  kicker: { color: "#7c3aed", fontSize: 12, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: "#0f172a", fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 40, marginTop: 10 },
  body: { color: "#475569", fontSize: 16, lineHeight: 25, marginTop: 14 },
  summary: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 20, borderWidth: 1, marginTop: 26, padding: 20 },
  hotel: { color: "#0f172a", fontSize: 21, fontWeight: "900" },
  room: { color: "#64748b", fontSize: 14, marginTop: 4 },
  code: { color: "#6d28d9", fontSize: 13, fontWeight: "900", marginTop: 13 },
  totalRow: { borderTopColor: "#e2e8f0", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 15, paddingTop: 15 },
  totalLabel: { color: "#64748b", fontSize: 15 },
  total: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  test: { backgroundColor: "#fef3c7", borderRadius: 8, color: "#92400e", fontSize: 11, fontWeight: "900", marginTop: 14, overflow: "hidden", padding: 8, textAlign: "center" },
  spinner: { marginTop: 28 },
  error: { backgroundColor: "#fff1f2", borderRadius: 12, color: "#9f1239", marginTop: 22, padding: 14 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginTop: 24, padding: 17 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  disabled: { opacity: 0.5 },
  disclaimer: { color: "#64748b", fontSize: 12, lineHeight: 18, marginTop: 14, textAlign: "center" },
});

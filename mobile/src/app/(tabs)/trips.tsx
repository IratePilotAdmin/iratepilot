import { router } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { openWebPath } from "@/lib/web";
import { useAuth } from "@/providers/AuthProvider";

export default function TripsScreen() {
  const { initialized, user } = useAuth();

  if (!initialized) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color="#6d28d9" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.kicker}>YOUR TRIPS</Text>
        <Text style={styles.title}>{user ? "Reservations in one place." : "Sign in to see your trips."}</Text>
        <Text style={styles.body}>
          {user
            ? "Your secure session is active. Open the production trip portal to view booking status, payments, dates, and hotel details."
            : "Use your iRatePilot customer account to access reservations on every device."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => user ? openWebPath("/account/trips") : router.push("/sign-in")}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>{user ? "Open my trips" : "Sign in"}</Text>
        </Pressable>
        {user ? <Text style={styles.note}>Native reservation data is the next mobile implementation phase.</Text> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { flex: 1, justifyContent: "center", padding: 28 },
  kicker: { color: "#7c3aed", fontSize: 12, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: "#0f172a", fontSize: 36, fontWeight: "900", letterSpacing: -1.2, lineHeight: 42, marginTop: 10 },
  body: { color: "#475569", fontSize: 17, lineHeight: 26, marginTop: 16 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginTop: 28, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  note: { color: "#64748b", fontSize: 13, lineHeight: 20, marginTop: 18 },
});

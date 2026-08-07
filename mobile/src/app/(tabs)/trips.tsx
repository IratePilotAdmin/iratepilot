import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { openWebPath } from "@/lib/web";

export default function TripsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.kicker}>YOUR TRIPS</Text>
        <Text style={styles.title}>Reservations in one place.</Text>
        <Text style={styles.body}>
          Sign in securely to view booking status, payment confirmation, dates, and hotel details.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => openWebPath("/account/trips")} style={styles.primary}>
          <Text style={styles.primaryText}>Open my trips</Text>
        </Pressable>
        <Text style={styles.note}>
          Native authenticated trip history is the next implementation phase. This first release uses the verified production account portal.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { flex: 1, justifyContent: "center", padding: 28 },
  kicker: { color: "#7c3aed", fontSize: 12, fontWeight: "800", letterSpacing: 1.3 },
  title: { color: "#0f172a", fontSize: 36, fontWeight: "900", letterSpacing: -1.2, lineHeight: 42, marginTop: 10 },
  body: { color: "#475569", fontSize: 17, lineHeight: 26, marginTop: 16 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginTop: 28, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  note: { color: "#64748b", fontSize: 13, lineHeight: 20, marginTop: 18 },
});

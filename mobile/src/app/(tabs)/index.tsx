import { useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { openWebPath } from "@/lib/web";

export default function ExploreScreen() {
  const [destination, setDestination] = useState("Miami Beach");

  function search() {
    const query = new URLSearchParams({ destination: destination.trim() || "Miami Beach" });
    return openWebPath(`/search?${query.toString()}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>iRatePilot</Text>
        <Text style={styles.kicker}>PREMIUM STAYS, SMARTER VALUE</Text>
        <Text style={styles.title}>Where do you want to go?</Text>
        <Text style={styles.subtitle}>
          Discover curated hotels, resorts, and vacation homes with transparent trip totals.
        </Text>

        <View style={styles.card}>
          <Text style={styles.label}>Destination</Text>
          <TextInput
            accessibilityLabel="Destination"
            autoCapitalize="words"
            onChangeText={setDestination}
            placeholder="City, beach, or landmark"
            returnKeyType="search"
            style={styles.input}
            value={destination}
            onSubmitEditing={search}
          />
          <Pressable accessibilityRole="button" onPress={search} style={styles.primary}>
            <Text style={styles.primaryText}>Search stays</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Built for confident booking</Text>
        {[
          ["Transparent totals", "See the trip price before payment."],
          ["Secure checkout", "Complete payment through iRatePilot’s production booking flow."],
          ["Partner-backed stays", "Inventory and reservations stay synchronized with hotel partners."],
        ].map(([title, body]) => (
          <View key={title} style={styles.feature}>
            <Text style={styles.featureTitle}>{title}</Text>
            <Text style={styles.featureBody}>{body}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 24, paddingBottom: 48 },
  brand: { color: "#6d28d9", fontSize: 24, fontWeight: "900", marginTop: 8 },
  kicker: { color: "#7c3aed", fontSize: 12, fontWeight: "800", letterSpacing: 1.3, marginTop: 34 },
  title: { color: "#0f172a", fontSize: 40, fontWeight: "900", letterSpacing: -1.4, lineHeight: 45, marginTop: 10 },
  subtitle: { color: "#475569", fontSize: 17, lineHeight: 26, marginTop: 14 },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 22, borderWidth: 1, marginTop: 28, padding: 18 },
  label: { color: "#334155", fontSize: 13, fontWeight: "800", marginBottom: 8 },
  input: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1", borderRadius: 14, borderWidth: 1, color: "#0f172a", fontSize: 16, paddingHorizontal: 14, paddingVertical: 14 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginTop: 14, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  sectionTitle: { color: "#0f172a", fontSize: 23, fontWeight: "900", marginBottom: 4, marginTop: 34 },
  feature: { borderBottomColor: "#e2e8f0", borderBottomWidth: 1, paddingVertical: 18 },
  featureTitle: { color: "#1e293b", fontSize: 16, fontWeight: "800" },
  featureBody: { color: "#64748b", fontSize: 14, lineHeight: 21, marginTop: 5 },
});

import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { type MobileHotel, searchHotels } from "@/lib/hotels";

export default function ExploreScreen() {
  const [destination, setDestination] = useState("Miami Beach");
  const [hotels, setHotels] = useState<MobileHotel[]>([]);
  const [source, setSource] = useState<"database" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    const query = destination.trim();
    if (query.length < 2) {
      setError("Enter at least two characters for a destination.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await searchHotels(query);
      setHotels(result.hotels);
      setSource(result.source);
    } catch (caught) {
      setHotels([]);
      setError(caught instanceof Error ? caught.message : "Unable to search right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>iRatePilot</Text>
        <Text style={styles.kicker}>PREMIUM STAYS, SMARTER VALUE</Text>
        <Text style={styles.title}>Where do you want to go?</Text>
        <Text style={styles.subtitle}>Search approved partner inventory without leaving the app.</Text>

        <View style={styles.searchCard}>
          <Text style={styles.label}>Destination</Text>
          <TextInput
            accessibilityLabel="Destination"
            autoCapitalize="words"
            onChangeText={setDestination}
            onSubmitEditing={() => void search()}
            placeholder="City, beach, or property"
            returnKeyType="search"
            style={styles.input}
            value={destination}
          />
          <Pressable accessibilityRole="button" disabled={loading} onPress={() => void search()} style={styles.primary}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Search stays</Text>}
          </Pressable>
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        </View>

        {source ? (
          <View style={styles.resultsHeader}>
            <Text style={styles.sectionTitle}>{hotels.length} stays found</Text>
            <Text style={styles.source}>{source === "database" ? "Approved partner inventory" : "Private demonstration inventory"}</Text>
          </View>
        ) : null}

        {source && hotels.length === 0 ? <Text style={styles.empty}>No stays match this destination. Try another city or property name.</Text> : null}

        {hotels.map((hotel) => (
          <Pressable
            accessibilityRole="button"
            key={hotel.slug}
            onPress={() => router.push({ pathname: "/hotels/[slug]", params: { slug: hotel.slug } })}
            style={styles.hotelCard}
          >
            <Image accessibilityLabel={hotel.name} source={{ uri: hotel.image }} style={styles.image} />
            <View style={styles.hotelBody}>
              <Text style={styles.stars}>{hotel.stars}-star verified</Text>
              <Text style={styles.hotelName}>{hotel.name}</Text>
              <Text style={styles.location}>{hotel.city}, {hotel.country}</Text>
              <Text numberOfLines={2} style={styles.description}>{hotel.description}</Text>
              <View style={styles.priceRow}>
                <Text style={styles.rating}>{hotel.rating ? `${hotel.rating.toFixed(1)} guest rating` : "New partner"}</Text>
                <Text style={styles.price}>From ${hotel.price}/night</Text>
              </View>
            </View>
          </Pressable>
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
  searchCard: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 22, borderWidth: 1, marginTop: 28, padding: 18 },
  label: { color: "#334155", fontSize: 13, fontWeight: "800", marginBottom: 8 },
  input: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1", borderRadius: 14, borderWidth: 1, color: "#0f172a", fontSize: 16, paddingHorizontal: 14, paddingVertical: 14 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, justifyContent: "center", marginTop: 14, minHeight: 52, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  error: { color: "#9f1239", fontSize: 14, lineHeight: 20, marginTop: 12 },
  resultsHeader: { marginTop: 32 },
  sectionTitle: { color: "#0f172a", fontSize: 23, fontWeight: "900" },
  source: { color: "#64748b", fontSize: 13, marginTop: 4 },
  empty: { backgroundColor: "#ffffff", borderRadius: 16, color: "#475569", fontSize: 15, lineHeight: 23, marginTop: 16, padding: 20 },
  hotelCard: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderRadius: 20, borderWidth: 1, marginTop: 18, overflow: "hidden" },
  image: { height: 190, width: "100%" },
  hotelBody: { padding: 18 },
  stars: { color: "#7c3aed", fontSize: 12, fontWeight: "800", textTransform: "uppercase" },
  hotelName: { color: "#0f172a", fontSize: 23, fontWeight: "900", marginTop: 6 },
  location: { color: "#6d28d9", fontSize: 14, fontWeight: "700", marginTop: 3 },
  description: { color: "#64748b", fontSize: 14, lineHeight: 21, marginTop: 10 },
  priceRow: { alignItems: "flex-end", borderTopColor: "#e2e8f0", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", marginTop: 14, paddingTop: 14 },
  rating: { color: "#475569", flex: 1, fontSize: 12 },
  price: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
});

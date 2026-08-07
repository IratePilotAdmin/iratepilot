import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { getHotel, type MobileHotel } from "@/lib/hotels";
import { openWebPath } from "@/lib/web";

export default function HotelDetailsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [hotel, setHotel] = useState<MobileHotel | null>(null);
  const [source, setSource] = useState<"database" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();

    getHotel(slug, controller.signal)
      .then((result) => {
        setHotel(result.data);
        setSource(result.source);
      })
      .catch((caught) => {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Unable to load this property.");
      });

    return () => controller.abort();
  }, [slug]);

  if (!hotel && !error) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color="#6d28d9" /></View></SafeAreaView>;
  }

  if (!hotel) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.secondary}><Text style={styles.secondaryText}>Back to search</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back to search</Text></Pressable>
        <Image accessibilityLabel={hotel.name} source={{ uri: hotel.image }} style={styles.image} />
        <Text style={styles.badge}>{hotel.stars}-star verified</Text>
        <Text style={styles.title}>{hotel.name}</Text>
        <Text style={styles.location}>{hotel.city}, {hotel.country}</Text>
        <View style={styles.meta}>
          <Text style={styles.rating}>{hotel.rating ? hotel.rating.toFixed(1) : "New"}</Text>
          <Text style={styles.metaText}>{hotel.reviews ? `${hotel.reviews} guest reviews` : "New approved partner"}</Text>
          <Text style={styles.price}>${hotel.price}/night</Text>
        </View>
        <Text style={styles.description}>{hotel.description}</Text>
        <Text style={styles.heading}>Property amenities</Text>
        <View style={styles.amenities}>
          {hotel.amenities.map((amenity) => <Text key={amenity} style={styles.amenity}>✓ {amenity}</Text>)}
        </View>
        <View style={styles.trust}>
          <Text style={styles.trustTitle}>{source === "database" ? "Approved partner inventory" : "Private demonstration listing"}</Text>
          <Text style={styles.trustBody}>Room availability and the final trip total are verified in iRatePilot’s production booking flow.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => openWebPath(`/hotels/${hotel.slug}#rooms`)} style={styles.primary}>
          <Text style={styles.primaryText}>Check rooms and dates</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  content: { paddingBottom: 44 },
  loading: { alignItems: "center", flex: 1, justifyContent: "center", padding: 28 },
  back: { paddingHorizontal: 22, paddingVertical: 16 },
  backText: { color: "#6d28d9", fontSize: 15, fontWeight: "800" },
  image: { height: 300, width: "100%" },
  badge: { color: "#7c3aed", fontSize: 12, fontWeight: "900", letterSpacing: 0.7, marginHorizontal: 24, marginTop: 24, textTransform: "uppercase" },
  title: { color: "#0f172a", fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 39, marginHorizontal: 24, marginTop: 8 },
  location: { color: "#6d28d9", fontSize: 16, fontWeight: "700", marginHorizontal: 24, marginTop: 5 },
  meta: { alignItems: "center", borderBottomColor: "#e2e8f0", borderBottomWidth: 1, flexDirection: "row", marginHorizontal: 24, marginTop: 20, paddingBottom: 18 },
  rating: { backgroundColor: "#6d28d9", borderRadius: 9, color: "#ffffff", fontSize: 15, fontWeight: "900", overflow: "hidden", paddingHorizontal: 10, paddingVertical: 7 },
  metaText: { color: "#64748b", flex: 1, fontSize: 13, marginLeft: 10 },
  price: { color: "#0f172a", fontSize: 17, fontWeight: "900" },
  description: { color: "#475569", fontSize: 17, lineHeight: 28, marginHorizontal: 24, marginTop: 22 },
  heading: { color: "#0f172a", fontSize: 21, fontWeight: "900", marginHorizontal: 24, marginTop: 28 },
  amenities: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginHorizontal: 24, marginTop: 14 },
  amenity: { backgroundColor: "#f1f5f9", borderRadius: 10, color: "#334155", fontSize: 14, paddingHorizontal: 12, paddingVertical: 9 },
  trust: { backgroundColor: "#f5f3ff", borderRadius: 16, marginHorizontal: 24, marginTop: 26, padding: 18 },
  trustTitle: { color: "#5b21b6", fontSize: 15, fontWeight: "900" },
  trustBody: { color: "#6b7280", fontSize: 13, lineHeight: 20, marginTop: 6 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginHorizontal: 24, marginTop: 22, padding: 17 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  secondary: { borderColor: "#6d28d9", borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 14 },
  secondaryText: { color: "#6d28d9", fontWeight: "800" },
  error: { color: "#9f1239", fontSize: 15, textAlign: "center" },
});

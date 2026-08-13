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
  TextInput,
  View,
} from "react-native";

import {
  createBookingRequest,
  getHotel,
  type MobileHotel,
  type MobileRoom,
  type StaySelection,
} from "@/lib/hotels";
import { useAuth } from "@/providers/AuthProvider";

export default function HotelDetailsScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { session, user } = useAuth();
  const [hotel, setHotel] = useState<MobileHotel | null>(null);
  const [source, setSource] = useState<"database" | "demo" | null>(null);
  const [rooms, setRooms] = useState<MobileRoom[]>([]);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState("1");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    getHotel(slug, undefined, controller.signal)
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

  function stay(): StaySelection | null {
    const count = Number(guests);
    if (!checkIn || !checkOut || !Number.isInteger(count) || count < 1 || count > 20) {
      setError("Enter check-in, check-out, and a guest count between 1 and 20.");
      return null;
    }
    return { checkIn, checkOut, guests: count };
  }

  async function checkAvailability() {
    if (!slug) return;
    const selection = stay();
    if (!selection) return;

    setLoadingAvailability(true);
    setError(null);
    setSelectedRoomId("");
    try {
      const result = await getHotel(slug, selection);
      setHotel(result.data);
      setSource(result.source);
      setRooms(result.rooms);
      if (!result.rooms.length) setError("No rooms are available for every selected night.");
    } catch (caught) {
      setRooms([]);
      setError(caught instanceof Error ? caught.message : "Unable to verify availability.");
    } finally {
      setLoadingAvailability(false);
    }
  }

  async function requestBooking() {
    if (!hotel || !selectedRoomId) {
      setError("Select an available room.");
      return;
    }
    const selection = stay();
    if (!selection) return;
    if (!user || !session?.access_token) {
      router.push("/sign-in");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await createBookingRequest(
        { ...selection, hotelSlug: hotel.slug, roomId: selectedRoomId },
        session.access_token,
      );
      setConfirmation(result.data.confirmation_code);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The booking request could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!hotel && !error) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color="#6d28d9" /></View></SafeAreaView>;
  }

  if (!hotel) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable onPress={() => router.back()} style={styles.secondary}><Text style={styles.secondaryText}>Back to search</Text></Pressable></View></SafeAreaView>;
  }

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}><Text style={styles.backText}>‹ Back to search</Text></Pressable>
        <Image accessibilityLabel={hotel.name} alt={hotel.name} source={{ uri: hotel.image }} style={styles.image} />
        <Text style={styles.badge}>{hotel.stars}-star verified</Text>
        <Text style={styles.title}>{hotel.name}</Text>
        <Text style={styles.location}>{hotel.city}, {hotel.country}</Text>
        <Text style={styles.description}>{hotel.description}</Text>

        <View style={styles.bookingCard}>
          <Text style={styles.heading}>Check live availability</Text>
          <Text style={styles.help}>Use YYYY-MM-DD. Availability must exist for every selected night.</Text>
          <View style={styles.dateRow}>
            <View style={styles.field}><Text style={styles.label}>Check-in</Text><TextInput accessibilityLabel="Check-in date" autoCapitalize="none" onChangeText={setCheckIn} placeholder="2026-09-10" style={styles.input} value={checkIn} /></View>
            <View style={styles.field}><Text style={styles.label}>Check-out</Text><TextInput accessibilityLabel="Check-out date" autoCapitalize="none" onChangeText={setCheckOut} placeholder="2026-09-12" style={styles.input} value={checkOut} /></View>
          </View>
          <Text style={styles.label}>Guests</Text>
          <TextInput accessibilityLabel="Guest count" keyboardType="number-pad" onChangeText={setGuests} style={styles.input} value={guests} />
          <Pressable accessibilityRole="button" disabled={loadingAvailability} onPress={() => void checkAvailability()} style={styles.primary}>
            {loadingAvailability ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Show available rooms</Text>}
          </Pressable>
        </View>

        {rooms.map((room) => {
          const selected = selectedRoomId === room.id;
          return (
            <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} key={room.id} onPress={() => setSelectedRoomId(room.id)} style={[styles.room, selected && styles.roomSelected]}>
              <View style={styles.roomHeader}><Text style={styles.roomName}>{room.name}</Text><Text style={styles.roomPrice}>${room.baseRate.toFixed(2)}/night</Text></View>
              <Text style={styles.roomMeta}>Up to {room.maxGuests} guests · verified for every selected night</Text>
              {room.staySubtotal != null ? <Text style={styles.subtotal}>Room subtotal: ${room.staySubtotal.toFixed(2)}</Text> : null}
            </Pressable>
          );
        })}

        {selectedRoom ? (
          <View style={styles.requestCard}>
            <Text style={styles.heading}>Request this stay</Text>
            <Text style={styles.help}>The server will recalculate availability, membership savings, fees, and the exact total before creating your request.</Text>
            <Pressable accessibilityRole="button" disabled={submitting || source !== "database"} onPress={() => void requestBooking()} style={styles.primary}>
              {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{user ? "Send booking request" : "Sign in to request"}</Text>}
            </Pressable>
          </View>
        ) : null}

        {confirmation ? <View style={styles.confirmation}><Text style={styles.confirmationTitle}>Request received</Text><Text style={styles.confirmationCode}>{confirmation}</Text><Text style={styles.help}>The hotel partner can now review your request. No payment was collected.</Text></View> : null}
        {error ? <Text accessibilityRole="alert" style={styles.errorBox}>{error}</Text> : null}
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
  image: { height: 280, width: "100%" },
  badge: { color: "#7c3aed", fontSize: 12, fontWeight: "900", marginHorizontal: 24, marginTop: 24, textTransform: "uppercase" },
  title: { color: "#0f172a", fontSize: 34, fontWeight: "900", letterSpacing: -1, lineHeight: 39, marginHorizontal: 24, marginTop: 8 },
  location: { color: "#6d28d9", fontSize: 16, fontWeight: "700", marginHorizontal: 24, marginTop: 5 },
  description: { color: "#475569", fontSize: 16, lineHeight: 26, marginHorizontal: 24, marginTop: 18 },
  bookingCard: { backgroundColor: "#f8fafc", borderRadius: 18, marginHorizontal: 24, marginTop: 26, padding: 18 },
  heading: { color: "#0f172a", fontSize: 21, fontWeight: "900" },
  help: { color: "#64748b", fontSize: 13, lineHeight: 20, marginTop: 6 },
  dateRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  field: { flex: 1 },
  label: { color: "#334155", fontSize: 13, fontWeight: "800", marginBottom: 7, marginTop: 12 },
  input: { backgroundColor: "#ffffff", borderColor: "#cbd5e1", borderRadius: 11, borderWidth: 1, color: "#0f172a", fontSize: 15, padding: 13 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 13, justifyContent: "center", marginTop: 16, minHeight: 52, padding: 15 },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  room: { borderColor: "#e2e8f0", borderRadius: 16, borderWidth: 1, marginHorizontal: 24, marginTop: 14, padding: 17 },
  roomSelected: { backgroundColor: "#f5f3ff", borderColor: "#7c3aed", borderWidth: 2 },
  roomHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  roomName: { color: "#0f172a", flex: 1, fontSize: 17, fontWeight: "900" },
  roomPrice: { color: "#6d28d9", fontSize: 14, fontWeight: "900" },
  roomMeta: { color: "#64748b", fontSize: 13, marginTop: 7 },
  subtotal: { color: "#0f172a", fontSize: 14, fontWeight: "800", marginTop: 9 },
  requestCard: { backgroundColor: "#ffffff", borderColor: "#ddd6fe", borderRadius: 18, borderWidth: 1, marginHorizontal: 24, marginTop: 20, padding: 18 },
  confirmation: { backgroundColor: "#ecfdf5", borderRadius: 18, marginHorizontal: 24, marginTop: 20, padding: 20 },
  confirmationTitle: { color: "#065f46", fontSize: 20, fontWeight: "900" },
  confirmationCode: { color: "#047857", fontSize: 16, fontWeight: "900", marginTop: 8 },
  errorBox: { backgroundColor: "#fff1f2", borderRadius: 12, color: "#9f1239", fontSize: 14, lineHeight: 21, marginHorizontal: 24, marginTop: 16, padding: 14 },
  secondary: { borderColor: "#6d28d9", borderRadius: 12, borderWidth: 1, marginTop: 18, padding: 14 },
  secondaryText: { color: "#6d28d9", fontWeight: "800" },
  error: { color: "#9f1239", fontSize: 15, textAlign: "center" },
});

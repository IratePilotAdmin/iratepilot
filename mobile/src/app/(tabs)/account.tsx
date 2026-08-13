import { useEffect, useState } from "react";
import { router } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import {
  disableBookingNotifications,
  enableBookingNotifications,
  hasBookingNotificationRegistration,
} from "@/lib/notifications";
import { openWebPath } from "@/lib/web";
import { useAuth } from "@/providers/AuthProvider";

export default function AccountScreen() {
  const { initialized, session, user, signOut } = useAuth();
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [updatingNotifications, setUpdatingNotifications] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);

  useEffect(() => {
    void hasBookingNotificationRegistration().then(setNotificationsEnabled);
  }, []);

  async function toggleNotifications() {
    const accessToken = session?.access_token;
    if (!accessToken) return;
    setUpdatingNotifications(true);
    setNotificationMessage(null);
    try {
      if (notificationsEnabled) {
        await disableBookingNotifications(accessToken);
        setNotificationsEnabled(false);
        setNotificationMessage("Booking notifications are off on this device.");
      } else {
        await enableBookingNotifications(accessToken);
        setNotificationsEnabled(true);
        setNotificationMessage("Booking notifications are on for this device.");
      }
    } catch (caught) {
      setNotificationMessage(caught instanceof Error ? caught.message : "Unable to update notifications.");
    } finally {
      setUpdatingNotifications(false);
    }
  }

  if (!initialized) {
    return <SafeAreaView style={styles.safe}><View style={styles.loading}><ActivityIndicator color="#6d28d9" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.brand}>iRatePilot</Text>
        <Text style={styles.title}>{user ? "Your account" : "Travel with confidence"}</Text>
        <Text style={styles.body}>
          {user ? `Signed in as ${user.email ?? "iRatePilot customer"}.` : "Sign in securely to manage your reservations across iOS, Android, and the web."}
        </Text>
        {user ? (
          <>
            <View style={styles.notificationCard}>
              <Text style={styles.notificationTitle}>Booking notifications</Text>
              <Text style={styles.notificationText}>Get reservation decisions and payment-status updates on this device.</Text>
              <Pressable accessibilityRole="button" disabled={updatingNotifications} onPress={() => void toggleNotifications()} style={styles.notificationButton}>
                <Text style={styles.notificationButtonText}>{updatingNotifications ? "Updating…" : notificationsEnabled ? "Turn off" : "Enable notifications"}</Text>
              </Pressable>
              {notificationMessage ? <Text accessibilityLiveRegion="polite" style={styles.message}>{notificationMessage}</Text> : null}
            </View>
            <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.primary}>
              <Text style={styles.primaryText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push("/sign-in")} style={styles.primary}>
            <Text style={styles.primaryText}>Sign in or create account</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="link" onPress={() => openWebPath("/privacy")}><Text style={styles.link}>Privacy policy</Text></Pressable>
        {user ? <Pressable accessibilityRole="link" onPress={() => openWebPath("/account-deletion")}><Text style={styles.dangerLink}>Request account deletion</Text></Pressable> : null}
        <Pressable accessibilityRole="link" onPress={() => openWebPath("/terms")}><Text style={styles.link}>Terms of service</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  loading: { alignItems: "center", flex: 1, justifyContent: "center" },
  content: { flex: 1, justifyContent: "center", padding: 28 },
  brand: { color: "#6d28d9", fontSize: 24, fontWeight: "900" },
  title: { color: "#0f172a", fontSize: 36, fontWeight: "900", letterSpacing: -1.2, marginTop: 28 },
  body: { color: "#475569", fontSize: 17, lineHeight: 26, marginTop: 14 },
  notificationCard: { backgroundColor: "#f8fafc", borderColor: "#e2e8f0", borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 16 },
  notificationTitle: { color: "#0f172a", fontSize: 16, fontWeight: "900" },
  notificationText: { color: "#64748b", fontSize: 13, lineHeight: 20, marginTop: 5 },
  notificationButton: { alignItems: "center", borderColor: "#6d28d9", borderRadius: 11, borderWidth: 1, marginTop: 13, padding: 12 },
  notificationButtonText: { color: "#6d28d9", fontSize: 14, fontWeight: "900" },
  message: { color: "#475569", fontSize: 12, lineHeight: 18, marginTop: 10 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginBottom: 22, marginTop: 22, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  link: { color: "#475569", fontSize: 14, marginTop: 12, textDecorationLine: "underline" },
  dangerLink: { color: "#b91c1c", fontSize: 14, marginTop: 12, textDecorationLine: "underline" },
});

import { router } from "expo-router";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { openWebPath } from "@/lib/web";
import { useAuth } from "@/providers/AuthProvider";

export default function AccountScreen() {
  const { initialized, user, signOut } = useAuth();

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
          <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.primary}>
            <Text style={styles.primaryText}>Sign out</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push("/sign-in")} style={styles.primary}>
            <Text style={styles.primaryText}>Sign in or create account</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="link" onPress={() => openWebPath("/privacy")}>
          <Text style={styles.link}>Privacy policy</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => openWebPath("/terms")}>
          <Text style={styles.link}>Terms of service</Text>
        </Pressable>
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
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginBottom: 22, marginTop: 28, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  link: { color: "#475569", fontSize: 14, marginTop: 12, textDecorationLine: "underline" },
});

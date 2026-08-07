import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { openWebPath } from "@/lib/web";

export default function AccountScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.brand}>iRatePilot</Text>
        <Text style={styles.title}>Your travel account</Text>
        <Text style={styles.body}>
          Access saved profile details and current reservations through the secure iRatePilot account portal.
        </Text>
        <Pressable accessibilityRole="button" onPress={() => openWebPath("/login")} style={styles.primary}>
          <Text style={styles.primaryText}>Sign in</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => openWebPath("/register")} style={styles.secondary}>
          <Text style={styles.secondaryText}>Create account</Text>
        </Pressable>
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
  content: { flex: 1, justifyContent: "center", padding: 28 },
  brand: { color: "#6d28d9", fontSize: 24, fontWeight: "900" },
  title: { color: "#0f172a", fontSize: 36, fontWeight: "900", letterSpacing: -1.2, marginTop: 28 },
  body: { color: "#475569", fontSize: 17, lineHeight: 26, marginTop: 14 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginTop: 28, padding: 16 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  secondary: { alignItems: "center", borderColor: "#6d28d9", borderRadius: 14, borderWidth: 1, marginBottom: 22, marginTop: 12, padding: 15 },
  secondaryText: { color: "#6d28d9", fontSize: 16, fontWeight: "800" },
  link: { color: "#475569", fontSize: 14, marginTop: 12, textDecorationLine: "underline" },
});

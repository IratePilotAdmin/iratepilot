import { useState } from "react";
import { router } from "expo-router";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { useAuth } from "@/providers/AuthProvider";

export default function SignInScreen() {
  const { requestPasswordReset, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "recovery">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!email.trim() || (mode !== "recovery" && password.length < 8)) {
      setMessage("Enter a valid email and a password with at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setMessage(null);
    const error = mode === "recovery"
      ? await requestPasswordReset(email)
      : mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password);
    setSubmitting(false);

    if (error) {
      setMessage(error);
      return;
    }

    if (mode === "recovery") {
      setMessage("If an account exists for that email, a password-reset link is on its way.");
      return;
    }

    if (mode === "signup") {
      setMessage("Account created. Check your email if confirmation is required, then sign in.");
      setMode("signin");
      return;
    }

    router.replace("/(tabs)/account");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
        <View>
          <Text style={styles.brand}>iRatePilot</Text>
          <Text style={styles.title}>{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}</Text>
          <Text style={styles.body}>{mode === "recovery" ? "We will email you a secure link to choose a new password." : "Use the same secure customer account as iratepilot.com."}</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email address"
            style={styles.input}
            value={email}
          />
          {mode !== "recovery" ? (
            <TextInput
              autoCapitalize="none"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              style={styles.input}
              value={password}
            />
          ) : null}
          {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
          <Pressable accessibilityRole="button" disabled={submitting} onPress={submit} style={styles.primary}>
            {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</Text>}
          </Pressable>
          {mode === "signin" ? (
            <Pressable accessibilityRole="button" onPress={() => { setMessage(null); setMode("recovery"); }} style={styles.switch}>
              <Text style={styles.switchText}>Forgot password?</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => { setMessage(null); setMode(mode === "signin" ? "signup" : "signin"); }} style={styles.switch}>
            <Text style={styles.switchText}>{mode === "signin" ? "New to iRatePilot? Create an account" : "Back to sign in"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#ffffff" },
  page: { flex: 1, justifyContent: "center", padding: 28 },
  brand: { color: "#6d28d9", fontSize: 24, fontWeight: "900" },
  title: { color: "#0f172a", fontSize: 34, fontWeight: "900", letterSpacing: -1, marginTop: 24 },
  body: { color: "#475569", fontSize: 16, lineHeight: 24, marginBottom: 18, marginTop: 10 },
  input: { borderColor: "#cbd5e1", borderRadius: 12, borderWidth: 1, color: "#0f172a", fontSize: 16, marginTop: 12, padding: 15 },
  message: { color: "#9f1239", fontSize: 14, lineHeight: 20, marginTop: 14 },
  primary: { alignItems: "center", backgroundColor: "#6d28d9", borderRadius: 14, marginTop: 20, minHeight: 54, justifyContent: "center", padding: 15 },
  primaryText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  switch: { alignItems: "center", padding: 16 },
  switchText: { color: "#6d28d9", fontSize: 14, fontWeight: "700" },
  cancel: { alignItems: "center", padding: 10 },
  cancelText: { color: "#64748b", fontSize: 14 },
});

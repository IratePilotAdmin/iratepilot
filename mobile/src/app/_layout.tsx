import "react-native-gesture-handler";

import { StripeProvider } from "@stripe/stripe-react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { NotificationNavigation } from "@/components/NotificationNavigation";
import { AuthProvider } from "@/providers/AuthProvider";

const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export default function RootLayout() {
  return (
    <StripeProvider publishableKey={stripePublishableKey} urlScheme="iratepilot">
      <AuthProvider>
        <NotificationNavigation />
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </AuthProvider>
    </StripeProvider>
  );
}

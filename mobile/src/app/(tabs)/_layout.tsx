import { Tabs } from "expo-router";

const purple = "#6d28d9";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: purple,
        tabBarInactiveTintColor: "#64748b",
        tabBarStyle: { borderTopColor: "#e2e8f0", height: 66, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "700" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Explore" }} />
      <Tabs.Screen name="trips" options={{ title: "Trips" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}

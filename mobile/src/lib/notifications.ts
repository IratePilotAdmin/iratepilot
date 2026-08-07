import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type NotificationRegistration = {
  token: string;
  platform: "ios" | "android";
};

export async function registerForBookingNotifications(): Promise<NotificationRegistration> {
  if (!Device.isDevice) throw new Error("Push notifications require a physical device.");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("bookings", {
      name: "Booking updates",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new Error("Notification permission was not granted.");

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error("The EAS project ID is not configured.");

  const result = await Notifications.getExpoPushTokenAsync({ projectId });
  return {
    token: result.data,
    platform: Platform.OS === "ios" ? "ios" : "android",
  };
}

export function notificationRoute(data: Record<string, unknown>) {
  const bookingId = typeof data.bookingId === "string" ? data.bookingId : null;
  if (bookingId && /^[0-9a-f-]{36}$/i.test(bookingId)) {
    return { pathname: "/trips/[id]/pay" as const, params: { id: bookingId } };
  }

  return "/(tabs)/trips" as const;
}

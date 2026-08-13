import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import { notificationRoute } from "@/lib/notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function NotificationNavigation() {
  useEffect(() => {
    function navigate(response: Notifications.NotificationResponse | null) {
      if (!response) return;
      const data = response.notification.request.content.data;
      router.push(notificationRoute(data ?? {}));
    }

    void Notifications.getLastNotificationResponseAsync().then(navigate);
    const subscription = Notifications.addNotificationResponseReceivedListener(navigate);
    return () => subscription.remove();
  }, []);

  return null;
}

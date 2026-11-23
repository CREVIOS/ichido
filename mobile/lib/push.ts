import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { SHIFT } from "@content/catalogue";
import { cmd } from "./supabase";

// Staff alerts in the app (web/lib/alerts.ts sends them through Expo's push service): new case, target passed,
// new field job, promise due. The token is registered for this staff session only; signing out or being signed out
// deletes it on the server. A notification carries a title, a place name and the screen to open, never caller text.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const RECEIVES = new Set(["operator", "field", "manager"]);
// EAS project id: from `eas init` (app.config extra.eas.projectId) or EXPO_PUBLIC_EAS_PROJECT_ID.
const projectId = () => Constants.easConfig?.projectId ?? (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

// After sign-in with a second factor. Asks once; a refusal, a simulator or Expo Go without a project id just means
// no notifications on this device.
export async function registerPush(role: string): Promise<string> {
  if (!RECEIVES.has(role) || Platform.OS === "web" || !projectId()) return SHIFT.pushMissing;
  try {
    if (Platform.OS === "android") await Notifications.setNotificationChannelAsync("alerts", { name: "Ichido", importance: Notifications.AndroidImportance.HIGH });
    const { granted } = await Notifications.requestPermissionsAsync();
    if (!granted) return SHIFT.pushDenied;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    await cmd("push_subscribe", { platform: "expo", endpoint: data });
    return SHIFT.pushReady;
  } catch {
    return SHIFT.pushFailed;
  }
}

// Opening a notification goes to its screen (/operator/<id>, /field, /insights), including from a cold start.
const ROUTE = /^\/(operator\/[0-9a-f-]{36}|field(?:\?job=[0-9a-f-]{36})?|insights|operator)$/;
const open = (r: Notifications.NotificationResponse | null) => {
  const path = r?.notification.request.content.data?.path;
  if (typeof path === "string" && ROUTE.test(path)) router.push(path as Href);
};
export function usePushLinks() {
  useEffect(() => {
    open(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

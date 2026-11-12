import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance, SchedulableTriggerInputTypes } from "expo-notifications";
import type { RestNotifier } from "@/stores/rest-timer-store";

// The "rest is over" alert, with expo-notifications (LOCAL notifications: scheduled on
// the phone, no server, and they work in Expo Go).
//
// It's a nudge for when the phone is in your pocket, never the timer itself: the rest bar
// always counts down from the stored end time. On Android, without the exact-alarm
// permission (off by default since Android 14, and it needs a native build to declare),
// the system may deliver it a little late.

const CHANNEL_ID = "rest-timer";

/** Show it even when the app is open (the player may be on another screen). */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

let permission: Promise<boolean> | null = null;

/**
 * Asked the first time a rest starts, not at launch: that's when the reason is obvious.
 * Asked once per app run; if it's refused, the timer still works on screen.
 */
function allowed(): Promise<boolean> {
  permission ??= (async () => {
    if (Platform.OS === "android") {
      // Android 13+ only shows the permission prompt once a channel exists.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Rest timer",
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
      });
    }
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  })().catch((error) => {
    console.warn("[notifications] unavailable:", error);
    return false;
  });
  return permission;
}

export const restNotifier: RestNotifier = {
  schedule: async (at, body) => {
    if (!(await allowed())) return null;
    return Notifications.scheduleNotificationAsync({
      content: { title: "Rest done. You're up.", body, sound: true },
      trigger: { type: SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL_ID },
    });
  },
  cancel: (id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}),
};

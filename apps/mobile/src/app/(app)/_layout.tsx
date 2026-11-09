import { Stack } from "expo-router";
import { colors } from "@/theme/colors";

// Screens for signed-in users. Tabs (Home, History, Progress, Profile) come later.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}

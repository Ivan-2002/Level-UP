import { Tabs } from "expo-router";
import { Icon, type IconName } from "@/components/Icon";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/use-theme";

// The tab bar: Home and Workouts for now (History, Progress and Profile come later).
// JavaScript tabs (bundled with Expo Router) rather than native tabs: native tabs take
// SF Symbols / Material icons or images, not our Lucide icons, and these match the
// design exactly on both platforms.
//
// The active tab's ICON is indigo (primary = "the active tab"). Its LABEL stays ink:
// indigo text on the dark surface is only 3.3:1, below the 4.5:1 rule for text.
export default function TabsLayout() {
  const t = useTheme();
  const tab = (title: string, icon: IconName) => ({
    title,
    tabBarIcon: ({ focused }: { focused: boolean }) => <Icon name={icon} size={22} color={focused ? t.colors.primary : t.colors.inkMuted} />,
    tabBarLabel: ({ focused }: { focused: boolean }) => (
      <Text variant={focused ? "captionStrong" : "caption"} tone={focused ? "ink" : "inkMuted"}>
        {title}
      </Text>
    ),
  });

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: t.colors.bg },
        tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
      }}
    >
      <Tabs.Screen name="index" options={tab("Home", "home")} />
      <Tabs.Screen name="workouts" options={tab("Workouts", "routines")} />
    </Tabs>
  );
}

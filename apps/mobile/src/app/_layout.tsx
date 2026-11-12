import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";
import { useAppFonts } from "@/theme/fonts";
import { useTheme } from "@/theme/use-theme";

// Keep the splash screen up until the fonts are loaded, so the first frame is already in
// Sora/Inter instead of flashing the system font. Called at module scope, before any
// render, as the expo-splash-screen docs require.
void SplashScreen.preventAutoHideAsync();

// The root layout wraps EVERY screen. Providers placed here are available everywhere.
export default function RootLayout() {
  const fontsReady = useAppFonts();
  const t = useTheme();

  useEffect(() => {
    if (fontsReady) SplashScreen.hide();
  }, [fontsReady]);

  // The window behind every screen (seen during transitions and keyboard animations).
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(t.colors.bg);
  }, [t.colors.bg]);

  if (!fontsReady) return null; // the splash screen is still showing

  return (
    <QueryClientProvider client={queryClient}>
      {/* Light status bar text on the dark theme, dark text on the light theme. */}
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      <RootNavigator />
    </QueryClientProvider>
  );
}

// Route guards: which screens exist depends on whether you're signed in.
// Signed in  -> the (app) group, whose index is the home screen at "/".
// Signed out -> sign-in and sign-up. They live at the ROOT (not in a group) so that when
// "/" is unavailable, Expo Router has a real screen to fall back to: the first one listed.
// When the session changes, Expo Router moves you automatically.
function RootNavigator() {
  const { data: session, isPending } = authClient.useSession();
  const t = useTheme();

  if (isPending) {
    // Checking SecureStore for a saved session. Usually instant thanks to the cache.
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={t.colors.purple} />
      </View>
    );
  }

  const signedIn = !!session;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
    </Stack>
  );
}

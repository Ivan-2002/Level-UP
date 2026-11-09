import { ActivityIndicator, View } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";
import { colors } from "@/theme/colors";

// The root layout wraps EVERY screen. Providers placed here are available everywhere.
export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
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

  if (isPending) {
    // Checking SecureStore for a saved session. Usually instant thanks to the cache.
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.purple} />
      </View>
    );
  }

  const signedIn = !!session;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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

import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { useProfile } from "@/features/profile/use-profile";
import { Button } from "@/components/Button";
import { colors } from "@/theme/colors";

// Screens for signed-in users (the root layout already guarantees a session).
// Second guard: a signed-in user WITHOUT a profile only gets "Create your character".
// This asks the server instead of remembering "just signed up" on the phone, so it also
// catches someone who signed up, closed the app, and signs in again later.
// Tabs (Home, History, Progress, Profile) come later.
export default function AppLayout() {
  const { data: session } = authClient.useSession();
  const { data: profile, isPending, isError, error, refetch, isRefetching } = useProfile(session?.user.id);
  const queryClient = useQueryClient();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // forget cached data from this user
  }

  if (isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.purple} />
      </View>
    );
  }

  // A real failure (offline, server down). Don't guess: sending someone with a profile to
  // "Create your character" would only end in a confusing "You already have a character".
  if (isError) {
    return (
      <View style={[styles.centered, styles.errorBox]}>
        <Text style={styles.errorText}>{`Couldn't load your character. ${error.message}`}</Text>
        <Button label="Try again" onPress={() => refetch()} loading={isRefetching} />
        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </View>
    );
  }

  const hasProfile = profile !== null;

  // When hasProfile flips (character just created), the screen the player is on becomes
  // protected, and Expo Router moves them to the first screen that is available.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={hasProfile}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={!hasProfile}>
        <Stack.Screen name="create-character" />
      </Stack.Protected>
    </Stack>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  errorBox: { padding: 16, gap: 12, alignItems: "stretch" },
  errorText: { color: colors.danger, fontSize: 15, textAlign: "center" },
});

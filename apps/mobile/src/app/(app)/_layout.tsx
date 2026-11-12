import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { useProfile } from "@/features/profile/use-profile";
import { useSyncTimeZone } from "@/features/profile/use-sync-time-zone";
import { exercisesQuery } from "@/features/exercises/use-exercises";
import { useOutboxSync } from "@/features/workouts/outbox-sync";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { createStyles, useTheme } from "@/theme/use-theme";

// Screens for signed-in users (the root layout already guarantees a session).
// Second guard: a signed-in user WITHOUT a profile only gets "Create your character".
// This asks the server instead of remembering "just signed up" on the phone, so it also
// catches someone who signed up, closed the app, and signs in again later.
// Tabs (Home, History, Progress, Profile) come later.
export default function AppLayout() {
  const { data: session } = authClient.useSession();
  const { data: profile, isPending, isError, error, refetch, isRefetching } = useProfile(session?.user.id);
  const queryClient = useQueryClient();
  const styles = useStyles();
  const t = useTheme();

  // Keep sending finished workouts while signed in (stops on sign-out). Hooks must run
  // before any early return below: React needs the same hooks in the same order every render.
  useOutboxSync(session?.user.id);
  useSyncTimeZone(session?.user.id, profile);

  // Load the exercise library as soon as we're signed in, so it's saved on the phone
  // before the player is at the gym with no signal.
  useEffect(() => {
    if (session?.user.id) void queryClient.prefetchQuery(exercisesQuery);
  }, [session?.user.id, queryClient]);

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // forget cached data from this user
  }

  if (isPending) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={t.colors.purple} />
      </View>
    );
  }

  // A real failure (offline, server down). Don't guess: sending someone with a profile to
  // "Create your character" would only end in a confusing "You already have a character".
  if (isError) {
    return (
      <View style={[styles.centered, styles.errorBox]}>
        <Text tone="danger" style={styles.errorText}>{`Couldn't load your character. ${error.message}`}</Text>
        <Button label="Try again" onPress={() => refetch()} loading={isRefetching} />
        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </View>
    );
  }

  const hasProfile = profile !== null;

  // When hasProfile flips (character just created), the screen the player is on becomes
  // protected, and Expo Router moves them to the first screen that is available.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg } }}>
      <Stack.Protected guard={hasProfile}>
        <Stack.Screen name="index" />
        <Stack.Screen name="workout" />
        <Stack.Screen name="exercise-picker" options={{ presentation: "modal" }} />
        <Stack.Screen name="ui-preview" />
      </Stack.Protected>
      <Stack.Protected guard={!hasProfile}>
        <Stack.Screen name="create-character" />
      </Stack.Protected>
    </Stack>
  );
}

const useStyles = createStyles((t) => ({
  centered: { flex: 1, backgroundColor: t.colors.bg, alignItems: "center", justifyContent: "center" },
  errorBox: { padding: t.space[4], gap: t.space[3], alignItems: "stretch" },
  errorText: { textAlign: "center" },
}));

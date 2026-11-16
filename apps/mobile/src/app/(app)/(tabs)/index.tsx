import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { useHealth } from "@/features/health/use-health";
import { useProfile } from "@/features/profile/use-profile";
import { WeeklyGoalCard } from "@/features/progress/WeeklyGoalCard";
import { StartOrResumeWorkout, SyncStatus } from "@/features/workouts/HomeWorkoutCards";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { createStyles, useTheme } from "@/theme/use-theme";

// Temporary home: start/resume a workout, sync status, and the system check.
// The real Home screen (avatar, XP bar, body balance) replaces it in Milestone 5.
export default function Home() {
  const { data: session } = authClient.useSession();
  const { data: profile } = useProfile(session?.user.id); // already cached by the layout
  const { data, error, isPending } = useHealth();
  const queryClient = useQueryClient();
  const styles = useStyles();
  const t = useTheme();
  const userId = session?.user.id;

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // forget cached data from this user
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text variant="label" tone="inkMuted">
            Welcome back,
          </Text>
          <Text variant="display" accessibilityRole="header">
            {profile?.username ?? "Player"}
          </Text>
        </View>

        {userId ? (
          <>
            <WeeklyGoalCard userId={userId} />
            <StartOrResumeWorkout userId={userId} />
            <SyncStatus userId={userId} />
          </>
        ) : null}

        <Card>
          {isPending ? (
            <ActivityIndicator color={t.colors.purple} />
          ) : error ? (
            <Text tone="danger">API unreachable: {error.message}</Text>
          ) : (
            <Text tone="success">
              API {data.status} · Database {data.database}
            </Text>
          )}
        </Card>

        {/* Development builds only: a page showing every shared UI piece in both themes. */}
        {__DEV__ ? (
          <Button label="UI preview" variant="outline" tone="link" onPress={() => router.push("/ui-preview")} />
        ) : null}
        <Button label="Sign out" variant="outline" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.space[4], paddingTop: 20, gap: 14 },
}));

import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { AvatarHero } from "@/features/avatar/AvatarHero";
import { SystemCheckCard } from "@/features/health/SystemCheckCard";
import { useProfile } from "@/features/profile/use-profile";
import { useLevelUpPrompt } from "@/features/progress/use-celebration";
import { WeeklyGoalCard } from "@/features/progress/WeeklyGoalCard";
import { StartOrResumeWorkout, SyncStatus } from "@/features/workouts/HomeWorkoutCards";
import { Button } from "@/components/Button";
import { createStyles } from "@/theme/use-theme";

// Home: the avatar hero (the avatar, the username and the level bar) leads; below it the
// weekly goal, start/resume a workout and the sync status; in development builds also the
// system check and the UI preview. Before the beta Sign out moves to a settings screen
// (docs/ARCHITECTURE.md, roadmap).
export default function Home() {
  const { data: session } = authClient.useSession();
  const { data: profile } = useProfile(session?.user.id); // already cached by the layout
  const queryClient = useQueryClient();
  const styles = useStyles();
  const userId = session?.user.id;
  useLevelUpPrompt(userId, profile); // e.g. a workout synced while the app was closed

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // forget cached data from this user
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {userId && profile ? <AvatarHero userId={userId} profile={profile} /> : null}

        {userId ? (
          <>
            <WeeklyGoalCard userId={userId} />
            <StartOrResumeWorkout userId={userId} />
            <SyncStatus userId={userId} />
            <Button
              label="Log bodyweight"
              variant="secondary"
              icon="bodyweight"
              onPress={() => router.push("/log-bodyweight")}
            />
          </>
        ) : null}

        {/* Development builds only: the system check, and a page showing every shared UI piece in both themes. */}
        {__DEV__ ? (
          <>
            <SystemCheckCard />
            <Button label="UI preview" variant="outline" tone="link" onPress={() => router.push("/ui-preview")} />
          </>
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

import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useHealth } from "@/features/health/use-health";
import { useProfile } from "@/features/profile/use-profile";
import { StartOrResumeWorkout, SyncStatus } from "@/features/workouts/HomeWorkoutCards";
import { Button } from "@/components/Button";
import { colors } from "@/theme/colors";

// Temporary home: start/resume a workout, sync status, and the system check.
// The real Home screen (avatar, XP bar, body balance) replaces it in Milestone 5.
export default function Home() {
  const { data: session } = authClient.useSession();
  const { data: profile } = useProfile(session?.user.id); // already cached by the layout
  const { data, error, isPending } = useHealth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // forget cached data from this user
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.title}>{profile?.username ?? "Player"}</Text>
        </View>

        {userId ? (
          <>
            <StartOrResumeWorkout userId={userId} />
            <SyncStatus userId={userId} />
          </>
        ) : null}

        <View style={styles.card}>
          {isPending ? (
            <ActivityIndicator color={colors.purple} />
          ) : error ? (
            <Text style={{ color: colors.danger }}>API unreachable: {error.message}</Text>
          ) : (
            <Text style={{ color: colors.success }}>
              API {data.status} · Database {data.database}
            </Text>
          )}
        </View>

        <Button label="Sign out" variant="secondary" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingTop: 20, gap: 14 },
  greeting: { color: colors.inkMuted, fontSize: 13 },
  title: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: "700" },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 },
});

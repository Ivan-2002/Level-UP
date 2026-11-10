import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useHealth } from "@/features/health/use-health";
import { useProfile } from "@/features/profile/use-profile";
import { Button } from "@/components/Button";
import { colors } from "@/theme/colors";

// Temporary signed-in home: shows who you are plus the system check.
// The real Home screen (avatar, XP bar, body balance) replaces it in Milestone 5.
export default function Home() {
  const { data: session } = authClient.useSession();
  const { data: profile } = useProfile(session?.user.id); // already cached by the layout
  const { data, error, isPending } = useHealth();
  const queryClient = useQueryClient();

  async function signOut() {
    await authClient.signOut();
    queryClient.clear(); // forget cached data from this user
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>{profile ? `Hi, ${profile.username}` : "Signed in"}</Text>
      <Text style={styles.subtitle}>{session?.user.email}</Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 16, justifyContent: "center" },
  title: { color: colors.ink, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.inkMuted, fontSize: 15, marginTop: -8 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16 },
});

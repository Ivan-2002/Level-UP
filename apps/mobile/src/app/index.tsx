import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHealth } from "@/features/health/use-health";
import { colors } from "@/theme/colors";

// Temporary developer screen: proves phone -> API -> Postgres works.
// It is replaced by the real home screen in the auth milestone.
export default function Index() {
  const { data, error, isPending, isFetching, refetch } = useHealth();

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>LevelUp</Text>
      <Text style={styles.subtitle}>System check</Text>

      <View style={styles.card}>
        {isPending ? (
          <ActivityIndicator color={colors.purple} />
        ) : error ? (
          <>
            <StatusRow label="API" value="unreachable" good={false} />
            <Text style={styles.errorText}>{error.message}</Text>
          </>
        ) : (
          <>
            <StatusRow label="API" value={data.status} good={data.status === "ok"} />
            <StatusRow label="Database" value={data.database} good={data.database === "up"} />
            <Text style={styles.meta}>API uptime: {data.uptimeSeconds}s</Text>
          </>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={() => refetch()}
        disabled={isFetching}
        style={({ pressed }) => [styles.button, (pressed || isFetching) && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>{isFetching ? "Checking..." : "Check again"}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function StatusRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color: good ? colors.success : colors.danger }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: 16, gap: 16, justifyContent: "center" },
  title: { color: colors.ink, fontSize: 32, fontWeight: "700" },
  subtitle: { color: colors.inkMuted, fontSize: 15, marginTop: -12 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    minHeight: 120,
    justifyContent: "center",
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { color: colors.ink, fontSize: 15 },
  rowValue: { fontSize: 15, fontWeight: "600" },
  meta: { color: colors.inkMuted, fontSize: 12 },
  errorText: { color: colors.inkMuted, fontSize: 13 },
  button: { backgroundColor: colors.primary, borderRadius: 12, height: 52, alignItems: "center", justifyContent: "center" },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
});

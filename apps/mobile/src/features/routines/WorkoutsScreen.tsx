import { ActivityIndicator, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import type { RoutineSummary } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { Text } from "@/components/Text";
import { authClient } from "@/lib/auth-client";
import { createStyles, useTheme } from "@/theme/use-theme";
import { StartOrResumeWorkout } from "@/features/workouts/HomeWorkoutCards";
import { formatLastDone, plural } from "@/features/workouts/format";
import { useRoutines } from "./use-routines";

// The Workouts tab: "New routine" (the main action), "Start empty workout", and your saved routines.
export function WorkoutsScreen() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const routines = useRoutines(userId);
  const styles = useStyles();
  const t = useTheme();
  const items = routines.data?.items;

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={routines.isRefetching} onRefresh={() => void routines.refetch()} tintColor={t.colors.purple} />}
      >
        <Text variant="display" accessibilityRole="header">
          Workouts
        </Text>

        {/* The one primary action is building a routine; a workout without one is secondary.
            The same two buttons, in the same order, with or without routines. */}
        <Button label="New routine" icon="plus" onPress={() => router.push("/routines/new")} />
        <StartOrResumeWorkout userId={userId} label="Start empty workout" variant="secondary" />

        <View style={styles.sectionHeader}>
          <Text variant="labelStrong" tone="inkMuted">
            Routines
          </Text>
        </View>

        {items === undefined ? (
          routines.isError ? (
            <Card>
              <Text tone="inkMuted">{"Couldn't load your routines. Connect once and they're saved on this phone."}</Text>
              <Button label="Try again" variant="secondary" size="md" onPress={() => routines.refetch()} />
            </Card>
          ) : (
            <ActivityIndicator color={t.colors.purple} />
          )
        ) : items.length === 0 ? (
          <EmptyRoutines />
        ) : (
          items.map((routine) => <RoutineRow key={routine.id} routine={routine} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function RoutineRow({ routine }: { routine: RoutineSummary }) {
  const styles = useStyles();
  const t = useTheme();
  const meta = `${plural(routine.exerciseCount, "exercise")} · ${formatLastDone(routine.lastDoneAt, new Date())}`;
  return (
    <Card
      onPress={() => router.push({ pathname: "/routines/[id]", params: { id: routine.id } })}
      accessibilityLabel={`${routine.name}, ${meta}`}
      style={styles.routineRow}
    >
      <View style={styles.flex}>
        <Text variant="heading" numberOfLines={1}>
          {routine.name}
        </Text>
        <Text variant="label" tone="inkMuted">
          {meta}
        </Text>
      </View>
      <Icon name="forward" size={18} color={t.colors.inkMuted} />
    </Card>
  );
}

// No button of its own: "New routine" above is the way to create one.
function EmptyRoutines() {
  return (
    <Card>
      <Text variant="heading">No routines yet</Text>
      <Text tone="inkMuted">
        Tap New routine to save the workouts you repeat, like a push day, and start them with one tap. Last time&apos;s numbers come with them.
      </Text>
    </Card>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.space[4], gap: t.space[3], paddingBottom: t.space[8] },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: t.space[3] },
  routineRow: { flexDirection: "row", alignItems: "center" },
  flex: { flex: 1, gap: 2 },
}));


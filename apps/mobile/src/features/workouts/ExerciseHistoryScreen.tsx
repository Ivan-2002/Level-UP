import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { formatWeight, type ExerciseSummary, type WeightUnit } from "@levelup/shared";
import { Card } from "@/components/Card";
import { Chip, InfoChip } from "@/components/Chip";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { authClient } from "@/lib/auth-client";
import { createStyles } from "@/theme/use-theme";
import { useProfile } from "@/features/profile/use-profile";
import { E1rmChart } from "./E1rmChart";
import { changeText, prSets, RANGES, sessionLine, trend, type Range } from "./exercise-history";
import { capitalise, formatLastDone, formatSet, plural } from "./format";
import { previousSetText } from "./live-workout";
import { volumeText } from "./summary-view";
import { HISTORY_SESSIONS, useExerciseSummary } from "./use-exercise-summary";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

// One exercise's records, trend and recent sessions. Everything is calculated from the
// logged sets (on the server, and PR highlights here with the same shared rules).
export function ExerciseHistoryScreen({ exerciseId }: { exerciseId: string }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { data: profile } = useProfile(userId);
  const history = useExerciseSummary(userId, exerciseId, HISTORY_SESSIONS);
  const [range, setRange] = useState<Range>("3M");
  const styles = useStyles();
  const unit = profile?.weightUnit ?? "kg";
  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!history.data) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScreenHeader title="History" onBack={back} />
        <View style={styles.centered}>
          {history.isError ? <Text tone="inkMuted">{"Couldn't load this exercise's history. Check your connection."}</Text> : <ActivityIndicator />}
        </View>
      </SafeAreaView>
    );
  }

  const { exercise, sessions } = history.data;
  const timed = exercise.repsUnit === "seconds";
  const count = sessions.length >= HISTORY_SESSIONS ? `${HISTORY_SESSIONS}+` : String(sessions.length);
  const chart = trend(sessions, range, new Date());
  const prFlags = prSets(sessions, exercise);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScreenHeader
        title={exercise.name}
        subtitle={`${capitalise(exercise.bodyPart)} · ${exercise.equipment} · ${count} ${sessions.length === 1 ? "session" : "sessions"} logged`}
        onBack={back}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {sessions.length === 0 ? (
          <Card>
            <Text variant="heading">No sessions yet</Text>
            <Text tone="inkMuted">Your records and trend appear here after you log this exercise.</Text>
          </Card>
        ) : (
          <>
            <View style={styles.section}>
              <Text variant="heading">Personal records</Text>
              <Records summary={history.data} unit={unit} />
            </View>

            {!timed ? (
              <Card>
                <View style={styles.chartHeader}>
                  <View style={styles.flex}>
                    <Text variant="heading">Estimated 1RM</Text>
                    {chart.changeKg !== null ? (
                      <Text variant="captionStrong" tone={chart.changeKg > 0 ? "success" : "inkMuted"}>
                        {changeText(chart.changeKg, chart.weeks, unit)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.ranges} accessibilityRole="radiogroup" accessibilityLabel="Chart range">
                    {RANGES.map((r) => (
                      <Chip key={r} label={r} role="radio" selected={r === range} onPress={() => setRange(r)} />
                    ))}
                  </View>
                </View>
                {chart.bars.length > 0 ? (
                  <E1rmChart bars={chart.bars} unit={unit} title={null} divider={false} />
                ) : (
                  <Text variant="label" tone="inkMuted">
                    No sessions in this range.
                  </Text>
                )}
              </Card>
            ) : null}

            <View style={styles.section}>
              <Text variant="heading">Recent sessions</Text>
              {sessions.slice(0, 20).map((s) => {
                const flags = prFlags.get(s.workoutId) ?? [];
                const day = formatLastDone(s.startedAt, new Date());
                return (
                  <Card key={s.workoutId}>
                    <View style={styles.sessionTop}>
                      <Text variant="bodyStrong">{day === "Today" || day === "Yesterday" ? day : shortDate(s.startedAt)}</Text>
                      <Text variant="caption" tone="inkMuted" tabular>
                        {sessionLine(s, exercise, unit)}
                      </Text>
                    </View>
                    <View style={styles.sets}>
                      {s.sets.map((set, i) =>
                        flags[i] ? (
                          <InfoChip key={i} icon="pr" tone="progress" value={`${previousSetText(s.sets, i, exercise, unit)} PR`} />
                        ) : (
                          <InfoChip key={i} value={previousSetText(s.sets, i, exercise, unit)} />
                        ),
                      )}
                    </View>
                  </Card>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The four record tiles. Values are in the player's unit; dates say when. */
function Records({ summary, unit }: { summary: ExerciseSummary; unit: WeightUnit }) {
  const styles = useStyles();
  const { exercise, records } = summary;
  const timed = exercise.repsUnit === "seconds";
  const tiles: { label: string; value: string; note: string; highlight?: boolean }[] = [];

  if (!timed) {
    tiles.push({
      label: "Best est. 1RM",
      value: records.bestE1rm ? formatWeight(records.bestE1rm.value, unit, { decimals: 0 }) : "—",
      note: records.bestE1rm ? shortDate(records.bestE1rm.date) : "",
      highlight: true,
    });
  }
  tiles.push({
    label: "Heaviest set",
    value: records.heaviestSet ? formatSet(records.heaviestSet, exercise, unit) : "—",
    note: records.heaviestSet ? shortDate(records.heaviestSet.date) : "",
  });
  if (!timed) {
    tiles.push({
      label: "Best session volume",
      value: records.bestSessionVolume ? `${volumeText(records.bestSessionVolume.volumeKg, unit)} ${unit}` : "—",
      note: records.bestSessionVolume ? shortDate(records.bestSessionVolume.date) : "",
    });
  }
  tiles.push({
    label: timed ? "Longest hold" : records.mostReps ? `Most reps at ${formatWeight(records.mostReps.weightKg, unit, { bodyweight: exercise.equipment === "bodyweight" })}` : "Most reps",
    value: records.mostReps ? (timed ? `${records.mostReps.reps} s` : plural(records.mostReps.reps, "rep")) : "—",
    note: records.mostReps ? shortDate(records.mostReps.date) : "",
  });

  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => (
        <View key={tile.label} style={[styles.tile, tile.highlight && styles.tileHighlight]} accessible accessibilityLabel={`${tile.label}: ${tile.value}${tile.note ? `, ${tile.note}` : ""}`}>
          <Text variant="caption" tone="inkMuted" numberOfLines={1}>
            {tile.label}
          </Text>
          <Text variant="value" tone={tile.highlight && tile.value !== "—" ? "purple" : "ink"} tabular numberOfLines={1} adjustsFontSizeToFit>
            {tile.value}
          </Text>
          <Text variant="caption" tone="inkMuted">
            {tile.note}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: t.space[4] },
  flex: { flex: 1, minWidth: 0 },
  content: { paddingHorizontal: t.space[4], paddingBottom: t.space[8], gap: t.space[6] },
  section: { gap: t.space[3] },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: t.space[2] },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: t.colors.surface,
    borderWidth: 1,
    borderColor: t.colors.border,
    borderRadius: t.radius.md,
    padding: t.space[3],
    gap: t.space[1],
  },
  tileHighlight: { borderColor: t.colors.purple },
  chartHeader: { flexDirection: "row", alignItems: "center", gap: t.space[2] },
  ranges: { flexDirection: "row", gap: t.space[1] },
  sessionTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: t.space[2] },
  sets: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
}));

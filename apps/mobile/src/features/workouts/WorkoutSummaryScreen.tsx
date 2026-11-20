import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BODYWEIGHT_FALLBACK_KG, goalProgressText, streakText, type FinishSummary, type LevelStatus, type WeightUnit } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { StatTile } from "@/components/StatTile";
import { Text } from "@/components/Text";
import { authClient } from "@/lib/auth-client";
import { useFinishedWorkout, useOutbox } from "@/stores/device-stores";
import { createStyles, useTheme } from "@/theme/use-theme";
import { useProfile } from "@/features/profile/use-profile";
import type { ActiveWorkout } from "./active-workout";
import { formatElapsed, plural } from "./format";
import type { SavedPreview } from "./live-workout";
import { compareCount, compareDuration, compareVolume, levelBar, pendingLevelBar, prHeading, prLine, previewSummary, volumeText } from "./summary-view";

function done() {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

// "Push day complete": what the workout earned. The numbers come from the server once
// the workout has synced (it is the only one that awards XP); until then, the phone
// shows what it can work out itself and says the rest is on its way.
export function WorkoutSummaryScreen() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { data: profile } = useProfile(userId);
  const last = useFinishedWorkout((s) => s.last);
  const outboxItem = useOutbox((s) => s.items.find((i) => i.clientId === last?.clientId));
  const styles = useStyles();
  const t = useTheme();

  if (!last || last.userId !== userId) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <Text tone="inkMuted">No finished workout to show.</Text>
        <Button label="Done" onPress={done} />
      </SafeAreaView>
    );
  }

  const unit = profile?.weightUnit ?? last.workout.weightUnit;
  const summary = last.response?.summary ?? null;
  const preview = previewSummary(last.workout, last.finishedAt, profile?.bodyweightKg ?? BODYWEIGHT_FALLBACK_KG);
  const failed = outboxItem?.status === "needs_attention";
  const title = last.workout.name.trim() ? `${last.workout.name.trim()} complete` : "Workout complete";
  const date = new Date(last.workout.startedAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.status} accessibilityLiveRegion="polite">
            <Icon name={summary ? "check" : failed ? "alert" : "sync"} size={16} color={summary ? t.colors.success : failed ? t.colors.danger : t.colors.ice} />
            <Text variant="labelStrong" tone={summary ? "success" : failed ? "danger" : "ice"}>
              {summary ? "Workout saved" : failed ? "The server didn't accept this workout" : "Saved on this phone"}
            </Text>
          </View>
          <Text variant="display" accessibilityRole="header">
            {title}
          </Text>
          <Text variant="label" tone="inkMuted">
            {date} · {plural(last.workout.exercises.length, "exercise")}
          </Text>
          {!summary ? (
            <Text variant="caption" tone="inkMuted">
              {failed
                ? `${outboxItem?.lastError ?? "It was rejected."} You can retry or delete it from Home.`
                : "XP, records and your level are confirmed when it reaches the server. This updates by itself."}
            </Text>
          ) : null}
        </View>

        {summary ? <XpCard summary={summary} /> : <PreviewXp preview={last.preview} levelBefore={last.levelBefore} failed={failed} />}

        <View style={styles.tiles}>
          <StatTile
            label="Duration"
            value={formatElapsed((summary?.stats.durationSec ?? preview.durationSec) * 1000)}
            note={summary ? compareDuration(summary.stats.durationSec, summary.stats.previous?.durationSec ?? null)?.text : undefined}
          />
          <StatTile
            label="Sets"
            value={String(summary?.stats.setCount ?? preview.setCount)}
            note={summary ? compareCount(summary.stats.setCount, summary.stats.previous?.setCount ?? null)?.text : undefined}
          />
          <VolumeTile summary={summary} previewKg={preview.volumeKg} unit={unit} />
        </View>

        {summary && summary.prs.length > 0 ? <PrList prs={summary.prs} workout={last.workout} unit={unit} /> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Done" onPress={done} />
      </View>
    </SafeAreaView>
  );
}

function XpCard({ summary }: { summary: FinishSummary }) {
  const styles = useStyles();
  const bar = levelBar(summary.level.totalXpBefore, summary.level.totalXpAfter);
  const goal = summary.weeklyGoal;
  const rows: [string, number][] = [
    ["Sets and reps", summary.xp.sets],
    ["Weekly goal met", summary.xp.weeklyGoal],
    [`${goal?.streak ?? ""}-week streak bonus`, summary.xp.streakMilestone],
  ];

  return (
    <View style={styles.xpCard}>
      <View style={styles.xpTop}>
        <View>
          <Text variant="caption" tone="inkMuted">
            XP earned
          </Text>
          <Text variant="display" tone="purple" tabular>
            +{summary.xp.total}
          </Text>
        </View>
        <View style={styles.levelPill}>
          <Text variant="labelStrong" tone="purple">
            Level {bar.level}
          </Text>
        </View>
      </View>
      {bar.leveledUp ? (
        <Text variant="bodyStrong" tone="purple" accessibilityLiveRegion="polite">
          Level up! You reached level {bar.level}.
        </Text>
      ) : null}
      <View style={styles.barWrap}>
        <View style={styles.barTrack} accessible accessibilityRole="progressbar" accessibilityLabel={`${bar.progressText} toward level ${bar.level + 1}`}>
          <View style={[styles.barBefore, { width: `${bar.before * 100}%` }]} />
          <View style={[styles.barGained, { width: `${bar.gained * 100}%` }]} />
        </View>
        <View style={styles.barText}>
          <Text variant="captionStrong" tabular>
            {bar.progressText}
          </Text>
          <Text variant="caption" tone="inkMuted" tabular>
            {bar.toNextText}
          </Text>
        </View>
      </View>
      <View style={styles.breakdown}>
        {rows
          .filter(([, amount], i) => i === 0 || amount > 0)
          .map(([label, amount]) => (
            <View key={label} style={styles.breakdownRow}>
              <Text variant="label" tone="inkMuted">
                {label}
              </Text>
              <Text variant="labelStrong" tabular>
                +{amount}
              </Text>
            </View>
          ))}
        {goal ? (
          <Text variant="caption" tone="inkMuted">
            {goalProgressText(goal)} · {streakText(goal)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Before the server answers: the live score saved at Finish, labelled as an estimate, with
 * the level bar's pending segment. Never "Level up!": only the server's answer says that.
 */
function PreviewXp({ preview, levelBefore, failed }: { preview: SavedPreview | null; levelBefore: LevelStatus | null; failed: boolean }) {
  const styles = useStyles();
  if (!preview) {
    // Saved by an older app version, or no history was ever pinned: no estimate to show.
    return (
      <View style={styles.xpCard}>
        <Text variant="caption" tone="inkMuted">
          {failed ? "No XP: the server didn't accept this workout." : "XP is confirmed when it syncs."}
        </Text>
      </View>
    );
  }
  // A rejected workout earns nothing, so it gets no bar; its estimate says it wasn't awarded.
  const bar = levelBefore && !failed ? pendingLevelBar(levelBefore, preview.setXp) : null;
  return (
    <View style={styles.xpCard}>
      <View style={styles.xpTop}>
        <View>
          <Text variant="caption" tone="inkMuted">
            {failed ? "XP for sets · estimate, not awarded" : "XP for sets · estimate"}
          </Text>
          <Text variant="display" tone="purple" tabular>
            +{preview.setXp}
          </Text>
        </View>
        {bar ? (
          <View style={styles.levelPill}>
            <Text variant="labelStrong" tone="purple">
              Level {bar.level}
            </Text>
          </View>
        ) : null}
      </View>
      {bar ? (
        <View style={styles.barWrap}>
          <View
            style={styles.barTrack}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Estimate: ${bar.progressText} toward level ${bar.level + 1}. ${bar.toNextText}.`}
          >
            <View style={[styles.barBefore, { width: `${bar.before * 100}%` }]} />
            <View style={[styles.barPending, { width: `${bar.pending * 100}%` }]} />
          </View>
          <View style={styles.barText}>
            <Text variant="captionStrong" tabular>
              {bar.progressText}
            </Text>
            <Text variant="caption" tone="inkMuted" tabular>
              {bar.toNextText}
            </Text>
          </View>
        </View>
      ) : null}
      {preview.heldBack > 0 ? (
        <Text variant="caption" tone="inkMuted">
          About {preview.heldBack.toLocaleString("en-US")} XP held back: daily limit reached.
        </Text>
      ) : null}
      <Text variant="caption" tone="inkMuted">
        Weekly goal and streak bonuses are added when it syncs.
      </Text>
    </View>
  );
}

function VolumeTile({ summary, previewKg, unit }: { summary: FinishSummary | null; previewKg: number; unit: WeightUnit }) {
  const kg = summary?.stats.volumeKg ?? previewKg;
  const comparison = summary ? compareVolume(summary.stats.volumeKg, summary.stats.previous?.volumeKg ?? null) : null;
  return <StatTile label="Volume" value={volumeText(kg, unit)} suffix={` ${unit}`} note={comparison?.text} noteGood={comparison?.better} />;
}

function PrList({ prs, workout, unit }: { prs: FinishSummary["prs"]; workout: ActiveWorkout; unit: WeightUnit }) {
  const styles = useStyles();
  const t = useTheme();
  const exercises = new Map(workout.exercises.map((e) => [e.exercise.id, e.exercise]));
  return (
    <View style={styles.prs}>
      <Text variant="heading">{prHeading(prs.length)}</Text>
      <Card style={styles.prCard}>
        {prs.map((pr, i) => {
          const line = prLine(pr, exercises.get(pr.exerciseId), unit);
          return (
            <View key={`${pr.exerciseId}-${pr.kind}`} style={[styles.prRow, i > 0 && styles.prDivider]} accessible accessibilityLabel={`${pr.exerciseName}, ${line.detail}: ${line.value}, ${line.was}`}>
              <View style={styles.prIcon}>
                <Icon name="pr" size={18} color={t.colors.purple} />
              </View>
              <View style={styles.flex}>
                <Text variant="bodyStrong">{pr.exerciseName}</Text>
                <Text variant="caption" tone="inkMuted" tabular>
                  {line.detail}
                </Text>
              </View>
              <View style={styles.prValue}>
                <Text variant="heading" tone="purple" tabular>
                  {line.value}
                </Text>
                <Text variant="caption" tone="inkMuted" tabular>
                  {line.was}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  centered: { alignItems: "center", justifyContent: "center", gap: t.space[4], padding: t.space[4] },
  flex: { flex: 1, minWidth: 0 },
  content: { padding: t.space[4], paddingTop: t.space[6], gap: t.space[6] },
  header: { gap: t.space[1] },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  xpCard: { backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, borderRadius: t.radius.xl, padding: t.space[4], gap: t.space[4] },
  xpTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  levelPill: { height: 28, paddingHorizontal: t.space[3], borderRadius: t.radius.pill, backgroundColor: t.colors.purpleSoft, justifyContent: "center" },
  barWrap: { gap: 6 },
  barTrack: { height: 10, borderRadius: t.radius.pill, backgroundColor: t.colors.purpleSoft, overflow: "hidden", flexDirection: "row" },
  barBefore: { height: 10, backgroundColor: t.colors.purple },
  barGained: { height: 10, backgroundColor: t.colors.ice },
  // The estimate: the gained colour, lighter, so it reads as not yet confirmed.
  barPending: { height: 10, backgroundColor: t.colors.ice, opacity: 0.45 },
  barText: { flexDirection: "row", justifyContent: "space-between" },
  breakdown: { gap: t.space[2], borderTopWidth: 1, borderTopColor: t.colors.border, paddingTop: t.space[3] },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  tiles: { flexDirection: "row", gap: t.space[2] },
  prs: { gap: t.space[3] },
  prCard: { padding: 0, gap: 0 },
  prRow: { flexDirection: "row", alignItems: "center", gap: t.space[3], paddingVertical: t.space[3], paddingHorizontal: t.space[4] },
  prDivider: { borderTopWidth: 1, borderTopColor: t.colors.border },
  prIcon: { width: 36, height: 36, borderRadius: t.radius.pill, backgroundColor: t.colors.purpleSoft, alignItems: "center", justifyContent: "center" },
  prValue: { alignItems: "flex-end" },
  footer: { paddingHorizontal: t.space[4], paddingTop: t.space[3], paddingBottom: t.space[2] },
}));

import { ActivityIndicator, View } from "react-native";
import { goalProgressText, streakText, WEEKLY_GOAL } from "@levelup/shared";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { ProgressSegments } from "@/components/ProgressSegments";
import { Text } from "@/components/Text";
import { createStyles, useTheme } from "@/theme/use-theme";
import { useWeeklyGoal } from "./use-weekly-goal";

/** Home: "2 of 3 days this week" with one segment per day, and the streak. */
export function WeeklyGoalCard({ userId }: { userId: string }) {
  const { data: goal, isError } = useWeeklyGoal(userId);
  const styles = useStyles();
  const t = useTheme();

  if (!goal) {
    // Loading, waiting for the outbox, or offline: a quiet placeholder, not an error card.
    return (
      <Card>
        <Text variant="label" tone="inkMuted">
          This week
        </Text>
        {isError ? (
          <Text variant="caption" tone="inkMuted">
            {"Your weekly goal shows when you're back online."}
          </Text>
        ) : (
          <ActivityIndicator color={t.colors.purple} />
        )}
      </Card>
    );
  }

  const days = Array.from({ length: goal.target }, (_, i) => ({ total: 1, done: i < goal.daysTrained ? 1 : 0 }));
  return (
    <Card accessibilityLabel={`${goalProgressText(goal)}. ${streakText(goal)}.`}>
      <View style={styles.header}>
        <Text variant="label" tone="inkMuted">
          This week
        </Text>
        {goal.met ? (
          <Text variant="captionStrong" tone="purple">
            +{WEEKLY_GOAL.weeklyBonusXp} XP earned
          </Text>
        ) : null}
      </View>
      <Text variant="heading" tabular>
        {goalProgressText(goal)}
      </Text>
      {/* Current index past the end: every segment is "other" (muted) or "complete" (green). */}
      {goal.kind === "goal" ? <ProgressSegments segments={days} currentIndex={goal.target} accessibilityLabel={goalProgressText(goal)} /> : null}
      <View style={styles.streak}>
        <Icon name="pr" size={16} color={t.colors.purple} />
        <Text variant="label" tone="purple" tabular>
          {streakText(goal)}
        </Text>
      </View>
    </Card>
  );
}

const useStyles = createStyles((t) => ({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  streak: { flexDirection: "row", alignItems: "center", gap: t.space[2] },
}));

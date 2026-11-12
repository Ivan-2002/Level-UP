import { useState } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { formatWeight, fromInputWeight } from "@levelup/shared";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { AddChip, Chip, InfoChip } from "@/components/Chip";
import { IconButton } from "@/components/IconButton";
import { ProgressSegments } from "@/components/ProgressSegments";
import { SetRow, SetTableHeader } from "@/components/SetRow";
import { StatTile } from "@/components/StatTile";
import { Text } from "@/components/Text";
import { ElapsedTimer } from "@/features/workouts/ElapsedTimer";
import { settingsStore, useSettings } from "@/stores/device-stores";
import type { ThemePreference } from "@/stores/settings-store";
import { createStyles, useTheme } from "@/theme/use-theme";
import type { Palette, TypeVariant } from "@/theme/tokens";

// Development only (the route redirects in release builds): every shared UI piece, live,
// so a design change can be checked by eye in both themes without clicking through the app.

const THEMES: ThemePreference[] = ["dark", "light", "system"];
const TYPE_STEPS: TypeVariant[] = ["display", "stat", "title", "heading", "value", "body", "label", "caption"];
const SWATCHES: (keyof Palette)[] = ["bg", "surface", "surfaceRaised", "border", "ink", "inkMuted", "primary", "purple", "purpleSoft", "ice", "success", "warning", "danger"];

type DemoSet = { weight: string; reps: string; done: boolean };

export function UiPreviewScreen() {
  const styles = useStyles();
  const t = useTheme();
  const preference = useSettings((s) => s.themePreference);
  const [startedAt] = useState(() => new Date(Date.now() - 42 * 60_000 - 18_000).toISOString());
  const [tab, setTab] = useState(1);
  const [sets, setSets] = useState<DemoSet[]>([
    { weight: "62.5", reps: "8", done: true },
    { weight: "62.5", reps: "7", done: false },
    { weight: "62.5", reps: "7", done: false },
  ]);

  const update = (i: number, change: Partial<DemoSet>) => setSets((all) => all.map((s, j) => (j === i ? { ...s, ...change } : s)));
  const done = sets.filter((s) => s.done).length;
  const exercises = [
    { name: "Incline DB press", total: 4, done: 4 },
    { name: "Bench press", total: sets.length, done },
    { name: "Overhead press", total: 4, done: 0 },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <IconButton icon="back" onPress={() => router.back()} accessibilityLabel="Back" />
          <Text variant="title" accessibilityRole="header">
            UI preview
          </Text>
        </View>

        <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Theme">
          {THEMES.map((p) => (
            <Chip key={p} label={p} role="radio" selected={p === preference} onPress={() => settingsStore.getState().setThemePreference(p)} />
          ))}
        </View>

        <Section title="Type">
          {TYPE_STEPS.map((v) => (
            <Text key={v} variant={v} tabular>
              {v} 12:08 · 62.5
            </Text>
          ))}
        </Section>

        <Section title="Colours">
          <View style={styles.wrap}>
            {SWATCHES.map((k) => (
              <View key={k} style={styles.swatchItem}>
                <View style={[styles.swatch, { backgroundColor: t.colors[k] }]} />
                <Text variant="caption" tone="inkMuted">
                  {k}
                </Text>
              </View>
            ))}
          </View>
        </Section>

        <Section title="Stat tiles and progress">
          <View style={styles.row}>
            <StatTile label="Elapsed" icon="timer" value={<ElapsedTimer startedAt={startedAt} />} />
            <StatTile label="Sets left" value={String(11 - done - 4)} suffix=" / 11" />
            <StatTile label="XP earned" icon="xp" tone="progress" value={`+${40 * (done + 4)}`} />
          </View>
          <ProgressSegments segments={exercises} currentIndex={tab} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {exercises.map((e, i) => (
              <Chip key={e.name} label={e.name} role="tab" selected={i === tab} count={`${e.done}/${e.total}`} done={e.done === e.total} onPress={() => setTab(i)} />
            ))}
            <AddChip onPress={() => {}} accessibilityLabel="Add exercise to this workout" />
          </ScrollView>
        </Section>

        <Section title="Exercise card">
          <Card>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Text variant="title">Bench press</Text>
                <Text variant="label" tone="inkMuted">
                  Chest · Barbell
                </Text>
              </View>
              <IconButton icon="history" onPress={() => {}} accessibilityLabel="Exercise history" />
            </View>
            <View style={styles.wrap}>
              <InfoChip label="Last week" value="60 kg × 8, 8, 7, 8" />
              <InfoChip icon="pr" tone="progress" value="PR est. 1RM 76 kg" />
            </View>
            <View>
              <SetTableHeader weightUnit="kg" repsUnit="reps" previousLabel="Last week" />
              {sets.map((s, i) => (
                <SetRow
                  key={i}
                  number={i + 1}
                  previous="60 × 8"
                  weight={s.weight}
                  reps={s.reps}
                  onChangeWeight={(weight) => update(i, { weight })}
                  onChangeReps={(reps) => update(i, { reps })}
                  weightUnit="kg"
                  repsUnit="reps"
                  done={s.done}
                  onToggleDone={() => update(i, { done: !s.done })}
                  prText={s.done && i === 0 ? "New PR · est. 1RM 79 kg" : undefined}
                  error={i === 2 && s.reps === "" ? "Enter reps first." : undefined}
                />
              ))}
            </View>
            <Button
              label="Add set"
              icon="plus"
              variant="dashed"
              size="md"
              onPress={() => setSets((all) => [...all, { ...all[all.length - 1]!, done: false }])}
            />
          </Card>
          <Text variant="caption" tone="inkMuted">
            In lb: {formatWeight(fromInputWeight(135, "lb"), "lb")} · bodyweight {formatWeight(fromInputWeight(25, "lb"), "lb", { bodyweight: true })}
          </Text>
        </Section>

        <Section title="Buttons">
          <Button label="Primary" onPress={() => {}} />
          <Button label="Loading" onPress={() => {}} loading />
          <Button label="Disabled" onPress={() => {}} disabled />
          <View style={styles.row}>
            <Button label="Finish" variant="secondary" size="md" onPress={() => {}} />
            <Button label="Skip" variant="outline" size="md" onPress={() => {}} />
            <Button label="Add exercise" icon="plus" variant="outline" tone="link" size="md" onPress={() => {}} />
          </View>
          <Button label="Discard workout" variant="plain" tone="danger" size="md" onPress={() => {}} />
          <Card onPress={() => {}} accessibilityLabel="Up next, Overhead press">
            <Text variant="caption" tone="inkMuted">
              Up next
            </Text>
            <Text variant="heading">Overhead press</Text>
          </Card>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text variant="labelStrong" tone="inkMuted">
        {title}
      </Text>
      {children}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { padding: t.space[4], gap: t.space[6], paddingBottom: t.space[8] },
  section: { gap: t.space[3] },
  row: { flexDirection: "row", alignItems: "center", gap: t.space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space[2] },
  flex: { flex: 1 },
  swatchItem: { width: 72, gap: t.space[1] },
  swatch: { height: 32, borderRadius: t.radius.sm, borderWidth: 1, borderColor: t.colors.border },
}));

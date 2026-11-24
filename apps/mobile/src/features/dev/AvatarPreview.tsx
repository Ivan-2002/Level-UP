import { useState } from "react";
import { ScrollView, View } from "react-native";
import Slider from "@react-native-community/slider";
import { BODY_PARTS, type BodyPart } from "@levelup/shared";
import { Avatar, ROOKIE_LOOK, type AvatarLook } from "@/components/Avatar";
import {
  DEFAULT_FACE,
  EXPRESSIONS,
  FACE_PRESETS,
  FACE_SLOTS,
  resolveFace,
  type Expression,
  type Face,
  type FaceSlot,
} from "@/components/avatar-face";
import type { Development } from "@/components/avatar-shape";
import { Chip } from "@/components/Chip";
import { Text } from "@/components/Text";
import { palettes, type ColorScheme } from "@/theme/tokens";
import { createStyles, useTheme } from "@/theme/use-theme";

// The UI preview's Avatar section (development only): judge the stickman's shapes without
// logging workouts. A slider per body part, a stage picker, the face's default and one
// alternative per slot, the expression, both themes side by side, both sizes (40 px is the
// head-and-shoulders crop), and the first 12 weeks of a real player.

/**
 * The stages and their cumulative extras, as Milestone 6a's migration will insert them into
 * avatar_stage (docs/ARCHITECTURE.md). Here only to preview them; the app gets the real ones
 * from the API.
 */
const PREVIEW_STAGES: { name: string; extras: string[] }[] = [
  { name: "Rookie", extras: [] },
  { name: "Regular", extras: ["wristbands"] },
  { name: "Athlete", extras: ["wristbands", "outfit"] },
  { name: "Champion", extras: ["wristbands", "outfit", "headband"] },
  { name: "Legend", extras: ["wristbands", "outfit", "headband", "cape"] },
];

/**
 * The simulated intermediate (80 kg, 3×/week push/pull/legs) at the end of each of its first
 * 12 weeks, from the Milestone 6 plan's prototype of the development rule. Milestone 6a's
 * simulation reproduces these numbers; replace them with its output then.
 */
const FIRST_12_WEEKS: Record<BodyPart, readonly number[]> = {
  chest: [0, 0.027, 0.053, 0.079, 0.104, 0.128, 0.152, 0.174, 0.197, 0.218, 0.24, 0.26, 0.28],
  back: [0, 0.032, 0.063, 0.093, 0.122, 0.151, 0.178, 0.204, 0.23, 0.255, 0.279, 0.302, 0.324],
  shoulders: [0, 0.029, 0.056, 0.083, 0.109, 0.135, 0.159, 0.183, 0.207, 0.229, 0.251, 0.273, 0.294],
  arms: [0, 0.021, 0.042, 0.062, 0.082, 0.101, 0.12, 0.139, 0.157, 0.175, 0.192, 0.209, 0.226],
  core: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  legs: [0, 0.037, 0.072, 0.106, 0.139, 0.171, 0.201, 0.23, 0.259, 0.286, 0.312, 0.337, 0.362],
};
const weekDevelopment = (week: number) =>
  Object.fromEntries(BODY_PARTS.map((p) => [p, FIRST_12_WEEKS[p][week]!])) as Development;

const SCHEMES: ColorScheme[] = ["dark", "light"];

export function AvatarPreview() {
  const styles = useStyles();
  const t = useTheme();
  const [development, setDevelopment] = useState<Development>({ ...ROOKIE_LOOK.development });
  const [stage, setStage] = useState(0);
  const [face, setFace] = useState<Face>(DEFAULT_FACE);
  const [expression, setExpression] = useState<Expression>("neutral");

  const look: AvatarLook = { development, extras: PREVIEW_STAGES[stage]!.extras, face, lean: 0, expression };
  const stageName = PREVIEW_STAGES[stage]!.name;

  // Each face slot toggles between its default and its one alternative (6b proves the slot; 6e is the picker).
  // resolveFace types the result: a key from FACE_PRESETS is always a valid preset.
  const toggleSlot = (slot: FaceSlot) =>
    setFace((f) => {
      const [first, second]: readonly string[] = FACE_PRESETS[slot];
      return resolveFace({ ...f, [slot]: f[slot] === first ? second : first });
    });
  const isAlternative = (slot: FaceSlot) => face[slot] !== DEFAULT_FACE[slot];

  return (
    <View style={styles.section}>
      <View style={styles.themes}>
        {SCHEMES.map((scheme) => (
          <View
            key={scheme}
            style={[styles.panel, { backgroundColor: palettes[scheme].bg, borderColor: t.colors.border }]}
          >
            <Avatar look={look} height={220} scheme={scheme} stageName={stageName} />
            <View style={styles.smallRow}>
              {/* 40 px is drawn as the head-and-shoulders crop by default (cropFor). */}
              <Avatar look={look} height={40} scheme={scheme} stageName={stageName} />
            </View>
            <Text variant="caption" style={{ color: palettes[scheme].inkMuted }}>
              {scheme} · 220 px · 40 px
            </Text>
          </View>
        ))}
      </View>

      {BODY_PARTS.map((part) => (
        <View key={part} style={styles.sliderRow}>
          <Text variant="label" style={styles.partLabel}>
            {part}
          </Text>
          <Slider
            style={styles.flex}
            minimumValue={0}
            maximumValue={1}
            step={0.01}
            value={development[part]}
            onValueChange={(value) => setDevelopment((d) => ({ ...d, [part]: value }))}
            minimumTrackTintColor={t.colors.primary}
            maximumTrackTintColor={t.colors.border}
            thumbTintColor={t.colors.primary}
            accessibilityLabel={`${part} development`}
          />
          <Text variant="label" tone="inkMuted" tabular style={styles.value}>
            {development[part].toFixed(2)}
          </Text>
        </View>
      ))}

      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Stage">
        {PREVIEW_STAGES.map((s, i) => (
          <Chip key={s.name} label={s.name} role="radio" selected={i === stage} onPress={() => setStage(i)} />
        ))}
      </View>
      <View style={styles.wrap}>
        {FACE_SLOTS.map((slot) => (
          <Chip
            key={slot}
            label={`${slot}: ${face[slot]}`}
            role="checkbox"
            selected={isAlternative(slot)}
            onPress={() => toggleSlot(slot)}
          />
        ))}
      </View>
      <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel="Expression">
        {EXPRESSIONS.map((e) => (
          <Chip key={e} label={e} role="radio" selected={e === expression} onPress={() => setExpression(e)} />
        ))}
        <Chip label="All 0" selected={false} onPress={() => setDevelopment({ ...ROOKIE_LOOK.development })} />
        <Chip label="Week 12" selected={false} onPress={() => setDevelopment(weekDevelopment(12))} />
      </View>

      <Text variant="label" tone="inkMuted">
        First 12 weeks of the simulated intermediate (3×/week, no core work)
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {FIRST_12_WEEKS.legs.map((_, week) => (
          <View key={week} style={styles.week}>
            <Avatar look={{ ...look, development: weekDevelopment(week) }} height={110} stageName={stageName} />
            <Text variant="caption" tone="inkMuted">
              wk {week}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((t) => ({
  section: { gap: t.space[3] },
  themes: { flexDirection: "row", gap: t.space[2] },
  panel: {
    flex: 1,
    alignItems: "center",
    gap: t.space[2],
    paddingVertical: t.space[3],
    borderRadius: t.radius.lg,
    borderWidth: 1,
  },
  smallRow: { flexDirection: "row", alignItems: "flex-end", gap: t.space[3] },
  sliderRow: { flexDirection: "row", alignItems: "center", gap: t.space[2] },
  partLabel: { width: 72 },
  value: { width: 36, textAlign: "right" },
  flex: { flex: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: t.space[2] },
  strip: { gap: t.space[3] },
  week: { alignItems: "center", gap: t.space[1] },
}));

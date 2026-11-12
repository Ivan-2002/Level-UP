import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getLocales } from "expo-localization";
import { createProfileSchema, USERNAME_MAX, WEIGHT_UNITS, type WeightUnit } from "@levelup/shared";
import { authClient } from "@/lib/auth-client";
import { ApiError } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { createStyles } from "@/theme/use-theme";
import { useCreateProfile } from "./use-profile";
import { useDeviceTimeZone } from "./use-sync-time-zone";
import { bodyweightMessage, parseBodyweightInput, weightUnitForMeasurementSystem } from "./weight-unit-input";

type FieldErrors = Partial<Record<"username" | "bodyweightKg", string>>;

// "Create your character": the last step of sign-up. The (app) layout shows this screen
// instead of home until the player has a profile, so they can't skip it.
export function CreateCharacterScreen() {
  const { data: session } = authClient.useSession();
  const createProfile = useCreateProfile(session?.user.id ?? "");

  const [username, setUsername] = useState("");
  const [bodyweight, setBodyweight] = useState(""); // raw text, in weightUnit; parsed on submit
  // A first guess from the phone's region (US -> lb); the player can change it below.
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(() => weightUnitForMeasurementSystem(getLocales()[0]?.measurementSystem));
  const styles = useStyles();
  const timeZone = useDeviceTimeZone(); // weeks run Monday to Sunday in this zone
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit() {
    setFormError(null);

    // Validate with the SAME schema the API uses, for instant feedback per field.
    // The server checks again: the app's check is a convenience, not a guarantee.
    const parsed = createProfileSchema.safeParse({
      username,
      bodyweightKg: parseBodyweightInput(bodyweight, weightUnit), // always kg for the API
      weightUnit,
      timeZone,
    });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        // First problem per field is enough. Bodyweight ranges are restated in the player's unit.
        errors[field] ??= field === "bodyweightKg" ? bodyweightMessage(issue.code, issue.message, weightUnit) : issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    createProfile.mutate(parsed.data, {
      onError: (error) => {
        if (error instanceof ApiError && error.code === "UsernameTaken") {
          setFieldErrors({ username: error.message });
        } else if (!(error instanceof ApiError && error.code === "ProfileExists")) {
          // ProfileExists is handled in useCreateProfile (we move on to home).
          setFormError(error.message);
        }
      },
      // On success there is nothing to do here: the hook caches the new profile and the
      // layout's guard moves us to home.
    });
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text variant="captionStrong" tone="ice" style={styles.eyebrow}>
              NEW PLAYER
            </Text>
            <Text variant="display" accessibilityRole="header">
              Create your character
            </Text>
            <Text tone="inkMuted">
              Everyone starts as a Rookie. Your avatar grows with every workout you log.
            </Text>
          </View>

          <View style={styles.avatarCard}>
            <View style={styles.avatarFrame}>
              <Avatar />
            </View>
            <View style={styles.avatarInfo}>
              <View style={styles.levelPill}>
                <Text variant="labelStrong" tone="purple">
                  Lv. 1 · Rookie
                </Text>
              </View>
              <Text variant="label" tone="inkMuted">
                Chest, back, shoulders, arms, core and legs each grow from the exercises that train them.
              </Text>
            </View>
          </View>

          <View style={styles.form}>
            <TextField
              label="Username"
              value={username}
              onChangeText={(text) => {
                setUsername(text);
                if (fieldErrors.username) setFieldErrors((e) => ({ ...e, username: undefined }));
              }}
              error={fieldErrors.username}
              placeholder="e.g. IvanLifts"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              textContentType="username"
              maxLength={USERNAME_MAX}
              returnKeyType="next"
            />
            <View style={styles.unitRow} accessibilityRole="radiogroup" accessibilityLabel="Weight unit">
              <Text variant="label" style={styles.flex}>
                Weigh in
              </Text>
              {WEIGHT_UNITS.map((unit) => (
                <Chip key={unit} label={unit} role="radio" selected={unit === weightUnit} onPress={() => setWeightUnit(unit)} />
              ))}
            </View>
            <TextField
              label={`Bodyweight (${weightUnit})`}
              value={bodyweight}
              onChangeText={(text) => {
                setBodyweight(text);
                if (fieldErrors.bodyweightKg) setFieldErrors((e) => ({ ...e, bodyweightKg: undefined }));
              }}
              error={fieldErrors.bodyweightKg}
              hint="Used to give fair XP for push-ups, pull-ups and other bodyweight exercises."
              placeholder={weightUnit === "lb" ? "e.g. 165" : "e.g. 75"}
              keyboardType="decimal-pad"
              maxLength={5}
            />
            <View style={styles.goalNote}>
              <Text variant="label">Weekly goal</Text>
              <Text variant="caption" tone="inkMuted">
                Start at 2 days a week. Hit your goal and it grows, up to 4.
              </Text>
            </View>
            {formError ? (
              <Text tone="danger" accessibilityRole="alert">
                {formError}
              </Text>
            ) : null}
          </View>

          <View style={styles.spacer} />

          <Button label="Create character" onPress={submit} loading={createProfile.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: t.colors.bg },
  content: { flexGrow: 1, paddingTop: 28, paddingHorizontal: t.space[4], paddingBottom: t.space[6], gap: 20 },
  header: { gap: 6 },
  eyebrow: { letterSpacing: 1.9 },
  avatarCard: {
    height: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space[4],
    padding: t.space[4],
    borderRadius: t.radius.xl,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surface,
  },
  avatarFrame: {
    width: 132,
    height: 168,
    borderRadius: t.radius.lg,
    backgroundColor: t.colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInfo: { flex: 1, gap: t.space[2] },
  levelPill: {
    alignSelf: "flex-start",
    backgroundColor: t.colors.purpleSoft,
    borderRadius: t.radius.pill,
    paddingVertical: t.space[1],
    paddingHorizontal: t.space[3],
  },
  form: { gap: t.space[4] },
  goalNote: { gap: t.space[1] },
  unitRow: { flexDirection: "row", alignItems: "center", gap: t.space[2] },
  spacer: { flexGrow: 1 }, // pushes the button to the bottom on tall screens, like the design
}));

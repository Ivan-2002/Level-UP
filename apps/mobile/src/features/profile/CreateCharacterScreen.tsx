import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createProfileSchema, USERNAME_MAX } from "@levelup/shared";
import { authClient } from "@/lib/auth-client";
import { ApiError } from "@/lib/api";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { colors } from "@/theme/colors";
import { useCreateProfile } from "./use-profile";
import { WeeklyTargetPicker } from "./WeeklyTargetPicker";

type FieldErrors = Partial<Record<"username" | "bodyweightKg" | "weeklyTarget", string>>;

// Matches the profile table's default, so "didn't think about it" means the same everywhere.
const DEFAULT_WEEKLY_TARGET = 3;

// "Create your character": the last step of sign-up. The (app) layout shows this screen
// instead of home until the player has a profile, so they can't skip it.
export function CreateCharacterScreen() {
  const { data: session } = authClient.useSession();
  const createProfile = useCreateProfile(session?.user.id ?? "");

  const [username, setUsername] = useState("");
  const [bodyweight, setBodyweight] = useState(""); // raw text; parsed on submit
  const [weeklyTarget, setWeeklyTarget] = useState(DEFAULT_WEEKLY_TARGET);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit() {
    setFormError(null);

    // Validate with the SAME schema the API uses, for instant feedback per field.
    // The server checks again: the app's check is a convenience, not a guarantee.
    const parsed = createProfileSchema.safeParse({
      username,
      bodyweightKg: parseBodyweight(bodyweight),
      weeklyTarget,
    });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        errors[field] ??= issue.message; // first problem per field is enough
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
            <Text style={styles.eyebrow}>NEW PLAYER</Text>
            <Text style={styles.title} accessibilityRole="header">
              Create your character
            </Text>
            <Text style={styles.subtitle}>
              Everyone starts as a Rookie. Your avatar grows with every workout you log.
            </Text>
          </View>

          <View style={styles.avatarCard}>
            <View style={styles.avatarFrame}>
              <Avatar />
            </View>
            <View style={styles.avatarInfo}>
              <Text style={styles.levelPill}>Lv. 1 · Rookie</Text>
              <Text style={styles.avatarText}>
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
            <TextField
              label="Bodyweight (kg)"
              value={bodyweight}
              onChangeText={(text) => {
                setBodyweight(text);
                if (fieldErrors.bodyweightKg) setFieldErrors((e) => ({ ...e, bodyweightKg: undefined }));
              }}
              error={fieldErrors.bodyweightKg}
              hint="Used to give fair XP for push-ups, pull-ups and other bodyweight exercises."
              placeholder="e.g. 75"
              keyboardType="decimal-pad"
              maxLength={5}
            />
            <WeeklyTargetPicker
              value={weeklyTarget}
              onChange={setWeeklyTarget}
              hint={fieldErrors.weeklyTarget ?? "Workouts per week. Hit it to earn bonus XP and build your weekly streak."}
            />
            {formError ? (
              <Text style={styles.formError} accessibilityRole="alert">
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

/**
 * Empty means "not given" (bodyweight is optional). Accepts "75,5" as well as "75.5",
 * because many locales (including South Africa) type a comma as the decimal separator.
 * Anything unparseable becomes NaN, which the schema reports as "Enter ... as a number."
 */
function parseBodyweight(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  return Number(trimmed.replace(",", "."));
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingTop: 28, paddingHorizontal: 16, paddingBottom: 24, gap: 20 },
  header: { gap: 6 },
  eyebrow: { color: colors.ice, fontSize: 12, fontWeight: "600", letterSpacing: 1.9 },
  title: { color: colors.ink, fontSize: 28, lineHeight: 34, fontWeight: "700" },
  subtitle: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  avatarCard: {
    height: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatarFrame: {
    width: 132,
    height: 168,
    borderRadius: 16,
    backgroundColor: colors.surfaceRaised,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInfo: { flex: 1, gap: 8 },
  levelPill: {
    alignSelf: "flex-start",
    color: colors.purple,
    backgroundColor: colors.purpleSoft,
    fontSize: 14,
    fontWeight: "700",
    borderRadius: 999,
    overflow: "hidden", // iOS needs this for borderRadius on a Text background
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  avatarText: { color: colors.inkMuted, fontSize: 13, lineHeight: 18 },
  form: { gap: 16 },
  formError: { color: colors.danger, fontSize: 14 },
  spacer: { flexGrow: 1 }, // pushes the button to the bottom on tall screens, like the design
});

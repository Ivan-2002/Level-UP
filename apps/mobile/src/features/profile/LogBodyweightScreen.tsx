import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { formatWeight, localDate, recordBodyweightSchema } from "@levelup/shared";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { createStyles } from "@/theme/use-theme";
import { useProfile, useRecordBodyweight } from "./use-profile";
import {
  bodyweightChangeText,
  bodyweightMessage,
  needsBodyweightConfirm,
  parseBodyweightInput,
} from "./weight-unit-input";

// "Log bodyweight": today's weight, in the player's unit. A change of more than 10% from
// the last entry asks for confirmation first (a typo is likelier than a real 10% change,
// and the XP bodyweight takes weeks to undo one). Opened as a sheet from Home.
export function LogBodyweightScreen() {
  const { data: session } = authClient.useSession();
  const userId = session?.user.id ?? "";
  const { data: profile } = useProfile(userId); // cached by the (app) layout
  const record = useRecordBodyweight(userId);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const styles = useStyles();

  const unit = profile?.weightUnit ?? "kg";
  const previousKg = profile?.bodyweightKg ?? null;

  function submit() {
    setError(null);
    // The player's local day (the server would otherwise use its UTC day, which is
    // yesterday shortly after midnight in South Africa).
    const measuredOn = localDate(new Date(), profile?.timeZone ?? "UTC");
    const parsed = recordBodyweightSchema.safeParse({ kg: parseBodyweightInput(text, unit), measuredOn });
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      setError(bodyweightMessage(issue.code, issue.message, unit));
      return;
    }
    const save = () =>
      record.mutate(parsed.data, {
        onSuccess: () => router.back(),
        onError: (e) => setError(`Couldn't save your bodyweight. ${e.message}`),
      });
    if (previousKg !== null && needsBodyweightConfirm(previousKg, parsed.data.kg)) {
      Alert.alert(
        `Save ${formatWeight(parsed.data.kg, unit)}?`,
        `${bodyweightChangeText(previousKg, parsed.data.kg, unit)} Is that right?`,
        [
          { text: "Change it", style: "cancel" },
          { text: "Save", onPress: save },
        ],
      );
      return;
    }
    save();
  }

  return (
    <SafeAreaView style={styles.screen} edges={["left", "right", "bottom"]}>
      <View style={styles.titleRow}>
        <Text variant="title" accessibilityRole="header">
          Log bodyweight
        </Text>
        <Button label="Cancel" variant="plain" tone="link" size="md" onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label={`Today's bodyweight (${unit})`}
            value={text}
            onChangeText={(value) => {
              setText(value);
              if (error) setError(null);
            }}
            error={error ?? undefined}
            hint={previousKg === null ? undefined : `Last entry: ${formatWeight(previousKg, unit)}`}
            placeholder={unit === "lb" ? "e.g. 165" : "e.g. 75"}
            keyboardType="decimal-pad"
            maxLength={5}
            autoFocus
          />
          <Button label="Save" onPress={submit} loading={record.isPending} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.colors.surface },
  flex: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: t.space[4],
    paddingTop: t.space[4],
  },
  content: { padding: t.space[4], gap: t.space[4], paddingBottom: t.space[8] },
}));

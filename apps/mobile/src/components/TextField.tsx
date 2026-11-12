import { useState } from "react";
import { TextInput, View, type TextInputProps } from "react-native";
import { createStyles, useTheme } from "@/theme/use-theme";
import { Text } from "./Text";

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** Helper text under the input. Hidden while an error is shown, so only one message appears. */
  hint?: string;
};

// A labelled text input with an optional hint or error message underneath.
export function TextField({ label, error, hint, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);
  const styles = useStyles();
  const t = useTheme();

  return (
    <View style={styles.wrapper}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.inkMuted}
        {...inputProps}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        style={[
          styles.input,
          focused && styles.focused,
          error ? styles.invalid : null,
        ]}
      />
      {error ? (
        <Text variant="caption" tone="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="inkMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  wrapper: { gap: 6 },
  input: {
    ...t.type.body,
    height: 48,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.colors.border,
    backgroundColor: t.colors.surfaceRaised,
    color: t.colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 0,
  },
  focused: { borderColor: t.colors.ice }, // ice = focus ring (design system)
  invalid: { borderColor: t.colors.danger },
}));

import { useState } from "react";
import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors } from "@/theme/colors";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

// A labelled text input with an optional error message underneath.
export function TextField({ label, error, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
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
          focused && { borderColor: colors.primary },
          error ? { borderColor: colors.danger } : null,
        ]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  label: { color: colors.ink, fontSize: 13, fontWeight: "500" },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    color: colors.ink,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  error: { color: colors.danger, fontSize: 12 },
});

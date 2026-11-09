import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors } from "@/theme/colors";

type Props = {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
};

// The app's one button. Every screen uses this, so buttons look and behave the same
// everywhere, and a design change happens here once.
export function Button({ label, onPress, variant = "primary", loading = false, disabled = false }: Props) {
  const isPrimary = variant === "primary";
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : styles.secondary,
        (pressed || inactive) && styles.dimmed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onPrimary : colors.ink} />
      ) : (
        <Text style={[styles.label, { color: isPrimary ? colors.onPrimary : colors.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  dimmed: { opacity: 0.6 },
  label: { fontSize: 16, fontWeight: "600" },
});

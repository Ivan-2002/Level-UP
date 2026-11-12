import type { ReactNode } from "react";
import { View } from "react-native";
import { createStyles } from "@/theme/use-theme";
import { IconButton } from "./IconButton";
import { Text } from "./Text";

type Props = {
  title: string;
  subtitle?: string;
  /** Shows a back button. */
  onBack?: () => void;
  backLabel?: string;
  /** Actions on the right, e.g. an IconButton or a small Button. */
  right?: ReactNode;
};

/** The top of a stacked screen: back, title (+ subtitle), actions. We draw our own instead of the native header so it matches the design on both platforms. */
export function ScreenHeader({ title, subtitle, onBack, backLabel = "Back", right }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      {onBack ? <IconButton icon="back" onPress={onBack} accessibilityLabel={backLabel} /> : null}
      <View style={styles.titles}>
        <Text variant="heading" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="inkMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  row: { flexDirection: "row", alignItems: "center", gap: t.space[3], paddingHorizontal: t.space[4], paddingTop: t.space[4], paddingBottom: t.space[3] },
  titles: { flex: 1, minWidth: 0 },
}));

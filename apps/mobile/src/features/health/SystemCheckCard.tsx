import { ActivityIndicator } from "react-native";
import { Card } from "@/components/Card";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/use-theme";
import { useHealth } from "./use-health";

// "API ok · Database ok": a developer's check that the phone reaches the API and the API
// reaches Postgres. Home renders it in development builds only (`__DEV__`). It is its own
// component so the /health request only runs when the card is shown: hooks can't be
// called conditionally, but a component can be rendered conditionally.
export function SystemCheckCard() {
  const { data, error, isPending } = useHealth();
  const t = useTheme();

  return (
    <Card>
      {isPending ? (
        <ActivityIndicator color={t.colors.purple} />
      ) : error ? (
        <Text tone="danger">API unreachable: {error.message}</Text>
      ) : (
        <Text tone="success">
          API {data.status} · Database {data.database}
        </Text>
      )}
    </Card>
  );
}

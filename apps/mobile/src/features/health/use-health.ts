import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

// Shape of GET /health. This type moves to packages/shared later,
// so the API and the app share one definition.
export type HealthResponse = {
  status: "ok" | "degraded";
  database: "up" | "down";
  uptimeSeconds: number;
  timestamp: string;
};

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/health"),
  });
}

import { useQuery } from "@tanstack/react-query";
import type { HealthResponse } from "@levelup/shared";
import { apiGet } from "@/lib/api";

// The response type comes from @levelup/shared, so if the API's /health
// response ever changes shape, TypeScript flags this file too.
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet<HealthResponse>("/health"),
  });
}

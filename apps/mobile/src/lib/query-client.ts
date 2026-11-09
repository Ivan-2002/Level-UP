import { QueryClient } from "@tanstack/react-query";

// TanStack Query caches server data, retries failed requests and refetches
// stale data, so screens don't hand-roll loading/error/retry logic.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000, // data counts as fresh for 30 seconds
    },
  },
});

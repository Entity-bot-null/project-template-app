import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { isRetryable, toAppError } from '@/lib/errors';
import { reportError } from '@/lib/observability';

// Server state (docs/mobile-architecture.md#state): every piece of data that comes
// from the API is a TanStack Query query or mutation, cached here. Nothing
// copies it into Zustand or React state.
//
// Defaults: data is fresh for 30 seconds (navigating back does not refetch
// at once), kept 5 minutes after its last screen unmounted, refetched when
// the app returns to the foreground or the network comes back (network.ts).
// Only transient failures are retried, twice, with backoff; a 4xx is an
// answer, not a glitch. Mutations are never retried automatically: the user
// decides (a non-idempotent write must not happen twice).

const MAX_RETRIES = 2;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        reportError(error, { tags: { 'query.key': String(query.queryKey[0]) } });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        reportError(error, { tags: { 'mutation.key': String(mutation.options.mutationKey?.[0]) } });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) =>
          failureCount < MAX_RETRIES && isRetryable(toAppError(error)),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();

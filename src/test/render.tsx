import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '@/ui';

/**
 * A query client for one test: no retries, no shared cache between tests,
 * and no garbage-collection timers (gcTime Infinity, for mutations too: their
 * default 5-minute timer would keep Jest from exiting).
 */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
}

/** Renders with the app's providers (query client, theme, safe areas). Async, like RNTL 14's render. */
export async function renderWithProviders(
  ui: ReactElement,
  {
    queryClient = testQueryClient(),
    ...options
  }: RenderOptions & { queryClient?: QueryClient } = {},
) {
  function Providers({ children }: { children: ReactNode }) {
    return (
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>{children}</ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    );
  }
  return { queryClient, ...(await render(ui, { wrapper: Providers, ...options })) };
}

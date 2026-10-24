import { render } from '@testing-library/react-native';
import { ExpoRoot } from 'expo-router';
import { getMockContext } from 'expo-router/testing-library';

import { queryClient } from '@/lib/query/queryClient';

// The routes use the app's own query client, kept as it is except for its
// garbage-collection timers, as in testQueryClient(): gcTime Infinity, for
// mutations too. Each query and mutation whose screen unmounts would
// otherwise leave a 5-minute timer behind, which `queryClient.clear()` does
// not stop for mutations: a spec run alone never exits, and in a full run
// Jest force-exits the worker. Set when a spec imports this file, before
// its first test creates a query.
const defaults = queryClient.getDefaultOptions();
queryClient.setDefaultOptions({
  ...defaults,
  queries: { ...defaults.queries, gcTime: Infinity },
  mutations: { ...defaults.mutations, gcTime: Infinity },
});

/**
 * Renders the app's real routes (src/app) at `url`, the way the app starts.
 *
 * expo-router's own renderRouter() targets React Native Testing Library 13:
 * it expects a synchronous render and switches Jest to fake timers, so with
 * RNTL 14 (async render) its helpers are lost and every async wait freezes.
 * This does the same with the async render and real timers. Revisit when
 * expo-router's testing library supports RNTL 14.
 */
export async function renderApp(url: string) {
  // Load routes synchronously, as renderRouter does.
  process.env.EXPO_ROUTER_IMPORT_MODE = 'sync';
  return render(<ExpoRoot context={getMockContext('src/app')} location={url} />);
}

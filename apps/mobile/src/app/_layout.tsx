import { QueryClientProvider } from '@tanstack/react-query';
import { type ErrorBoundaryProps, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { session, useSessionStatus } from '@/auth/session';
import { useScreenTracking } from '@/hooks/useScreenTracking';
import { analytics } from '@/lib/analytics';
import { configureNotifications } from '@/lib/notifications';
import { errorReporter, reportError, startObservability } from '@/lib/observability';
import { connectQueryToDevice } from '@/lib/query/network';
import { queryClient } from '@/lib/query/queryClient';
import { usePreferences } from '@/store/preferences';
import { clearImageCaches, ErrorState, Screen, ThemeProvider } from '@/ui';

// The root of the app (docs/mobile-architecture.md#navigation). Startup work runs
// once, before the first render; the splash screen stays until the session
// is known, so nobody sees a screen they are about to leave. The navigation
// follows the state: three flows, each available only when its guard holds,
// and Expo Router moves the user when a guard changes (sign-in, sign-out,
// onboarding done). Screens never redirect on their own.

startObservability();
configureNotifications();
connectQueryToDevice();
void SplashScreen.preventAutoHideAsync();

session.onSignIn((user) => {
  errorReporter().setUser(user.id);
  analytics.identify(user.id);
});
session.onSignOut(() => {
  // Nothing of the previous user survives: cached data and images, the
  // error reporter's and analytics' identity.
  queryClient.clear();
  clearImageCaches().catch((error: unknown) => {
    reportError(error);
  });
  errorReporter().setUser(null);
  analytics.reset();
});

export default function RootLayout() {
  const status = useSessionStatus();
  const onboardingCompleted = usePreferences((state) => state.onboardingCompleted);

  useEffect(() => {
    void session.restore();
  }, []);

  useEffect(() => {
    if (status !== 'restoring') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'restoring') return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <Navigation onboardingCompleted={onboardingCompleted} signedIn={status === 'signedIn'} />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigation({
  onboardingCompleted,
  signedIn,
}: {
  onboardingCompleted: boolean;
  signedIn: boolean;
}) {
  useScreenTracking();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!onboardingCompleted}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={onboardingCompleted && !signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={onboardingCompleted && signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
    </Stack>
  );
}

/** A render error anywhere below: reported, and the user gets a way back. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error, { level: 'fatal', tags: { boundary: 'root' } });
  }, [error]);
  return (
    <SafeAreaProvider>
      <Screen>
        <ErrorState error={error} title="Something went wrong" onRetry={() => void retry()} />
      </Screen>
    </SafeAreaProvider>
  );
}

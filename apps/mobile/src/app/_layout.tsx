import { QueryClientProvider } from '@tanstack/react-query';
import { type ErrorBoundaryProps, type Href, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { session, useSessionStatus } from '@/auth/session';
import { useUpgradeRequired } from '@/features/update/upgrade';
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
// onboarding done). Screens never redirect on their own. The screens of
// emailed links open with or without a session, and are never the screen a
// guard falls back to. Once the API refuses this app version (426), the
// update screen is the only one left.

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
  const upgradeRequired = useUpgradeRequired();

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
          <Navigation
            onboardingCompleted={onboardingCompleted}
            signedIn={status === 'signedIn'}
            upgradeRequired={upgradeRequired}
          />
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

function Navigation({
  onboardingCompleted,
  signedIn,
  upgradeRequired,
}: {
  onboardingCompleted: boolean;
  signedIn: boolean;
  upgradeRequired: boolean;
}) {
  useScreenTracking();
  // Where a guard that does not hold sends the user: the one flow the state
  // allows. Expo Router renders a guarded screen as a redirect (SDK 58), and
  // without a target it picks its own fallback, which can be the not-found
  // screen.
  const allowed = allowedScreen({ onboardingCompleted, signedIn, upgradeRequired });
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={upgradeRequired} redirectTo={allowed}>
        <Stack.Screen name="update-required" />
      </Stack.Protected>
      <Stack.Protected guard={!upgradeRequired && !onboardingCompleted} redirectTo={allowed}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected
        guard={!upgradeRequired && onboardingCompleted && !signedIn}
        redirectTo={allowed}
      >
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected
        guard={!upgradeRequired && onboardingCompleted && signedIn}
        redirectTo={allowed}
      >
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!upgradeRequired} redirectTo={allowed}>
        <Stack.Screen name="(links)" />
      </Stack.Protected>
      <Stack.Screen name="+not-found" options={{ headerShown: true, title: 'Not found' }} />
    </Stack>
  );
}

/** The first screen of the one flow the state allows (the table in docs/mobile-architecture.md#navigation). */
export function allowedScreen(state: {
  onboardingCompleted: boolean;
  signedIn: boolean;
  upgradeRequired: boolean;
}): Href {
  if (state.upgradeRequired) return '/update-required';
  if (!state.onboardingCompleted) return '/welcome';
  return state.signedIn ? '/' : '/sign-in';
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

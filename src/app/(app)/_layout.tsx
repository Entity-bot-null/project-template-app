import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useMe } from '@/features/account/api';
import { analytics } from '@/lib/analytics';
import { useNotificationNavigation } from '@/lib/notifications';
import { errorReporter } from '@/lib/observability';
import { OfflineBanner } from '@/ui';

/** Signed in: the tabs, and the screens pushed or presented over them. */
export default function AppLayout() {
  useNotificationNavigation();
  useIdentifyUser();
  return (
    <>
      <OfflineBanner />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="items/[id]" options={{ title: 'Item' }} />
        <Stack.Screen
          name="new-item"
          options={{
            title: 'New item',
            presentation: 'formSheet',
            sheetAllowedDetents: [0.75, 1],
            sheetGrabberVisible: true,
          }}
        />
      </Stack>
    </>
  );
}

/** A restored session has no sign-in event: identify the user once known. */
function useIdentifyUser() {
  const me = useMe();
  const id = me.data?.id;
  useEffect(() => {
    if (id === undefined) return;
    errorReporter().setUser(id);
    analytics.identify(id);
  }, [id]);
}

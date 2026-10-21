import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { useMe } from '@/features/account/api';
import { analytics } from '@/lib/analytics';
import { useNotificationNavigation } from '@/lib/notifications';
import { errorReporter } from '@/lib/observability';
import { OfflineBannerLayout, useOfflineBannerStackOptions } from '@/ui';

// A link that starts the app (src/lib/links.ts) builds the stack from its URL
// alone: the anchor puts the tabs below the screen it opens, so there is a
// way back instead of a lone screen that Android's back button closes.
export const unstable_settings = { anchor: '(tabs)' };

/** Signed in: the tabs, and the screens pushed or presented over them. */
export default function AppLayout() {
  useNotificationNavigation();
  useIdentifyUser();
  const bannerOptions = useOfflineBannerStackOptions();
  return (
    <OfflineBannerLayout>
      <Stack screenOptions={bannerOptions}>
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
    </OfflineBannerLayout>
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

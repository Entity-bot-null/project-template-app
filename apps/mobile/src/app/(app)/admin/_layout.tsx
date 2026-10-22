import { Stack } from 'expo-router';

import { useOfflineBannerStackOptions } from '@/ui';

/**
 * Administration: reached from Settings, only by an admin (the guard in
 * src/app/(app)/_layout.tsx); the API authorizes every request anyway.
 */
export default function AdminLayout() {
  const bannerOptions = useOfflineBannerStackOptions();
  return (
    <Stack screenOptions={bannerOptions}>
      <Stack.Screen name="users" options={{ title: 'Users' }} />
      <Stack.Screen name="invitations" options={{ title: 'Invitations' }} />
    </Stack>
  );
}

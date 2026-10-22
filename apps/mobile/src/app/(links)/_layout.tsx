import { Stack } from 'expo-router';

/**
 * The screens of the links the API emails (src/lib/links.ts), with or
 * without a session: each takes its link's token and leads on when done.
 */
export default function LinksLayout() {
  return (
    <Stack>
      <Stack.Screen name="reset-password" options={{ title: 'New password' }} />
      <Stack.Screen name="confirm-sign-up" options={{ title: 'Confirm your account' }} />
      <Stack.Screen name="accept-invitation" options={{ title: 'Accept the invitation' }} />
      <Stack.Screen name="confirm-email-change" options={{ title: 'Confirm your address' }} />
      <Stack.Screen name="revert-email-change" options={{ title: 'Undo the address change' }} />
    </Stack>
  );
}

import { Stack } from 'expo-router';

/** Signed out: sign-in, and the screens it leads to (sign-up, password recovery). */
export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="sign-up" options={{ title: 'Create an account' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Forgot your password' }} />
    </Stack>
  );
}

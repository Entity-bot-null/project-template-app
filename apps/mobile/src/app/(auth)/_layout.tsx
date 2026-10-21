import { Stack } from 'expo-router';

/** Signed out: sign-in, and later sign-up or password reset screens. */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

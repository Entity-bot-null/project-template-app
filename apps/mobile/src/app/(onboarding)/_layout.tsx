import { Stack } from 'expo-router';

/** First launch only: available until onboarding is completed (src/app/_layout.tsx). */
export default function OnboardingLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

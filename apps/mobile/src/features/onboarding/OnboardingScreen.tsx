import { View } from 'react-native';

import { analytics } from '@/lib/analytics';
import { usePreferences } from '@/store/preferences';
import appIcon from '@/assets/images/icon.png';
import { Button, createStyles, Icon, type IconName, Image, Screen, Text } from '@/ui';

// The first screen of a new installation. Replace the copy with the
// product's; keep it short, and never ask for a permission here: each one
// is asked where it is needed, with its reason.

const POINTS: readonly { icon: IconName; title: string; text: string }[] = [
  { icon: 'flash-outline', title: 'Fast', text: 'What matters most, one tap away.' },
  {
    icon: 'cloud-offline-outline',
    title: 'Ready for a weak signal',
    text: 'What is already loaded stays on screen when the connection drops.',
  },
  {
    icon: 'lock-closed-outline',
    title: 'Private',
    text: 'Your session is kept in the device’s secure storage.',
  },
];

const useStyles = createStyles((theme) => ({
  hero: { flex: 1, justifyContent: 'center', gap: theme.spacing.xl },
  logo: { width: theme.sizes.logo, height: theme.sizes.logo, borderRadius: theme.radius.lg },
  point: { flexDirection: 'row', gap: theme.spacing.md, alignItems: 'flex-start' },
  pointText: { flex: 1, gap: theme.spacing.xs },
}));

export function OnboardingScreen() {
  const styles = useStyles();
  const completeOnboarding = usePreferences((state) => state.completeOnboarding);
  return (
    <Screen scroll testID="onboarding-screen">
      <View style={styles.hero}>
        {/* The app icon (assets/images, replaced with the product's): the name is said by the heading. */}
        <Image source={appIcon} style={styles.logo} decorative />
        <Text variant="display">Welcome</Text>
        {POINTS.map((point) => (
          <View key={point.title} style={styles.point} accessible>
            <Icon name={point.icon} size="lg" color="primary" />
            <View style={styles.pointText}>
              <Text variant="heading">{point.title}</Text>
              <Text tone="muted">{point.text}</Text>
            </View>
          </View>
        ))}
      </View>
      <Button
        label="Get started"
        testID="onboarding-continue"
        onPress={() => {
          completeOnboarding();
          analytics.track('onboarding_completed', {});
        }}
      />
    </Screen>
  );
}

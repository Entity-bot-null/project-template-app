import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { Alert, Pressable, Switch, View } from 'react-native';

import { session } from '@/auth/session';
import { useMe } from '@/features/account/api';
import { analytics } from '@/lib/analytics';
import { getPushToken, notificationPermission } from '@/lib/notifications';
import { logger } from '@/lib/observability';
import { usePermission } from '@/lib/permissions/usePermission';
import { THEME_PREFERENCES, type ThemePreference, usePreferences } from '@/store/preferences';
import {
  Button,
  Card,
  createStyles,
  ErrorState,
  LoadingState,
  PermissionPrompt,
  Screen,
  Text,
  useTheme,
} from '@/ui';

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const useStyles = createStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  segments: { flexDirection: 'row', gap: theme.spacing.sm },
  segment: {
    flex: 1,
    minHeight: theme.sizes.touchTarget,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export function SettingsScreen() {
  return (
    <Screen scroll edges={['left', 'right']} testID="settings-screen">
      <AccountSection />
      <AppearanceSection />
      <NotificationsSection />
      <PrivacySection />
      <AboutSection />
      <Button
        label="Sign out"
        variant="danger"
        testID="settings-sign-out"
        onPress={() => {
          Alert.alert('Sign out?', 'You will need to sign in again on this device.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: () => {
                analytics.track('sign_out', {});
                void session.signOut();
              },
            },
          ]);
        }}
      />
    </Screen>
  );
}

function AccountSection() {
  const me = useMe();
  if (me.isPending) return <LoadingState label="Loading profile" />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  return (
    <Card>
      <Text variant="heading">{me.data.name}</Text>
      <Text tone="muted">{me.data.email}</Text>
    </Card>
  );
}

function AppearanceSection() {
  const theme = useTheme();
  const styles = useStyles();
  const current = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  return (
    <Card>
      <Text variant="heading">Appearance</Text>
      <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Theme">
        {THEME_PREFERENCES.map((option) => {
          const selected = option === current;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`${THEME_LABELS[option]} theme`}
              testID={`theme-${option}`}
              onPress={() => {
                setTheme(option);
                analytics.track('theme_changed', { theme: option });
              }}
              style={[
                styles.segment,
                {
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.surfaceMuted : 'transparent',
                },
              ]}
            >
              <Text variant="label" tone={selected ? 'primary' : 'default'}>
                {THEME_LABELS[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function NotificationsSection() {
  const permission = usePermission(notificationPermission);
  return (
    <PermissionPrompt
      icon="notifications-outline"
      title="Notifications"
      rationale="Get told when something needs your attention. You can turn them off at any time."
      state={permission.state}
      onRequest={() => {
        void permission.request().then(async (state) => {
          if (state !== 'granted') return;
          // Hand the token to the backend here (PushTokenRegistrar, src/lib/notifications).
          const token = await getPushToken().catch(() => null);
          logger.info(
            'app',
            token === null ? 'Push unavailable on this device' : 'Push token obtained',
          );
        });
      }}
      onOpenSettings={() => void permission.openSettings()}
    />
  );
}

function PrivacySection() {
  const styles = useStyles();
  const consent = usePreferences((state) => state.analyticsConsent);
  const setConsent = usePreferences((state) => state.setAnalyticsConsent);
  return (
    <Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text variant="heading">Usage analytics</Text>
          <Text tone="muted">
            Share anonymous usage events to help improve the app. Nothing is sent without your
            consent.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Share usage analytics"
          testID="settings-analytics"
          value={consent === 'granted'}
          onValueChange={(value) => {
            setConsent(value ? 'granted' : 'denied');
            if (!value) analytics.reset();
          }}
        />
      </View>
    </Card>
  );
}

/**
 * What support needs to find a problem: the store version and build number
 * of the binary, and the OTA update it runs (the same values Sentry tags).
 */
function AboutSection() {
  const version = Application.nativeApplicationVersion ?? 'unknown';
  const build = Application.nativeBuildVersion ?? 'unknown';
  const update = Updates.updateId === null ? 'built-in' : Updates.updateId.slice(0, 8);
  return (
    <Card>
      <Text variant="heading">About</Text>
      <Text tone="muted">
        Version {version} ({build})
      </Text>
      <Text tone="muted">Update {update}</Text>
    </Card>
  );
}

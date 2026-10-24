import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import { session, useSessionUser } from '@/auth/session';
import { useMe } from '@/features/account/api';
import { useCapabilities } from '@/features/auth/api';
import { registerForPush } from '@/features/notifications/api';
import { analytics } from '@/lib/analytics';
import { notificationPermission } from '@/lib/notifications';
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
  // A sign-out first tells the server to stop this phone's push notifications
  // (a few seconds at most): the button waits with it.
  const [signingOut, setSigningOut] = useState(false);
  return (
    <Screen scroll edges={['left', 'right']} testID="settings-screen">
      <AccountSection />
      <AdminSection />
      <AppearanceSection />
      <NotificationsSection />
      <PrivacySection />
      <AboutSection />
      <Button
        label="Sign out"
        variant="danger"
        testID="settings-sign-out"
        loading={signingOut}
        onPress={() => {
          Alert.alert('Sign out?', 'You will need to sign in again on this device.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: () => {
                analytics.track('sign_out', {});
                setSigningOut(true);
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
  // Offered once the server says it can send the link (not while unknown).
  const emailChange = useCapabilities().data?.emailChange === true;
  return (
    <Card>
      {me.isPending && <LoadingState label="Loading profile" />}
      {me.isError && <ErrorState error={me.error} onRetry={() => void me.refetch()} />}
      {me.isSuccess && (
        <>
          <Text variant="heading">{me.data.name}</Text>
          <Text tone="muted">{me.data.email}</Text>
        </>
      )}
      <Button
        label="Change password"
        variant="secondary"
        icon="key-outline"
        testID="settings-change-password"
        onPress={() => {
          router.push('/account/change-password');
        }}
      />
      {emailChange && (
        <Button
          label="Change email"
          variant="secondary"
          icon="mail-outline"
          testID="settings-change-email"
          onPress={() => {
            router.push('/account/change-email');
          }}
        />
      )}
      <Button
        label="Delete account"
        variant="ghost"
        icon="trash-outline"
        testID="settings-delete-account"
        onPress={() => {
          router.push('/account/delete-account');
        }}
      />
    </Card>
  );
}

/** For an admin only: the users and the invitations. */
function AdminSection() {
  const isAdmin = useSessionUser()?.role === 'admin';
  if (!isAdmin) return null;
  return (
    <Card>
      <Text variant="heading">Administration</Text>
      <Button
        label="Users"
        variant="secondary"
        icon="people-outline"
        testID="settings-admin-users"
        onPress={() => {
          router.push('/admin/users');
        }}
      />
      <Button
        label="Invitations"
        variant="secondary"
        icon="person-add-outline"
        testID="settings-admin-invitations"
        onPress={() => {
          router.push('/admin/invitations');
        }}
      />
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
        void permission.request().then((state) => {
          if (state === 'granted') void registerForPush();
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

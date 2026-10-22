import * as Application from 'expo-application';
import { Linking, Platform } from 'react-native';

import { env } from '@/config/env';
import { logger } from '@/lib/observability';
import { EmptyState, Screen, Text } from '@/ui';

const STORE = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
const STORE_URL =
  Platform.OS === 'ios' ? env.EXPO_PUBLIC_STORE_URL_IOS : env.EXPO_PUBLIC_STORE_URL_ANDROID;

/**
 * Shown instead of every other screen once the API refused this version
 * (426): nothing else can work, so nothing else is offered. A link to the
 * app's page in the store when it is configured (EXPO_PUBLIC_STORE_URL_*),
 * otherwise where to find the update.
 */
export function UpdateRequiredScreen() {
  const version = Application.nativeApplicationVersion ?? 'unknown';
  return (
    <Screen testID="update-required-screen">
      <EmptyState
        title="Update required"
        icon="cloud-download-outline"
        description={
          STORE_URL === undefined
            ? `This version of the app is no longer supported. Update it from ${STORE} to continue.`
            : 'This version of the app is no longer supported. Update it to continue.'
        }
        {...(STORE_URL !== undefined && {
          action: {
            label: `Update from ${STORE}`,
            onPress: () => {
              Linking.openURL(STORE_URL).catch(() => {
                logger.warn('app', 'Store page could not be opened');
              });
            },
          },
        })}
      />
      <Text tone="muted" align="center">
        Installed version {version}
      </Text>
    </Screen>
  );
}

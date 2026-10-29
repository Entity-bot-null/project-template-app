import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
// By name: eslint-plugin-import's module test misses expo-notifications 58's
// compiled enum module (a comment opens its export line), so the namespace
// member would read as missing. TypeScript checks it either way.
import { AndroidImportance } from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { z } from 'zod';

import { toInternalPath } from '@/lib/links';
import type { PermissionSource } from '@/lib/permissions/usePermission';

// Push notifications on this device (docs/mobile-architecture.md#notifications):
//   - the permission is asked from Settings, after an explanation, never on launch;
//   - the token is handed to a PushTokenRegistrar: the API's devices
//     (src/features/notifications), registered while signed in and removed at
//     sign-out;
//   - tapping a notification opens its `data.url`, validated like any deep link.
// Push needs a development or release build on a real device (not Expo Go,
// not a simulator) and an EAS project id: the API sends through Expo's push
// service, so only Expo push tokens are registered (REQUIERE CONFIGURACIÓN:
// `eas init`, and the FCM and APNs credentials in EAS).

export const notificationPermission: PermissionSource = {
  get: () => Notifications.getPermissionsAsync(),
  request: () => Notifications.requestPermissionsAsync(),
};

/** Called once at startup: how notifications show while the app is open. */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
  });
  if (Platform.OS === 'android') {
    // Android 8+ shows nothing without a channel. One for now; add channels
    // per kind of notification so users can mute them separately.
    void Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: AndroidImportance.DEFAULT,
    });
  }
}

export interface PushToken {
  /** The push service the token belongs to: Expo's, the one the API sends through. */
  kind: 'expo';
  /** ExponentPushToken[…] */
  value: string;
  platform: 'ios' | 'android';
}

/** Where this installation's push token goes, and how it leaves. */
export interface PushTokenRegistrar {
  /** Registers the token for the signed-in account; safe to repeat. */
  register(token: PushToken): Promise<void>;
  /** Stops push notifications to this installation (at sign-out). */
  unregister(): Promise<void>;
}

const ExtraSchema = z.object({ eas: z.object({ projectId: z.string().min(1) }) });

/**
 * This device's Expo push token, or null where push is unavailable: a
 * simulator or an emulator, or a build without an EAS project id. Rejects
 * when the platform's service refuses (on Android, FCM credentials missing).
 */
export async function getPushToken(): Promise<PushToken | null> {
  if (!Device.isDevice) return null;
  const extra = ExtraSchema.safeParse(Constants.expoConfig?.extra);
  if (!extra.success) return null;
  const token = await Notifications.getExpoPushTokenAsync({ projectId: extra.data.eas.projectId });
  return { kind: 'expo', value: token.data, platform: Platform.OS === 'ios' ? 'ios' : 'android' };
}

/**
 * Calls `listener` when the push service replaces this device's token while
 * the app runs (rare): the old one stops working, so the new one is
 * registered at once. Returns the unsubscribe function.
 */
export function onPushTokenChange(listener: () => void): () => void {
  const subscription = Notifications.addPushTokenListener(() => {
    listener();
  });
  return () => {
    subscription.remove();
  };
}

const handled = new Set<string>();

function openFromNotification(response: Notifications.NotificationResponse): void {
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const url: unknown = response.notification.request.content.data?.url;
  if (typeof url !== 'string') return;
  const path = toInternalPath(url);
  if (path !== null) router.push(path as Href);
}

/**
 * Opens the screen a tapped notification points to, including the one that
 * launched the app. Mounted while signed in (src/app/(app)/_layout.tsx).
 */
export function useNotificationNavigation(): void {
  useEffect(() => {
    const launchedWith = Notifications.getLastNotificationResponse();
    if (launchedWith) openFromNotification(launchedWith);
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openFromNotification);
    return () => {
      subscription.remove();
    };
  }, []);
}

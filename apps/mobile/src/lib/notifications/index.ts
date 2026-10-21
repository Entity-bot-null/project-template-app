import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { z } from 'zod';

import { toInternalPath } from '@/lib/links';
import type { PermissionSource } from '@/lib/permissions/usePermission';

// Push notifications, prepared and backend-agnostic
// (docs/mobile-architecture.md#notifications):
//   - the permission is asked from Settings, after an explanation, never on launch;
//   - the token is handed to a PushTokenRegistrar: the backend endpoint that
//     stores it is the project's (REQUIERE CONFIGURACIÓN);
//   - tapping a notification opens its `data.url`, validated like any deep link.
// Push needs a development or release build on a real device (not Expo Go,
// not a simulator) and, for Expo's push service, an EAS project id.

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
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export interface PushToken {
  /** Expo push token (Expo's push service) or the raw FCM / APNs token. */
  kind: 'expo' | 'device';
  value: string;
  platform: 'ios' | 'android';
}

/** Where tokens go: implement with the backend's endpoint. */
export interface PushTokenRegistrar {
  register(token: PushToken): Promise<void>;
}

const ExtraSchema = z.object({ eas: z.object({ projectId: z.string().min(1) }) });

/** The push token of this device, or null where push is unavailable. */
export async function getPushToken(): Promise<PushToken | null> {
  if (!Device.isDevice) return null;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const extra = ExtraSchema.safeParse(Constants.expoConfig?.extra);
  if (extra.success) {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: extra.data.eas.projectId,
    });
    return { kind: 'expo', value: token.data, platform };
  }
  const token = await Notifications.getDevicePushTokenAsync();
  return { kind: 'device', value: String(token.data), platform };
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

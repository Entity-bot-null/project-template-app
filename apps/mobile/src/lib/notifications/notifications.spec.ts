import { renderHook } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import {
  configureNotifications,
  getPushToken,
  notificationPermission,
  onPushTokenChange,
  useNotificationNavigation,
} from './index';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

const notifications = jest.mocked(Notifications);

function tap(id: string, data: Record<string, unknown>) {
  return { notification: { request: { identifier: id, content: { data } } } } as never;
}

describe('notifications', () => {
  it('shows notifications in the foreground and creates the Android channel', () => {
    Platform.OS = 'android';
    configureNotifications();
    expect(notifications.setNotificationHandler).toHaveBeenCalled();
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', {
      name: 'General',
      importance: AndroidImportance.DEFAULT,
    });
    Platform.OS = 'ios';
  });

  it('exposes the permission as a source for usePermission', async () => {
    await notificationPermission.get();
    await notificationPermission.request();
    expect(notifications.getPermissionsAsync).toHaveBeenCalled();
    expect(notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('opens validated links from tapped notifications, once each', async () => {
    let listener: ((response: Notifications.NotificationResponse) => void) | undefined;
    notifications.addNotificationResponseReceivedListener.mockImplementation((handler) => {
      listener = handler;
      return { remove: jest.fn() };
    });
    notifications.getLastNotificationResponse.mockReturnValue(
      tap('launch', { url: 'templateapp://items/7' }),
    );
    await renderHook(() => {
      useNotificationNavigation();
    });
    expect(router.push).toHaveBeenCalledWith('/items/7');

    listener?.(tap('n1', { url: 'https://evil.example/admin' }));
    listener?.(tap('n2', { url: 42 }));
    listener?.(tap('n3', { url: '/items/9' }));
    listener?.(tap('n3', { url: '/items/9' }));
    expect(jest.mocked(router.push).mock.calls).toEqual([['/items/7'], ['/items/9']]);
  });

  // What the API sends for a changed password (apps/api/src/infrastructure/push/push.templates.ts).
  it('opens Settings from the security notice the API sends', async () => {
    let listener: ((response: Notifications.NotificationResponse) => void) | undefined;
    notifications.addNotificationResponseReceivedListener.mockImplementation((handler) => {
      listener = handler;
      return { remove: jest.fn() };
    });
    await renderHook(() => {
      useNotificationNavigation();
    });
    listener?.(tap('password-changed', { url: '/settings' }));
    expect(router.push).toHaveBeenCalledWith('/settings');
  });

  it('tells when the push service replaces the token, until unsubscribed', () => {
    const remove = jest.fn();
    let tokenListener: (() => void) | undefined;
    notifications.addPushTokenListener.mockImplementation((handler) => {
      tokenListener = () => {
        handler({ type: 'android', data: 'new-device-token' });
      };
      return { remove };
    });
    const listener = jest.fn();
    const unsubscribe = onPushTokenChange(listener);
    tokenListener?.();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(remove).toHaveBeenCalled();
  });
});

describe('getPushToken', () => {
  it('gets the Expo push token when the EAS project is known', async () => {
    Object.assign(Constants, { expoConfig: { extra: { eas: { projectId: 'project-1' } } } });
    await expect(getPushToken()).resolves.toEqual({
      kind: 'expo',
      value: 'ExponentPushToken[test]',
      platform: 'ios',
    });
    expect(notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });
  });

  it('names the platform the token is for', async () => {
    Object.assign(Constants, { expoConfig: { extra: { eas: { projectId: 'project-1' } } } });
    Platform.OS = 'android';
    await expect(getPushToken()).resolves.toMatchObject({ platform: 'android' });
    Platform.OS = 'ios';
  });

  it('is unavailable without an EAS project id, and on simulators', async () => {
    Object.assign(Constants, { expoConfig: { extra: {} } });
    await expect(getPushToken()).resolves.toBeNull();
    Object.assign(Constants, { expoConfig: { extra: { eas: { projectId: 'project-1' } } } });
    jest.replaceProperty(Device, 'isDevice', false);
    await expect(getPushToken()).resolves.toBeNull();
    expect(notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });
});

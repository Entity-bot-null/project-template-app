import { renderHook, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { BEFORE_SIGN_OUT_TIMEOUT_MS, session, useSessionStore } from '@/auth/session';
import { persistentStorage, STORAGE_KEYS } from '@/lib/storage';
import { session as sessionFixture, user } from '@/test/fixtures';
import { bodyOf, deferred, failure, noContent, stubFetch, type StubbedFetch } from '@/test/http';
import { endTestSession, signInForTest } from '@/test/session';

import { registerForPush, unregisterFromPush } from './api';
import { usePushRegistration } from './usePushRegistration';

// This installation's push notifications against the (stubbed) API: the
// registration, what it is sent under, and the removal before a sign-out.

jest.mock('expo-device', () => ({ __esModule: true, isDevice: true }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}));

const notifications = jest.mocked(Notifications);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let fetchStub: StubbedFetch;

function allow() {
  notifications.getPermissionsAsync.mockResolvedValue({
    granted: true,
    canAskAgain: true,
    status: 'granted',
  } as never);
}

function sent(method: string, path: string) {
  return fetchStub.requests.filter(
    (request) => request.method === method && new URL(request.url).pathname.startsWith(path),
  );
}

function deviceIdOf(request: Request) {
  return new URL(request.url).pathname.split('/').at(-1);
}

beforeEach(async () => {
  fetchStub = stubFetch({
    'PUT /api/devices/:installationId': () => noContent(),
    'DELETE /api/devices/:installationId': () => noContent(),
  });
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  await signInForTest(fetchStub);
});

afterEach(async () => {
  await endTestSession(fetchStub);
  fetchStub.restore();
});

describe('registerForPush', () => {
  it('registers nothing until the user allowed notifications, and never asks', async () => {
    await registerForPush();
    expect(sent('PUT', '/api/devices/')).toHaveLength(0);
    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('registers the Expo push token under an id of this installation, kept for next time', async () => {
    allow();
    await registerForPush();
    const [first] = sent('PUT', '/api/devices/');
    expect(first!.headers.get('Authorization')).toBe('Bearer access-test');
    expect(await bodyOf(first!)).toEqual({
      pushToken: 'ExponentPushToken[test]',
      platform: 'ios',
      kind: 'expo',
    });
    const id = deviceIdOf(first!);
    expect(id).toMatch(UUID_V4);
    expect(await persistentStorage.getItem(STORAGE_KEYS.pushInstallationId)).toBe(id);

    await registerForPush();
    expect(sent('PUT', '/api/devices/').map(deviceIdOf)).toEqual([id, id]);
  });

  it('replaces a stored id that is not one', async () => {
    allow();
    await persistentStorage.setItem(STORAGE_KEYS.pushInstallationId, 'not-an-id');
    await registerForPush();
    expect(deviceIdOf(sent('PUT', '/api/devices/')[0]!)).toMatch(UUID_V4);
  });

  it('sends nothing where push is unavailable (no EAS project id, a simulator)', async () => {
    allow();
    jest.replaceProperty(Constants, 'expoConfig', { extra: {} } as never);
    await registerForPush();
    jest.replaceProperty(Device, 'isDevice', false);
    await registerForPush();
    expect(sent('PUT', '/api/devices/')).toHaveLength(0);
  });

  it('never rejects: a refused registration or a failing push service is reported', async () => {
    allow();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchStub.on('PUT /api/devices/:installationId', () => failure(503, 'Maintenance'));
    await expect(registerForPush()).resolves.toBeUndefined();
    notifications.getExpoPushTokenAsync.mockRejectedValueOnce(new Error('FCM not configured'));
    await expect(registerForPush()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
  });
});

describe('unregisterFromPush', () => {
  it('removes nothing when this installation never registered', async () => {
    await unregisterFromPush();
    expect(sent('DELETE', '/api/devices/')).toHaveLength(0);
  });

  it('removes the installation it registered', async () => {
    allow();
    await registerForPush();
    const id = deviceIdOf(sent('PUT', '/api/devices/')[0]!);
    await unregisterFromPush();
    expect(sent('DELETE', '/api/devices/').map(deviceIdOf)).toEqual([id]);
  });

  it('takes an installation the API does not know for removed, quietly', async () => {
    allow();
    await registerForPush();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchStub.on('DELETE /api/devices/:installationId', () => failure(404, 'Device not found'));
    await expect(unregisterFromPush()).resolves.toBeUndefined();
    expect(error).not.toHaveBeenCalled();
  });

  it('never rejects offline', async () => {
    allow();
    await registerForPush();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchStub.on('DELETE /api/devices/:installationId', () =>
      Promise.reject(new TypeError('Network request failed')),
    );
    await expect(unregisterFromPush()).resolves.toBeUndefined();
  });
});

describe('usePushRegistration', () => {
  it('registers at once, and again at a sign-in and when the token is replaced', async () => {
    allow();
    let tokenChanged: (() => void) | undefined;
    notifications.addPushTokenListener.mockImplementation((listener) => {
      tokenChanged = () => {
        listener({ type: 'ios', data: 'apns-token' });
      };
      return { remove: jest.fn() };
    });
    await renderHook(() => {
      usePushRegistration();
    });
    await waitFor(() => {
      expect(sent('PUT', '/api/devices/')).toHaveLength(1);
    });

    // Another account adopted on this phone (an accepted invitation).
    await session.adopt(sessionFixture('2', { ...user, id: 'another-user' }));
    await waitFor(() => {
      expect(sent('PUT', '/api/devices/')).toHaveLength(2);
    });
    expect(sent('PUT', '/api/devices/')[1]!.headers.get('Authorization')).toBe('Bearer access-2');

    tokenChanged?.();
    await waitFor(() => {
      expect(sent('PUT', '/api/devices/')).toHaveLength(3);
    });
  });

  it('removes this installation at sign-out, before the session is revoked', async () => {
    allow();
    fetchStub.on('POST /api/auth/logout', () => noContent());
    await renderHook(() => {
      usePushRegistration();
    });
    await waitFor(() => {
      expect(sent('PUT', '/api/devices/')).toHaveLength(1);
    });
    await session.signOut();
    const order = fetchStub.requests.map(
      (request) => `${request.method} ${new URL(request.url).pathname}`,
    );
    const removedAt = order.findIndex((call) => call.startsWith('DELETE /api/devices/'));
    expect(removedAt).toBeGreaterThan(-1);
    expect(order.indexOf('POST /api/auth/logout')).toBeGreaterThan(removedAt);
    // Sent with the session that was ending, still valid then.
    expect(sent('DELETE', '/api/devices/')[0]!.headers.get('Authorization')).toBe(
      'Bearer access-test',
    );
    expect(await bodyOf(sent('POST', '/api/auth/logout')[0]!)).toEqual({
      refreshToken: 'refresh-test',
    });
  });

  it('signs out after BEFORE_SIGN_OUT_TIMEOUT_MS when the server does not answer', async () => {
    allow();
    await persistentStorage.setItem(
      STORAGE_KEYS.pushInstallationId,
      '00000000-0000-4000-8000-000000000001',
    );
    const pending = deferred();
    fetchStub.on('DELETE /api/devices/:installationId', () => pending.promise);
    fetchStub.on('POST /api/auth/logout', () => noContent());
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      await renderHook(() => {
        usePushRegistration();
      });
      const signedOut = session.signOut();
      await waitFor(() => {
        expect(sent('DELETE', '/api/devices/')).toHaveLength(1);
      });
      expect(useSessionStore.getState().status).toBe('signedIn');
      jest.advanceTimersByTime(BEFORE_SIGN_OUT_TIMEOUT_MS);
      await signedOut;
      expect(useSessionStore.getState().status).toBe('signedOut');
      expect(sent('POST', '/api/auth/logout')).toHaveLength(1);
    } finally {
      pending.resolve(noContent());
      jest.useRealTimers();
    }
  });

  it('stops listening once unmounted: no removal at a later sign-out', async () => {
    allow();
    fetchStub.on('POST /api/auth/logout', () => noContent());
    const hook = await renderHook(() => {
      usePushRegistration();
    });
    await waitFor(() => {
      expect(sent('PUT', '/api/devices/')).toHaveLength(1);
    });
    await hook.unmount();
    await session.signOut();
    expect(sent('DELETE', '/api/devices/')).toHaveLength(0);
  });
});

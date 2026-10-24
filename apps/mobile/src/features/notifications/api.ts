import { api } from '@/api/client';
import { expectSuccess } from '@/api/unwrap';
import { toAppError } from '@/lib/errors';
import { getPushToken, notificationPermission, type PushTokenRegistrar } from '@/lib/notifications';
import { logger, reportError } from '@/lib/observability';
import { persistentStorage, STORAGE_KEYS } from '@/lib/storage';

// This installation's push notifications with the API
// (docs/mobile-architecture.md#notifications). The installation names itself
// with a random id and registers its Expo push token for the signed-in
// account: PUT /api/devices/{installationId}, safe to repeat, at every start
// and sign-in once the user allowed notifications, when they allow them in
// Settings, and when the push service replaces the token. At sign-out,
// before the session ends, DELETE stops the notifications to this phone.
// Nothing here asks for the permission: Settings does, after explaining it.

const INSTALLATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The id this installation registers under, made the first time. */
async function installationId(): Promise<string> {
  const stored = await persistentStorage.getItem(STORAGE_KEYS.pushInstallationId);
  if (stored !== null && INSTALLATION_ID.test(stored)) return stored;
  const created = globalThis.expo.uuidv4();
  await persistentStorage.setItem(STORAGE_KEYS.pushInstallationId, created);
  return created;
}

/** This installation's registration with the API's devices. */
export const apiPushRegistrar: PushTokenRegistrar = {
  async register(token) {
    const id = await installationId();
    await expectSuccess(
      api.PUT('/api/devices/{installationId}', {
        params: { path: { installationId: id } },
        body: { pushToken: token.value, platform: token.platform, kind: 'expo' },
      }),
    );
  },

  async unregister() {
    const id = await persistentStorage.getItem(STORAGE_KEYS.pushInstallationId);
    // Never registered from here: nothing to remove.
    if (id === null || !INSTALLATION_ID.test(id)) return;
    try {
      await expectSuccess(
        api.DELETE('/api/devices/{installationId}', {
          params: { path: { installationId: id } },
        }),
      );
    } catch (error) {
      // Not registered for this account (never allowed, or already removed).
      if (toAppError(error).kind !== 'notFound') throw error;
    }
  },
};

/**
 * Registers this installation for push notifications when the user allowed
 * them; otherwise does nothing. Never rejects: a failure is reported, and the
 * next start or sign-in registers again.
 */
export async function registerForPush(
  registrar: PushTokenRegistrar = apiPushRegistrar,
): Promise<void> {
  try {
    if (!(await notificationPermission.get()).granted) return;
    const token = await getPushToken();
    if (token === null) {
      logger.info('app', 'Push unavailable here (a simulator, or no EAS project id)');
      return;
    }
    await registrar.register(token);
    logger.info('app', 'Push token registered');
  } catch (error) {
    reportError(error, { tags: { feature: 'notifications', step: 'register' } });
  }
}

/**
 * Stops push notifications to this installation, at sign-out while the
 * session still works (session.onBeforeSignOut). Never rejects: offline, the
 * server keeps the registration until another account registers here or the
 * push service reports the token gone.
 */
export async function unregisterFromPush(
  registrar: PushTokenRegistrar = apiPushRegistrar,
): Promise<void> {
  try {
    await registrar.unregister();
  } catch (error) {
    reportError(error, { tags: { feature: 'notifications', step: 'unregister' } });
  }
}

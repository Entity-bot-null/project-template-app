import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MISSING_ID } from '../../test/access.js';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { asUser, seedUser, signIn } from '../../test/auth.js';
import { envelopeOf } from '../../test/http.js';

// The devices push notifications go to, over HTTP on the real database:
// who can register and remove an installation, and what a registration does
// to the rows of the token and of the installation.

const INSTALLATION = '0190b6a1-0000-4000-8000-0000000000a1';
const OTHER_INSTALLATION = '0190b6a1-0000-4000-8000-0000000000a2';
const TOKEN = 'ExponentPushToken[integration-token-1]';

describe('Devices (integration)', () => {
  let t: TestApp;
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    t = await createTestApp();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    alice = await seedUser(t.prisma, { email: 'alice@example.com' });
    bob = await seedUser(t.prisma, { email: 'bob@example.com' });
  });

  afterAll(async () => {
    await t.app.close();
  });

  const asAlice = () => asUser(t.app, alice.id);
  const asBob = () => asUser(t.app, bob.id);
  const register = (installation: string, headers: Record<string, string>, body: object) =>
    request(t.server).put(`/api/devices/${installation}`).set(headers).send(body);
  const devices = () =>
    t.prisma.device.findMany({
      select: {
        installationId: true,
        userId: true,
        pushToken: true,
        platform: true,
        appVersion: true,
        disabledAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

  it('needs a signed-in user', async () => {
    await register(INSTALLATION, {}, { pushToken: TOKEN, platform: 'ios' }).expect(401);
    await request(t.server).delete(`/api/devices/${INSTALLATION}`).expect(401);
  });

  it('registers an installation for the caller, and a repeat replaces it', async () => {
    await register(
      INSTALLATION,
      { ...asAlice(), 'X-App-Version': '1.2.0' },
      {
        pushToken: TOKEN,
        platform: 'ios',
      },
    ).expect(204);
    await register(INSTALLATION, asAlice(), {
      pushToken: 'ExpoPushToken[integration-token-2]',
      platform: 'ios',
      kind: 'expo',
    }).expect(204);
    expect(await devices()).toEqual([
      {
        installationId: INSTALLATION,
        userId: alice.id,
        pushToken: 'ExpoPushToken[integration-token-2]',
        platform: 'ios',
        appVersion: null,
        disabledAt: null,
      },
    ]);
  });

  it('moves an installation to whoever signs in on it, and a token to its new installation', async () => {
    await register(INSTALLATION, asAlice(), { pushToken: TOKEN, platform: 'android' }).expect(204);
    // Bob signs in on Alice's phone: the installation is his now.
    await register(INSTALLATION, asBob(), { pushToken: TOKEN, platform: 'android' }).expect(204);
    expect((await devices()).map((device) => device.userId)).toEqual([bob.id]);
    // The app reinstalled: a new installation, the same token.
    await register(OTHER_INSTALLATION, asBob(), { pushToken: TOKEN, platform: 'android' }).expect(
      204,
    );
    expect((await devices()).map((device) => device.installationId)).toEqual([OTHER_INSTALLATION]);
  });

  it('brings back a device whose token the push service had reported dead', async () => {
    await register(INSTALLATION, asAlice(), { pushToken: TOKEN, platform: 'ios' }).expect(204);
    await t.prisma.device.updateMany({ data: { disabledAt: new Date() } });
    await register(INSTALLATION, asAlice(), { pushToken: TOKEN, platform: 'ios' }).expect(204);
    expect((await devices())[0]?.disabledAt).toBeNull();
  });

  it('refuses what is not an installation id, an Expo push token or a platform', async () => {
    await register('not-a-uuid', asAlice(), { pushToken: TOKEN, platform: 'ios' }).expect(400);
    const badToken = await register(INSTALLATION, asAlice(), {
      pushToken: 'fcm:abcdef',
      platform: 'ios',
    }).expect(400);
    expect(envelopeOf(badToken).message).toMatch(/^pushToken: /);
    await register(INSTALLATION, asAlice(), { pushToken: TOKEN, platform: 'web' }).expect(400);
    await register(INSTALLATION, asAlice(), {
      pushToken: TOKEN,
      platform: 'ios',
      kind: 'fcm',
    }).expect(400);
    expect(await devices()).toEqual([]);
  });

  it("removes only the caller's installation; any other answers like a missing one", async () => {
    await register(INSTALLATION, asAlice(), { pushToken: TOKEN, platform: 'ios' }).expect(204);
    const foreign = await request(t.server)
      .delete(`/api/devices/${INSTALLATION}`)
      .set(asBob())
      .expect(404);
    const missing = await request(t.server)
      .delete(`/api/devices/${MISSING_ID}`)
      .set(asAlice())
      .expect(404);
    expect(foreign.body).toEqual(missing.body);
    await request(t.server).delete(`/api/devices/${INSTALLATION}`).set(asAlice()).expect(204);
    expect(await devices()).toEqual([]);
  });

  it('goes with the account, and queues no notification while push is off', async () => {
    await register(INSTALLATION, asAlice(), { pushToken: TOKEN, platform: 'ios' }).expect(204);
    const session = await signIn(t.server, 'alice@example.com');
    await request(t.server)
      .post('/api/account/password')
      .set({ Authorization: `Bearer ${session.accessToken}` })
      .send({ currentPassword: 'correct-horse-battery', newPassword: 'a quiet harbor at dawn' })
      .expect(200);
    expect(await t.prisma.pushMessage.count()).toBe(0);
    await t.prisma.user.delete({ where: { id: alice.id } });
    expect(await devices()).toEqual([]);
  });
});

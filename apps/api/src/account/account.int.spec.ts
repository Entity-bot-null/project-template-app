import { Logger } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, resetDatabase, type TestApp } from '../../test/app.js';
import { bearer, seedUser, sessionOf, signIn, TEST_PASSWORD } from '../../test/auth.js';
import {
  deleteMessagesTo,
  mailTestOptions,
  messagesTo,
  skipWithoutMailpit,
  testAddress,
} from '../../test/mailpit.js';
import { MailWorker } from '../infrastructure/mail/mail-worker.service.js';
import { MAIL_OPTIONS } from '../infrastructure/mail/mail.constants.js';

// Changing the password and deleting the account while signed in, against
// PostgreSQL and Mailpit: two devices signed in to one account; the one that
// changes the password carries on in a new session, the other is signed out
// at once; a deletion signs both out and leaves nothing of the account.

const NEW_PASSWORD = 'violet harbour lantern 7';

describe.skipIf(skipWithoutMailpit)('password change (PostgreSQL + Mailpit)', () => {
  let t: TestApp;
  let worker: MailWorker;
  const addresses: string[] = [];

  async function account() {
    const email = testAddress();
    addresses.push(email);
    return seedUser(t.prisma, { email, name: 'Grace Hopper' });
  }

  const change = (accessToken: string, currentPassword: string, newPassword = NEW_PASSWORD) =>
    request(t.server)
      .post('/api/account/password')
      .set(bearer(accessToken))
      .send({ currentPassword, newPassword });

  beforeEach(async () => {
    t = await createTestApp((builder) =>
      builder.overrideProvider(MAIL_OPTIONS).useValue(mailTestOptions()),
    );
    worker = t.app.get(MailWorker);
    vi.spyOn(worker, 'wake').mockImplementation(() => undefined);
    await resetDatabase(t.prisma);
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(async () => {
    await t.app.close();
    for (const email of addresses.splice(0)) await deleteMessagesTo(email);
  });

  it('carries this device on in a new session, signs every other one out at once, and notifies', async () => {
    const grace = await account();
    const here = await signIn(t.server, grace.email);
    const elsewhere = await signIn(t.server, grace.email);

    const res = await change(here.accessToken, TEST_PASSWORD).expect(200);
    // The session this device adopts: both tokens in the body.
    const fresh = sessionOf(res);
    expect(fresh.user.email).toBe(grace.email);
    expect(fresh.refreshToken).not.toBe(here.refreshToken);

    // The other device: its access token and its refresh token, both refused now.
    await request(t.server).get('/api/users/me').set(bearer(elsewhere.accessToken)).expect(401);
    await request(t.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: elsewhere.refreshToken })
      .expect(401);
    // This device: the old tokens ended too; the new session works.
    await request(t.server).get('/api/users/me').set(bearer(here.accessToken)).expect(401);
    await request(t.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: here.refreshToken })
      .expect(401);
    await request(t.server).get('/api/users/me').set(bearer(fresh.accessToken)).expect(200);
    await request(t.server)
      .post('/api/auth/refresh')
      .send({ refreshToken: fresh.refreshToken })
      .expect(200);

    await signIn(t.server, grace.email, NEW_PASSWORD);
    await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: grace.email, password: TEST_PASSWORD })
      .expect(401);
    await worker.runOnce();
    expect((await messagesTo(grace.email)).map((m) => m.Subject)).toEqual([
      'Your Integration password was changed',
    ]);
  });

  it('asks for the current password again: a wrong one changes nothing and signs nobody out', async () => {
    const grace = await account();
    const session = await signIn(t.server, grace.email);
    await change(session.accessToken, 'not the current password').expect(403);
    await request(t.server).get('/api/users/me').set(bearer(session.accessToken)).expect(200);
    await signIn(t.server, grace.email, TEST_PASSWORD);
    expect(await t.prisma.mailMessage.count()).toBe(0);
  });

  it('refuses a weak new password', async () => {
    const grace = await account();
    const session = await signIn(t.server, grace.email);
    for (const weak of ['short one', 'correcthorsebatterystaple', 'grace hopper was here']) {
      await change(session.accessToken, TEST_PASSWORD, weak).expect(400);
    }
  });

  it('lets one of two simultaneous changes through, the other is told it changed meanwhile', async () => {
    const grace = await account();
    const one = await signIn(t.server, grace.email);
    const two = await signIn(t.server, grace.email);
    const results = await Promise.all([
      change(one.accessToken, TEST_PASSWORD, NEW_PASSWORD),
      change(two.accessToken, TEST_PASSWORD, `${NEW_PASSWORD} again`),
    ]);
    // Exactly one wins. The other lost the race inside the transaction (409),
    // or arrived once the winner's new securityVersion had already ended its
    // access token (401): never a second change.
    const statuses = results.map((res) => res.status);
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status !== 200)).toEqual([
      expect.toSatisfy((status: number) => status === 401 || status === 409),
    ]);
    const account2 = await t.prisma.user.findUniqueOrThrow({ where: { id: grace.id } });
    expect(account2.securityVersion).toBe(1);
  });

  it('needs a session, and refuses a request another site made a browser send', async () => {
    await request(t.server)
      .post('/api/account/password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
    const grace = await account();
    const session = await signIn(t.server, grace.email);
    await request(t.server)
      .post('/api/account/password')
      .set(bearer(session.accessToken))
      .set('Sec-Fetch-Site', 'cross-site')
      .set('Origin', 'https://evil.example')
      .send({ currentPassword: TEST_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(403);
  });
});

describe.skipIf(skipWithoutMailpit)('account deletion (PostgreSQL + Mailpit)', () => {
  let t: TestApp;
  let worker: MailWorker;
  const addresses: string[] = [];

  async function account(role: 'admin' | 'member' = 'member') {
    const email = testAddress();
    addresses.push(email);
    return seedUser(t.prisma, { email, name: 'Grace Hopper', role });
  }

  const deletion = (accessToken: string, password: string) =>
    request(t.server).post('/api/account/deletion').set(bearer(accessToken)).send({ password });

  beforeEach(async () => {
    t = await createTestApp((builder) =>
      builder.overrideProvider(MAIL_OPTIONS).useValue(mailTestOptions()),
    );
    worker = t.app.get(MailWorker);
    vi.spyOn(worker, 'wake').mockImplementation(() => undefined);
    await resetDatabase(t.prisma);
  });
  afterEach(async () => {
    await t.app.close();
    for (const email of addresses.splice(0)) await deleteMessagesTo(email);
  });

  it('deletes the account and all it owns, signs every device out, and tells the address', async () => {
    const grace = await account();
    const ada = await account();
    const phone = await signIn(t.server, grace.email);
    const tablet = await signIn(t.server, grace.email);
    await t.prisma.item.createMany({
      data: [
        { ownerId: grace.id, title: 'Grace’s' },
        { ownerId: ada.id, title: 'Ada’s' },
      ],
    });
    await t.prisma.accountToken.create({
      data: {
        userId: grace.id,
        purpose: 'password_reset',
        tokenHash: 'a'.repeat(64),
        securityVersion: 0,
        email: grace.email,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const res = await deletion(phone.accessToken, TEST_PASSWORD).expect(204);
    expect(res.body).toEqual({});

    // Every device out at once: access tokens and refresh tokens.
    for (const device of [phone, tablet]) {
      await request(t.server).get('/api/users/me').set(bearer(device.accessToken)).expect(401);
      await request(t.server)
        .post('/api/auth/refresh')
        .send({ refreshToken: device.refreshToken })
        .expect(401);
    }
    await request(t.server)
      .post('/api/auth/sign-in')
      .send({ email: grace.email, password: TEST_PASSWORD })
      .expect(401);
    // Nothing of the account is left; nobody else's data is touched.
    await expect(t.prisma.user.findUnique({ where: { id: grace.id } })).resolves.toBeNull();
    await expect(t.prisma.item.findMany({ select: { title: true } })).resolves.toEqual([
      { title: 'Ada’s' },
    ]);
    await expect(t.prisma.session.count({ where: { userId: grace.id } })).resolves.toBe(0);
    await expect(t.prisma.accountToken.count()).resolves.toBe(0);

    // The notice belongs to no account; its address goes once it is sent.
    await worker.runOnce();
    expect((await messagesTo(grace.email)).map((m) => m.Subject)).toEqual([
      'Your Integration account was deleted',
    ]);
    await expect(
      t.prisma.mailMessage.findMany({ select: { kind: true, userId: true, recipient: true } }),
    ).resolves.toEqual([{ kind: 'account_deleted', userId: null, recipient: null }]);
  });

  it('asks for the password again: a wrong one deletes nothing and signs nobody out', async () => {
    const grace = await account();
    const session = await signIn(t.server, grace.email);
    const res = await deletion(session.accessToken, 'not the password').expect(403);
    expect(res.body).toEqual({ data: null, message: 'The password is wrong' });
    await request(t.server).get('/api/users/me').set(bearer(session.accessToken)).expect(200);
    expect(await t.prisma.mailMessage.count()).toBe(0);
  });

  it('refuses the only administrator; one of two may leave, the last one may not', async () => {
    const first = await account('admin');
    const firstSession = await signIn(t.server, first.email);
    const refused = await deletion(firstSession.accessToken, TEST_PASSWORD).expect(409);
    expect(refused.body).toEqual({
      data: null,
      message: 'The only administrator cannot delete their account',
    });

    const second = await account('admin');
    const secondSession = await signIn(t.server, second.email);
    // Both at once: the administrators' lock lets exactly one through.
    const results = await Promise.all([
      deletion(firstSession.accessToken, TEST_PASSWORD),
      deletion(secondSession.accessToken, TEST_PASSWORD),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    await expect(t.prisma.user.count({ where: { role: 'admin' } })).resolves.toBe(1);
  });

  it('needs a session and a password, and refuses what another site made a browser send', async () => {
    await request(t.server)
      .post('/api/account/deletion')
      .send({ password: TEST_PASSWORD })
      .expect(401);
    const grace = await account();
    const session = await signIn(t.server, grace.email);
    const invalid = await request(t.server)
      .post('/api/account/deletion')
      .set(bearer(session.accessToken))
      .send({})
      .expect(400);
    expect(invalid.body).toMatchObject({ errors: [{ path: 'password' }] });
    await request(t.server)
      .post('/api/account/deletion')
      .set(bearer(session.accessToken))
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ password: TEST_PASSWORD })
      .expect(403);
    await expect(t.prisma.user.count({ where: { id: grace.id } })).resolves.toBe(1);
  });
});

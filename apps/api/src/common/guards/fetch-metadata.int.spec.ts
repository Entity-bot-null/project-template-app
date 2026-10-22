import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, resetDatabase, type TestApp } from '../../../test/app.js';
import { seedUser, sessionOf, signIn } from '../../../test/auth.js';

// Browsers that send no Fetch Metadata (Safari before 16.4, any page served
// over plain HTTP from a non-local address) still name the page that made
// them send a request in its Origin header. The integration env serves the
// app from APP_ORIGIN=https://app.example.com (vitest.config.int.ts).

const EMAIL = 'origin-check@example.com';

describe('CSRF guard without Fetch Metadata (integration)', () => {
  let t: TestApp;
  let ownOrigin: string;

  beforeAll(async () => {
    t = await createTestApp();
    // A fixed address, so the Host every request carries is known.
    await new Promise<void>((resolve) => t.server.listen(0, '127.0.0.1', resolve));
    ownOrigin = `http://127.0.0.1:${String((t.server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await t.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(t.prisma);
    await seedUser(t.prisma, { email: EMAIL });
  });

  const refreshFrom = (refreshToken: string, origin?: string) => {
    const pending = request(ownOrigin).post('/api/auth/refresh');
    return (origin === undefined ? pending : pending.set('Origin', origin)).send({ refreshToken });
  };

  it('refuses a request another site made an older browser send, before it touches the session', async () => {
    const session = await signIn(t.server, EMAIL);
    const refused = await refreshFrom(session.refreshToken, 'https://attacker.example.net');
    expect(refused.status).toBe(403);
    expect(refused.body).toEqual({ data: null, message: 'Cross-origin request refused' });
    // A sibling subdomain is another origin too, and so is an opaque one
    // (a sandboxed frame, a file).
    await refreshFrom(session.refreshToken, 'https://sibling.example.com').expect(403);
    await refreshFrom(session.refreshToken, 'null').expect(403);
    // The refresh token was never rotated: it still works once.
    await refreshFrom(session.refreshToken).expect(200);
  });

  it("accepts the app's own origin: APP_ORIGIN, or the address the request was sent to", async () => {
    const first = await signIn(t.server, EMAIL);
    const fromApp = await refreshFrom(first.refreshToken, 'https://app.example.com').expect(200);
    await refreshFrom(sessionOf(fromApp).refreshToken, ownOrigin).expect(200);
  });

  it('lets the app and other non-browser clients through: they send no Origin', async () => {
    const session = await signIn(t.server, EMAIL);
    await refreshFrom(session.refreshToken).expect(200);
  });
});

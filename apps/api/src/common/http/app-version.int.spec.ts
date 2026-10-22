import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../../test/app.js';
import { SIGN_IN_RATE_LIMIT } from '../../auth/auth.constants.js';
import { UPGRADE_REQUIRED } from './app-version.middleware.js';

// The minimum app version through the whole HTTP pipeline: the integration
// env serves Android 2.0.0 and up, and any iOS version (vitest.config.int.ts).

const androidApp = (version: string) => ({ 'X-App-Platform': 'android', 'X-App-Version': version });

describe('minimum app version (integration)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => {
    await t.app.close();
  });

  it('answers 426 to an older app before authentication and validation', async () => {
    const signIn = await request(t.server)
      .post('/api/auth/sign-in')
      .set(androidApp('1.9.9'))
      .send({})
      .expect(426);
    expect(signIn.body).toEqual({ data: null, message: UPGRADE_REQUIRED });
    // Still an answer of the API: an id to quote, and never cached.
    expect(signIn.headers['x-request-id']).toBeDefined();
    expect(signIn.headers['cache-control']).toBe('no-store');
    await request(t.server).get('/api/items').set(androidApp('1.9.9')).expect(426);
  });

  it('counts no attempt against the rate limits: updated, the app signs in at once', async () => {
    for (let attempt = 0; attempt <= SIGN_IN_RATE_LIMIT.limit; attempt += 1) {
      await request(t.server)
        .post('/api/auth/sign-in')
        .set(androidApp('1.0.0'))
        .send({ email: 'nobody@example.com', password: 'wrong-password' })
        .expect(426);
    }
    await request(t.server)
      .post('/api/auth/sign-in')
      .set(androidApp('2.0.0'))
      .send({ email: 'nobody@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('serves the minimum and newer, platforms without one, other clients and the probes', async () => {
    await request(t.server).get('/api/items').set(androidApp('2.0.0')).expect(401);
    await request(t.server).get('/api/items').set(androidApp('10.1.0')).expect(401);
    await request(t.server)
      .get('/api/items')
      .set({ 'X-App-Platform': 'ios', 'X-App-Version': '0.0.1' })
      .expect(401);
    await request(t.server).get('/api/items').expect(401);
    await request(t.server).get('/api/health/live').set(androidApp('1.0.0')).expect(200);
  });
});

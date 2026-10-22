// Tests of the development proxy in apps/landing/astro.config.mjs
// (`node --test scripts/dev-proxy.test.mjs`): the real dev server, with the
// landing's own configuration, in front of a stand-in for the API that records
// what reaches it. A browser that sends no Fetch Metadata (Safari before 16.4,
// and any browser on a page over plain HTTP from a non-local address: a phone
// on the LAN testing the dev server) passes the API's CSRF guard only when its
// Origin is the address the request was sent to, read from Host
// (apps/api/src/common/guards/fetch-metadata.guard.ts). So the proxy must hand
// the API the Host the browser sent, not the API's own address.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer as createHttpServer, request } from 'node:http';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The landing's dev server is the site's single entry in development: /api to
// the API, with the Host the browser sent; every other path stays the
// landing's, the app's links (/app/*) included (the web image answers those).
const LANDING = fileURLToPath(new URL('../apps/landing/', import.meta.url));
/**
 * The part of Astro's programmatic dev server this test uses (Astro is the
 * landing's dependency, resolved from there).
 * @typedef {{ address: import('node:net').AddressInfo; stop(): Promise<void> }} AstroDevServer
 */
/** @type {{ dev(config: object): Promise<AstroDevServer> }} */
const astro = await import(
  pathToFileURL(createRequire(join(LANDING, 'package.json')).resolve('astro')).href
);

/** @type {{ host?: string; origin?: string; url?: string }[]} */
const received = [];
const api = createHttpServer((req, res) => {
  received.push({ host: req.headers.host, origin: req.headers.origin, url: req.url });
  res.writeHead(204).end();
});
/** @type {AstroDevServer} */
let landing;

before(async () => {
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const address = api.address();
  assert.ok(address !== null && typeof address === 'object');
  // Read by astro.config.mjs when the configuration loads.
  process.env.API_PROXY_TARGET = `http://127.0.0.1:${address.port}`;
  process.env.ASTRO_TELEMETRY_DISABLED = '1';
  landing = await astro.dev({
    root: LANDING,
    logLevel: 'silent',
    // An address the requests below can reach, on a free port.
    server: { host: '127.0.0.1', port: 0 },
    devToolbar: { enabled: false },
  });
});

after(async () => {
  await landing.stop();
  api.close();
});

/**
 * A request through the landing's dev server, as a browser at `host` sends it.
 * @param {string} method
 * @param {string} path
 * @param {string} host
 * @returns {Promise<{ status: number | undefined; body: string }>}
 */
function throughLanding(method, path, host) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: landing.address.port,
        method,
        path,
        headers: { Host: host, Origin: `http://${host}` },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8').on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

for (const { where, host } of [
  { where: 'on this machine', host: () => `localhost:${String(landing.address.port)}` },
  {
    where: 'from another device on the network (dev server started with --host)',
    host: () => `192.168.1.20:${String(landing.address.port)}`,
  },
]) {
  test(`forwards /api with the Host the browser sent, ${where}`, async () => {
    assert.equal((await throughLanding('POST', '/api/auth/refresh', host())).status, 204);
    assert.deepEqual(received.at(-1), {
      host: host(),
      origin: `http://${host()}`,
      url: '/api/auth/refresh',
    });
  });
}

test('keeps its own pages, even when their names start like the proxied path', async () => {
  const host = `localhost:${String(landing.address.port)}`;
  const before = received.length;
  const home = await throughLanding('GET', '/', host);
  assert.equal(home.status, 200);
  assert.match(home.body, /<html lang="en">/);
  assert.equal((await throughLanding('GET', '/apiary/', host)).status, 404);
  // The app's links are the web image's: never forwarded to the API.
  assert.equal((await throughLanding('GET', '/app/reset-password', host)).status, 404);
  assert.equal(received.length, before);
});

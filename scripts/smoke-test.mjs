// `pnpm smoke --url <public URL> --api <API URL> [--release <commit SHA>]
// [--require-app-links]`: the smoke test of the web image and the API, after a
// deployment, a restore or a recovery, and against the local stack
// (docs/testing.md#smoke-test).
// Read-only: it signs nobody in and writes nothing, so it is safe against
// production. Either URL may be left out to check one side only. Exits 1 when
// any check fails.
//
// Through the public URL (--url), what visitors and phones get:
//   GET /healthz                 200: the web server serves
//   GET /release.json            200 JSON: the build of the web image; its
//                                release is --release when given (the
//                                deployment checks it serves what it rolled out)
//   GET /                        200 HTML with the security headers: the
//                                landing, its links and share picture on this
//                                deployment's origin
//   GET /og.png                  200 PNG: that picture
//   GET /es/                     200: the landing in Spanish
//   GET /<unknown>               404 with the not-found page and the headers
//   GET /app/reset-password      200 with the open-in-app page, at that
//                                address (no redirect: an emailed link's token
//                                rides in its fragment), out of search results
//   GET /.well-known/apple-app-site-association
//   GET /.well-known/assetlinks.json
//                                200 JSON claiming /app/* for the app, never a
//                                redirect; 404 while the app's identity is not
//                                set (a failure with --require-app-links)
//   GET /api/<unknown>           404 in the API's envelope with a request id:
//                                the web server reaches the API and the API
//                                answers
//   GET /api/auth/capabilities   200 with the API's data: a route reaches its
//                                handler (an upstream with a path would send
//                                every call to that path)
//   GET /api/health/ready        404: the probes stay private
// On the API itself (--api, from inside the platform's network: the probes
// are not public):
//   GET /api/health/live         200
//   GET /api/health/ready        200; "degraded" (an optional dependency down)
//                                is reported without failing
import { parseArgs } from 'node:util';

const TIMEOUT_MS = 10_000;

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    api: { type: 'string' },
    release: { type: 'string' },
    'require-app-links': { type: 'boolean', default: false },
  },
});

/** @param {string | undefined} value @param {string} flag */
function baseUrl(value, flag) {
  if (value === undefined) return undefined;
  if (!/^https?:\/\/[^/?#\s]+\/?$/.test(value)) {
    console.error(`${flag} must be an origin, e.g. https://app.example.com (got "${value}")`);
    process.exit(2);
  }
  return value.replace(/\/$/, '');
}

const site = baseUrl(values.url, '--url');
const api = baseUrl(values.api, '--api');
if (site === undefined && api === undefined) {
  console.error(
    'Usage: pnpm smoke --url <public URL> --api <API URL> [--release <commit SHA>] [--require-app-links]',
  );
  process.exit(2);
}

let failures = 0;

/**
 * One request and its expectations; a thrown Error is a failed check.
 * @param {string} label
 * @param {string} url
 * @param {(response: Response, body: string) => string | void} check
 *   returns a note to print next to "ok"
 */
async function expect(label, url, check) {
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await response.text();
    const note = check(response, body);
    console.log(`ok    ${label}${note ? ` (${note})` : ''}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** @param {Response} response @param {number} expected */
function status(response, expected) {
  if (response.status !== expected) {
    throw new Error(`status ${response.status}, expected ${expected}`);
  }
}

/** @param {string} body @returns {unknown} */
function parse(body) {
  try {
    return /** @type {unknown} */ (JSON.parse(body));
  } catch {
    throw new Error(`not JSON: ${body.slice(0, 80)}`);
  }
}

/** @param {string} body @returns {Record<string, unknown>} */
function json(body) {
  const value = parse(body);
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return /** @type {Record<string, unknown>} */ (value);
  }
  throw new Error(`not a JSON object: ${body.slice(0, 80)}`);
}

/** The headers every page carries (apps/landing/nginx/security-headers.conf). @param {Response} response */
function securityHeaders(response) {
  for (const header of ['content-security-policy', 'x-content-type-options']) {
    if (!response.headers.has(header)) throw new Error(`no ${header} header`);
  }
}

/** The `data` of an API envelope. @param {string} body */
function data(body) {
  const value = json(body).data;
  if (typeof value !== 'object' || value === null) throw new Error('no data in the envelope');
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * A link file of the app: JSON when the app's identity is set, 404 while it
 * is not, nothing else (Apple and Google refuse a redirect).
 * @param {Response} response
 * @param {string} body
 * @param {(value: unknown) => string} describe what the file claims, or throws
 */
function appLinkFile(response, body, describe) {
  if (response.status === 404) {
    if (values['require-app-links']) throw new Error("status 404: the app's identity is not set");
    return "not set up (404): set the app's identity (docs/environment.md#web-variables)";
  }
  status(response, 200);
  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('application/json')) {
    throw new Error(`content-type ${type}, expected application/json`);
  }
  return describe(parse(body));
}

if (site !== undefined) {
  await expect('web server health', `${site}/healthz`, (response) => {
    status(response, 200);
  });

  await expect('release', `${site}/release.json`, (response, body) => {
    status(response, 200);
    const { release } = json(body);
    if (values.release !== undefined && release !== values.release) {
      throw new Error(`release ${String(release)}, expected ${values.release}`);
    }
    return `release ${String(release)}`;
  });

  await expect('landing', `${site}/`, (response, body) => {
    status(response, 200);
    if (!body.includes('<html lang="en">')) throw new Error('not the landing');
    securityHeaders(response);
    // Built for a placeholder origin, written with APP_ORIGIN as it is served.
    if (body.includes('public-origin.invalid')) throw new Error('links on the build placeholder');
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(body)?.[1];
    if (canonical === undefined) throw new Error('no canonical link');
    const picture = /<meta property="og:image" content="([^"]+)"/.exec(body)?.[1];
    if (picture === undefined) throw new Error('no share picture (og:image)');
    if (new URL(picture).origin !== new URL(canonical).origin) {
      throw new Error(`share picture on another origin: ${picture}`);
    }
    return `canonical ${canonical}`;
  });

  await expect('share picture', `${site}/og.png`, (response) => {
    status(response, 200);
    const type = response.headers.get('content-type') ?? '';
    if (!type.startsWith('image/png')) throw new Error(`content-type ${type}, expected image/png`);
  });

  await expect('landing in Spanish', `${site}/es/`, (response, body) => {
    status(response, 200);
    if (!body.includes('<html lang="es">')) throw new Error('not the Spanish landing');
  });

  await expect('not-found page', `${site}/smoke-test-unknown-page/`, (response, body) => {
    status(response, 404);
    if (!body.includes('<meta name="robots" content="noindex">')) {
      throw new Error("not the landing's not-found page");
    }
    securityHeaders(response);
  });

  await expect(
    "the app's links without the app",
    `${site}/app/reset-password`,
    (response, body) => {
      // No redirect: the token of an emailed link rides in the fragment.
      status(response, 200);
      if (!body.includes('<meta name="robots" content="noindex">')) {
        throw new Error('not the open-in-app page');
      }
      if (response.headers.get('x-robots-tag') !== 'noindex') throw new Error('no X-Robots-Tag');
      securityHeaders(response);
    },
  );

  await expect(
    "Apple's link file",
    `${site}/.well-known/apple-app-site-association`,
    (response, body) =>
      appLinkFile(response, body, (value) => {
        const details =
          /** @type {{ applinks?: { details?: { appIDs?: string[]; components?: Record<string, string>[] }[] } }} */ (
            value
          ).applinks?.details?.[0];
        if (!details?.components?.some((component) => component['/'] === '/app/*')) {
          throw new Error('does not claim /app/*');
        }
        return `for ${String(details.appIDs?.join(', '))}`;
      }),
  );

  await expect("Google's link file", `${site}/.well-known/assetlinks.json`, (response, body) =>
    appLinkFile(response, body, (value) => {
      const target =
        /** @type {{ target?: { package_name?: string; sha256_cert_fingerprints?: string[] } }[]} */ (
          Array.isArray(value) ? value : []
        )[0]?.target;
      if (!target?.package_name || !target.sha256_cert_fingerprints?.length) {
        throw new Error('no app or certificate in it');
      }
      return `for ${target.package_name}`;
    }),
  );

  await expect(
    'API through the web server',
    `${site}/api/smoke-test-unknown-route`,
    (response, body) => {
      status(response, 404);
      if (typeof json(body).message !== 'string') throw new Error('not the API error envelope');
      if (!response.headers.has('x-request-id')) throw new Error('no X-Request-Id header');
    },
  );

  await expect(
    'an API route through the web server',
    `${site}/api/auth/capabilities`,
    (response, body) => {
      status(response, 200);
      if (typeof data(body).signUp !== 'boolean') throw new Error('not what the API offers');
    },
  );

  await expect('probes not public', `${site}/api/health/ready`, (response) => {
    status(response, 404);
  });
}

if (api !== undefined) {
  await expect('API liveness', `${api}/api/health/live`, (response) => {
    status(response, 200);
  });

  await expect('API readiness', `${api}/api/health/ready`, (response, body) => {
    status(response, 200);
    const ready = data(body);
    if (ready.status === 'degraded') return `degraded: ${JSON.stringify(ready.checks)}`;
    if (ready.status !== 'ok') throw new Error(`status ${String(ready.status)}`);
    return undefined;
  });
}

// exitCode, not exit(): ending the process while fetch's connections are
// closing trips an assertion of libuv on Windows, and the status is lost.
if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log(
    site !== undefined && api !== undefined
      ? 'Smoke test passed.'
      : `Smoke test passed (${site === undefined ? 'API' : 'public URL'} only).`,
  );
}

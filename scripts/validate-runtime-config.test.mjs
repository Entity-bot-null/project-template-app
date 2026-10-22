// Tests of apps/landing/nginx/18-validate-runtime-config.sh
// (`node --test scripts/validate-runtime-config.test.mjs`): the real script,
// run with sh as the web image's entrypoint runs it, against valid and invalid
// runtime settings. The values end up inside nginx strings
// (default.conf.template) and inside JSON (the app's link files,
// 19-app-links.sh): a newline, a quote, a backslash or a `$` must stop the
// container with the variable's name, never pass.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../apps/landing/nginx/18-validate-runtime-config.sh', import.meta.url),
);

/** A POSIX sh: on PATH, or on Windows the one Git ships (the hooks run with it). */
function findShell() {
  if (spawnSync('sh', ['-c', 'exit 0']).status === 0) return 'sh';
  const gitExec = spawnSync('git', ['--exec-path'], { encoding: 'utf8' }).stdout?.trim() ?? '';
  const gitSh = join(gitExec, '..', '..', '..', 'bin', 'sh.exe');
  if (gitExec !== '' && existsSync(gitSh)) return gitSh;
  throw new Error('No POSIX sh found: install one (Git for Windows ships it) to run this test.');
}
const SH = findShell();

const FINGERPRINT = Array.from({ length: 32 }, (_, index) =>
  index.toString(16).toUpperCase().padStart(2, '0'),
).join(':');

/** What the image sets, a deployment's APP_ORIGIN, and what 15-local-resolvers.envsh exports. */
const VALID = {
  APP_ORIGIN: 'https://app.example.com',
  APP_RELEASE: 'unversioned',
  APPLE_TEAM_ID: '',
  IOS_BUNDLE_ID: '',
  ANDROID_PACKAGE: '',
  ANDROID_SHA256_CERT_FINGERPRINTS: '',
  NGINX_LOCAL_RESOLVERS: '127.0.0.11',
};

/** The app's identity, set by a deployment for its link files. */
const APP_IDENTITY = {
  APPLE_TEAM_ID: 'ABCDE12345',
  IOS_BUNDLE_ID: 'com.example.templateapp',
  ANDROID_PACKAGE: 'com.example.templateapp',
  ANDROID_SHA256_CERT_FINGERPRINTS: FINGERPRINT,
};

/** @typedef {keyof typeof VALID} Setting */

/**
 * @param {Partial<Record<Setting, string>>} overrides
 * @returns {{ status: number | null; stderr: string }}
 */
function validate(overrides = {}) {
  const run = spawnSync(SH, [SCRIPT], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, ...VALID, ...overrides },
  });
  assert.equal(run.error, undefined);
  return { status: run.status, stderr: run.stderr };
}

/**
 * @param {Setting} name
 * @param {string} value
 * @param {Partial<Record<Setting, string>>} [context] the other settings it needs
 */
function assertRefused(name, value, context = {}) {
  /** @type {Partial<Record<Setting, string>>} */
  const overrides = { ...context, [name]: value };
  const { status, stderr } = validate(overrides);
  assert.equal(status, 1, `${name}=${JSON.stringify(value)} was accepted`);
  assert.ok(stderr.includes(`Environment variable ${name} is invalid`), stderr);
  // The message names the variable, never its value.
  assert.ok(!stderr.includes('evil'), stderr);
}

describe('18-validate-runtime-config.sh', () => {
  test('accepts the image defaults with an origin, and a full app identity', () => {
    assert.deepEqual(validate(), { status: 0, stderr: '' });
    for (const origin of ['http://localhost:8090', 'https://www.example.co.uk:8443']) {
      assert.equal(validate({ APP_ORIGIN: origin }).status, 0, origin);
    }
    assert.deepEqual(validate(APP_IDENTITY), { status: 0, stderr: '' });
    assert.equal(
      validate({
        ...APP_IDENTITY,
        ANDROID_SHA256_CERT_FINGERPRINTS: `${FINGERPRINT},${FINGERPRINT.replaceAll('0', 'F')}`,
      }).status,
      0,
    );
  });

  test('refuses to start without the public origin, or with more than an origin', () => {
    // The image's default: a deployment must say where the site is.
    assertRefused('APP_ORIGIN', '');
    for (const value of [
      'app.example.com',
      'ftp://app.example.com',
      'https://app.example.com/',
      'https://app.example.com/app',
      'https://app.example.com?evil',
      'https://user@app.example.com',
    ]) {
      assertRefused('APP_ORIGIN', value);
    }
  });

  test('refuses a release that is not a plain build name: it is served inside JSON', () => {
    // The image's default, a commit SHA, and a version name pass.
    for (const release of ['unversioned', '97557ea1f0c2', 'v1.0.0+45']) {
      assert.equal(validate({ APP_RELEASE: release }).status, 0, release);
    }
    for (const value of ['', '-rc', 'a b', 'a/b', 'x'.repeat(129)])
      assertRefused('APP_RELEASE', value);
  });

  test('refuses a value with a newline, even when its first line is valid', () => {
    // grep matches line by line: the first line would carry the rest in.
    assertRefused('APP_ORIGIN', 'https://app.example.com\nevil');
    assertRefused('APP_RELEASE', 'unversioned\nevil');
    assertRefused('APPLE_TEAM_ID', 'ABCDE12345\nevil', APP_IDENTITY);
    assertRefused('IOS_BUNDLE_ID', 'com.example.app\nevil', APP_IDENTITY);
    assertRefused('ANDROID_PACKAGE', 'com.example.app\revil', APP_IDENTITY);
    assertRefused('ANDROID_SHA256_CERT_FINGERPRINTS', `${FINGERPRINT}\nevil`, APP_IDENTITY);
  });

  test('refuses quotes, backslashes and $ that would break the JSON or the nginx string', () => {
    for (const character of ['"', "'", '\\', '$']) {
      assertRefused('APP_ORIGIN', `https://app.example.com${character}evil`);
      assertRefused('APP_RELEASE', `unversioned${character}evil`);
      assertRefused('IOS_BUNDLE_ID', `com.example.app${character}evil`, APP_IDENTITY);
      assertRefused('ANDROID_PACKAGE', `com.example.app${character}evil`, APP_IDENTITY);
    }
  });

  test('refuses half of an app identity: a pair is set together or not at all', () => {
    assertRefused('IOS_BUNDLE_ID', '', { APPLE_TEAM_ID: APP_IDENTITY.APPLE_TEAM_ID });
    assertRefused('APPLE_TEAM_ID', '', { IOS_BUNDLE_ID: APP_IDENTITY.IOS_BUNDLE_ID });
    assertRefused('ANDROID_SHA256_CERT_FINGERPRINTS', '', {
      ANDROID_PACKAGE: APP_IDENTITY.ANDROID_PACKAGE,
    });
    assertRefused('ANDROID_PACKAGE', '', {
      ANDROID_SHA256_CERT_FINGERPRINTS: FINGERPRINT,
    });
  });

  test('refuses an app identity of the wrong shape', () => {
    for (const value of ['abcde12345', 'ABCDE1234', 'ABCDE123456']) {
      assertRefused('APPLE_TEAM_ID', value, APP_IDENTITY);
    }
    for (const value of ['templateapp', '.com.example', 'com..example']) {
      assertRefused('IOS_BUNDLE_ID', value, APP_IDENTITY);
    }
    for (const value of ['templateapp', 'com.example.1app', 'com-example.app']) {
      assertRefused('ANDROID_PACKAGE', value, APP_IDENTITY);
    }
    for (const value of [
      FINGERPRINT.toLowerCase(),
      FINGERPRINT.slice(3),
      `${FINGERPRINT}, ${FINGERPRINT}`,
      `${FINGERPRINT},`,
    ]) {
      assertRefused('ANDROID_SHA256_CERT_FINGERPRINTS', value, APP_IDENTITY);
    }
  });

  test('refuses to start without a nameserver to look the API up with', () => {
    assertRefused('NGINX_LOCAL_RESOLVERS', '');
  });
});

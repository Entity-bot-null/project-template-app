// Tests of apps/landing/nginx/19-app-links.sh (`node --test
// scripts/app-links.test.mjs`): the real script, run with sh as the web
// image's entrypoint runs it (after 18-validate-runtime-config.sh checked the
// settings), into a temporary folder. The files it writes are what Apple and
// Google fetch to let the app open the site's links: their shape is theirs,
// and the paths they claim are the app's.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../apps/landing/nginx/19-app-links.sh', import.meta.url));

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
const OTHER_FINGERPRINT = FINGERPRINT.replaceAll('0', 'F');

/** @type {string} */
let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-links-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** @param {Record<string, string>} settings */
function run(settings) {
  const result = spawnSync(SH, [SCRIPT], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      APP_LINKS_DIR: dir,
      APPLE_TEAM_ID: '',
      IOS_BUNDLE_ID: '',
      ANDROID_PACKAGE: '',
      ANDROID_SHA256_CERT_FINGERPRINTS: '',
      ...settings,
    },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result.stderr;
}

/** @param {string} name */
const json = (name) => /** @type {unknown} */ (JSON.parse(readFileSync(join(dir, name), 'utf8')));

describe('19-app-links.sh', () => {
  test("writes Apple's file for the app, claiming the app's links", () => {
    run({ APPLE_TEAM_ID: 'ABCDE12345', IOS_BUNDLE_ID: 'com.example.templateapp' });
    assert.deepEqual(json('apple-app-site-association'), {
      applinks: {
        details: [
          {
            appIDs: ['ABCDE12345.com.example.templateapp'],
            components: [{ '/': '/app/*', comment: 'The links of the app' }],
          },
        ],
      },
    });
  });

  test("writes Google's file for the app, with every signing certificate", () => {
    run({
      ANDROID_PACKAGE: 'com.example.templateapp',
      ANDROID_SHA256_CERT_FINGERPRINTS: `${FINGERPRINT},${OTHER_FINGERPRINT}`,
    });
    assert.deepEqual(json('assetlinks.json'), [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.example.templateapp',
          sha256_cert_fingerprints: [FINGERPRINT, OTHER_FINGERPRINT],
        },
      },
    ]);
  });

  test('writes no file for an unset platform, says so, and removes a stale one', () => {
    writeFileSync(join(dir, 'assetlinks.json'), '[]');
    const stderr = run({ APPLE_TEAM_ID: 'ABCDE12345', IOS_BUNDLE_ID: 'com.example.templateapp' });
    assert.ok(existsSync(join(dir, 'apple-app-site-association')));
    assert.ok(!existsSync(join(dir, 'assetlinks.json')));
    assert.match(stderr, /ANDROID_PACKAGE and ANDROID_SHA256_CERT_FINGERPRINTS are not set/);

    const none = run({});
    assert.ok(!existsSync(join(dir, 'apple-app-site-association')));
    assert.match(none, /APPLE_TEAM_ID and IOS_BUNDLE_ID are not set/);
  });

  test("claims the app's link prefix, and nginx serves both files", () => {
    const prefix = /export const APP_LINK_PREFIX = '([^']+)';/.exec(
      readFileSync(new URL('../apps/mobile/src/lib/links.ts', import.meta.url), 'utf8'),
    )?.[1];
    assert.match(readFileSync(SCRIPT, 'utf8'), new RegExp(`"/":"${String(prefix)}/\\*"`));
    const nginx = readFileSync(
      new URL('../apps/landing/nginx/default.conf.template', import.meta.url),
      'utf8',
    );
    for (const name of ['apple-app-site-association', 'assetlinks.json']) {
      assert.match(
        nginx,
        new RegExp(
          `location = /\\.well-known/${name.replace('.', '\\.')} \\{[^}]*default_type application/json;[^}]*alias /tmp/app-links/${name.replace('.', '\\.')};`,
        ),
        name,
      );
    }
  });
});

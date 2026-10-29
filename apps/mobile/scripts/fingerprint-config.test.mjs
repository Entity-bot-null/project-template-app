// The app's fingerprint configuration (fingerprint.config.js): of package.json's
// scripts, only the ones that can change a build count towards the runtime
// version. Run by `pnpm test:scripts`.
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { test } from 'node:test';

// @expo/fingerprint's FileHookTransformFunction (the package comes with expo,
// not as a dependency of its own, so its types are out of reach here).
/**
 * @typedef {(
 *   source: { type: 'file'; filePath: string } | { type: 'contents'; id: string },
 *   chunk: Buffer | string | null,
 *   isEndOfFile: boolean,
 *   encoding: BufferEncoding,
 * ) => Buffer | string | null} FileHookTransform
 */

const { fileHookTransform: transform } = /** @type {{ fileHookTransform: FileHookTransform }} */ (
  createRequire(import.meta.url)('../fingerprint.config.js')
);

/** @param {Record<string, string>} scripts */
const hashedScripts = (scripts) =>
  JSON.parse(
    String(
      transform(
        { type: 'contents', id: 'packageJson:scripts' },
        JSON.stringify(scripts),
        true,
        'utf8',
      ),
    ),
  );

test('keeps the install lifecycle, EAS Build hooks and android/ios, drops the rest', () => {
  assert.deepEqual(
    hashedScripts({
      start: 'expo start',
      test: 'jest',
      'test:e2e': 'node scripts/e2e-proxy.mjs -- maestro test .maestro',
      prebuild: 'expo prebuild --clean',
      preinstall: 'node a.mjs',
      install: 'node b.mjs',
      postinstall: 'node c.mjs',
      prepare: 'pnpm types:generate',
      android: 'react-native run-android --mode release',
      ios: 'react-native run-ios',
      'eas-build-pre-install': 'node d.mjs',
      'eas-build-post-install': 'node e.mjs',
    }),
    {
      preinstall: 'node a.mjs',
      install: 'node b.mjs',
      postinstall: 'node c.mjs',
      prepare: 'pnpm types:generate',
      android: 'react-native run-android --mode release',
      ios: 'react-native run-ios',
      'eas-build-pre-install': 'node d.mjs',
      'eas-build-post-install': 'node e.mjs',
    },
  );
  assert.deepEqual(hashedScripts({ lint: 'eslint .', 'test:e2e:stack': 'maestro test' }), {});
});

test('leaves every other source as it is', () => {
  const chunk = Buffer.from('{"scripts":{"test":"jest"}}');
  assert.equal(transform({ type: 'file', filePath: 'package.json' }, chunk, false, 'utf8'), chunk);
  assert.equal(
    transform({ type: 'contents', id: 'expoConfig' }, '{"name":"x"}', true, 'utf8'),
    '{"name":"x"}',
  );
  assert.equal(
    transform({ type: 'contents', id: 'packageJson:scripts' }, null, true, 'utf8'),
    null,
  );
});

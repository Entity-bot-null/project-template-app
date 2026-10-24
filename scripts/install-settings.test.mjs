// Tests of scripts/install-settings.mjs (`pnpm test:scripts`): the strict
// reader of pnpm-workspace.yaml and the install-settings half of
// `pnpm deps:check`. Each case writes the YAML a person could commit and
// expects the check to fail on every weakened setting, with no I/O beyond
// reading this repository's own files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

import {
  checkInstallSettings,
  parseWorkspaceYaml,
  WorkspaceYamlError,
} from './install-settings.mjs';

/** @typedef {import('./install-settings.mjs').InstallPolicy} InstallPolicy */

const TODAY = '2026-10-09';

/** The settings this policy accepts, as the repository writes them. */
const BASE = `
engineStrict: true
minimumReleaseAge: 10080
trustPolicy: no-downgrade
trustPolicyIgnoreAfter: 43200
blockExoticSubdeps: true
allowBuilds:
  '@sentry/cli': false
  unrs-resolver: false
`;

/**
 * @param {Partial<InstallPolicy['exceptions']>} [exceptions]
 * @returns {InstallPolicy}
 */
function policy(exceptions = {}) {
  return {
    minimumReleaseAgeAtLeast: 10080,
    trustPolicyIgnoreAfterAtLeast: 43200,
    required: { trustPolicy: 'no-downgrade', blockExoticSubdeps: true },
    unsetOrEqual: {
      dangerouslyAllowAllBuilds: false,
      strictDepBuilds: true,
      minimumReleaseAgeStrict: true,
    },
    exceptions: {
      allowBuilds: {},
      trustPolicyExclude: {},
      minimumReleaseAgeExclude: {},
      ...exceptions,
    },
  };
}

/**
 * The problems found in a pnpm-workspace.yaml.
 * @param {string} yaml
 * @param {InstallPolicy} [rules]
 * @param {string} [today]
 */
function problems(yaml, rules = policy(), today = TODAY) {
  return checkInstallSettings(parseWorkspaceYaml(yaml), rules, today).problems;
}

/**
 * Asserts one problem per expected pattern, and nothing else.
 * @param {string[]} found
 * @param {RegExp[]} expected
 */
function assertProblems(found, expected) {
  assert.equal(found.length, expected.length, `problems: ${JSON.stringify(found, null, 2)}`);
  for (const pattern of expected) {
    assert.ok(
      found.some((problem) => pattern.test(problem)),
      `no problem matches ${pattern}: ${JSON.stringify(found, null, 2)}`,
    );
  }
}

/**
 * BASE with the line that sets `key` replaced by `yaml` ('' removes it).
 * @param {string} key
 * @param {string} yaml
 */
const replace = (key, yaml) =>
  BASE.split('\n')
    .map((line) => (line.startsWith(`${key}:`) ? yaml : line))
    .join('\n');

describe('reading pnpm-workspace.yaml', () => {
  test("reads the repository's own file", () => {
    const settings = parseWorkspaceYaml(
      readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8'),
    );
    assert.equal(settings.minimumReleaseAge, 10080);
    assert.equal(settings.blockExoticSubdeps, true);
    assert.equal(settings.trustPolicy, 'no-downgrade');
    assert.deepEqual(
      { .../** @type {object} */ (settings.allowBuilds) },
      {
        '@parcel/watcher': false,
        '@prisma/engines': true,
        '@scarf/scarf': false,
        '@sentry/cli': false,
        argon2: true,
        prisma: true,
        'unrs-resolver': false,
      },
    );
  });

  test('reads a file an editor saved with a byte order mark', () => {
    const bom = String.fromCharCode(0xfeff);
    assert.equal(parseWorkspaceYaml(`${bom}minimumReleaseAge: 10080\n`).minimumReleaseAge, 10080);
  });

  test('types plain scalars as YAML 1.2 does, and keeps quoted ones as text', () => {
    const settings = parseWorkspaceYaml(
      [
        'a: true',
        'b: False',
        'c: 0x10',
        'd: ~',
        "e: 'true'",
        'f: "10080"',
        'g: ^1.2.2',
        'h: yes',
        "i: 'it''s # not a comment' # a comment",
        "j: don't",
        'k:',
      ].join('\n'),
    );
    assert.deepEqual(
      { ...settings },
      {
        a: true,
        b: false,
        c: 16,
        d: null,
        e: 'true',
        f: '10080',
        g: '^1.2.2',
        h: 'yes',
        i: "it's # not a comment",
        j: "don't",
        k: null,
      },
    );
  });

  test('reads block lists, lists at the key indentation, and one-line flow collections', () => {
    const settings = parseWorkspaceYaml(
      [
        'one:',
        '  - a@1.0.0',
        'two:',
        '- b@2.0.0 # same indentation as the key',
        'three: [\'*\', c, "d",]',
        "four: {'@sentry/cli': true, esbuild: false}",
        'five: []',
        'six: {}',
        'nested:',
        '  ignore:',
        '    # a comment between entries',
        '    - GHSA-1',
      ].join('\r\n'),
    );
    assert.deepEqual(JSON.parse(JSON.stringify(settings)), {
      one: ['a@1.0.0'],
      two: ['b@2.0.0'],
      three: ['*', 'c', 'd'],
      four: { '@sentry/cli': true, esbuild: false },
      five: [],
      six: {},
      nested: { ignore: ['GHSA-1'] },
    });
  });

  // Everything pnpm could read differently from a simple reader fails
  // instead: these are the ways to hide a weakened setting.
  for (const [name, yaml, message] of [
    [
      'a key set twice',
      'allowBuilds:\n  a: false\nallowBuilds:\n  a: true',
      /"allowBuilds" is set twice/,
    ],
    ['a nested key set twice', 'allowBuilds:\n  a: false\n  a: true', /"a" is set twice/],
    ['a quoted key set twice', "allowBuilds:\n  a: false\n  'a': true", /"a" is set twice/],
    ['an anchor', 'x: &weak true\nallowBuilds:\n  a: false', /anchor, alias, tag/],
    ['an alias', 'allowBuilds:\n  a: *weak', /anchor, alias, tag/],
    ['a merge key', 'allowBuilds:\n  <<: *weak', /anchor, alias, tag|must be quoted/],
    ['a tag', 'allowBuilds:\n  a: !!bool true', /anchor, alias, tag/],
    ['a block scalar', 'trustPolicy: |\n  no-downgrade', /anchor, alias, tag, block scalar/],
    ['a value over several lines', 'trustPolicy: no-\n  downgrade', /unexpected indentation/],
    ['a flow list over several lines', "trustPolicyExclude: ['a',\n  'b']", /must close/],
    ['a nested flow collection', "trustPolicyExclude: [['*']]", /nested flow/],
    ['a quoted value over several lines', "trustPolicy: 'no-\n  downgrade'", /end on its own line/],
    ['escapes in double quotes', 'allowBuilds:\n  "\\x40sentry/cli": true', /escape sequences/],
    ['a tab in the indentation', 'allowBuilds:\n\ta: true', /tabs/],
    ['two documents', 'trustPolicy: no-downgrade\n---\ntrustPolicy: off', /one YAML document/],
    ['a list of mappings', 'trustPolicyExclude:\n  - name: a', /mapping inside a list/],
    ['an unquoted @ name', 'trustPolicyExclude:\n  - @babel/core@7.0.0', /starting with "@"/],
    ['an unquoted @ key', 'allowBuilds:\n  @sentry/cli: true', /must be quoted/],
    ['a complex key', 'allowBuilds:\n  ? a\n  : true', /expected "key: value"/],
    ['a line without a key', 'allowBuilds\n', /expected "key: value"/],
  ]) {
    test(`refuses ${name}`, () => {
      assert.throws(
        () => parseWorkspaceYaml(`${yaml}\n`),
        (error) => {
          assert.ok(error instanceof WorkspaceYamlError);
          assert.match(error.message, /^line \d+: /);
          assert.match(error.message, /** @type {RegExp} */ (message));
          return true;
        },
      );
    });
  }
});

describe('the install settings policy', () => {
  test('accepts the settings the repository keeps', () => {
    assertProblems(problems(BASE), []);
  });

  test('R6: fails when allowBuilds, the trust window and trustPolicyExclude are weakened', () => {
    const weakened = BASE.replace("'@sentry/cli': false", "'@sentry/cli': true").replace(
      'trustPolicyIgnoreAfter: 43200',
      "trustPolicyIgnoreAfter: 1\ntrustPolicyExclude: ['*']",
    );
    assertProblems(problems(weakened), [
      /allowBuilds sets "@sentry\/cli" to true, so its install scripts run/,
      /trustPolicyIgnoreAfter is 1: .* at least 43200/,
      /trustPolicyExclude skips the trust policy for "\*"/,
    ]);
  });

  describe('allowBuilds', () => {
    test('fails on any entry that is not false: true, a placeholder, a string', () => {
      const yaml = BASE.replace(
        'unrs-resolver: false',
        "unrs-resolver: true\n  esbuild:\n  core-js: 'false'\n  nx@21.6.4 || 21.6.5: True",
      );
      assertProblems(problems(yaml), [
        /"unrs-resolver" to true/,
        /"esbuild" to null/,
        /"core-js" to "false"/,
        /"nx@21.6.4 \|\| 21.6.5" to true/,
      ]);
    });

    test('accepts an entry the policy excepts with its reason, and nothing else', () => {
      const yaml = BASE.replace('unrs-resolver: false', 'unrs-resolver: true');
      const rules = policy({ allowBuilds: { 'unrs-resolver': { reason: 'reviewed' } } });
      assertProblems(problems(yaml, rules), []);
      assertProblems(problems(BASE, rules), [
        /exception for "unrs-resolver" matches no entry .* Remove it/,
      ]);
    });

    test('fails on an exception without a reason, and on a setting that is not a mapping', () => {
      const yaml = BASE.replace('unrs-resolver: false', 'unrs-resolver: true');
      assertProblems(
        problems(yaml, policy({ allowBuilds: { 'unrs-resolver': { reason: ' ' } } })),
        [/allowBuilds exception "unrs-resolver" needs a reason/],
      );
      assertProblems(
        problems(replace('allowBuilds', 'allowBuilds: [esbuild]').replace(/^ {2}.*$/gm, '')),
        [/allowBuilds must map package names to false/],
      );
    });

    test('fails when every build is allowed at once', () => {
      assertProblems(problems(`${BASE}dangerouslyAllowAllBuilds: true\n`), [
        /dangerouslyAllowAllBuilds is true; the policy requires pnpm's default, false/,
      ]);
      assertProblems(problems(`${BASE}dangerouslyAllowAllBuilds: false\n`), []);
    });

    test('fails when unreviewed build scripts stop failing the install', () => {
      assertProblems(problems(`${BASE}strictDepBuilds: false\n`), [/strictDepBuilds is false/]);
    });
  });

  describe('the trust policy', () => {
    test('fails when the trust policy is off or the window is lowered', () => {
      assertProblems(problems(replace('trustPolicy', 'trustPolicy: off')), [
        /trustPolicy is "off", the policy requires "no-downgrade"/,
      ]);
      assertProblems(problems(replace('trustPolicyIgnoreAfter', 'trustPolicyIgnoreAfter: 43199')), [
        /trustPolicyIgnoreAfter is 43199/,
      ]);
      assertProblems(
        problems(replace('trustPolicyIgnoreAfter', "trustPolicyIgnoreAfter: '43200'")),
        [/trustPolicyIgnoreAfter is "43200"/],
      );
    });

    test('accepts a longer window, or none (every version compared)', () => {
      assertProblems(
        problems(replace('trustPolicyIgnoreAfter', 'trustPolicyIgnoreAfter: 525600')),
        [],
      );
      assertProblems(problems(replace('trustPolicyIgnoreAfter', '')), []);
    });

    test('accepts only the trustPolicyExclude entries the policy lists', () => {
      const yaml = `${BASE}trustPolicyExclude:\n  - chokidar@4.0.3\n  - '@babel/core@7.28.5'\n`;
      assertProblems(problems(yaml), [
        /trust policy for "chokidar@4.0.3", which .* does not list/,
        /trust policy for "@babel\/core@7.28.5", which .* does not list/,
      ]);
      const rules = policy({
        trustPolicyExclude: {
          'chokidar@4.0.3': { reason: 'reviewed' },
          '@babel/core@7.28.5': { reason: 'reviewed' },
        },
      });
      assertProblems(problems(yaml, rules), []);
      assertProblems(problems(BASE, rules), [
        /trustPolicyExclude exception for "chokidar@4.0.3" is not in pnpm-workspace.yaml/,
        /trustPolicyExclude exception for "@babel\/core@7.28.5" is not in pnpm-workspace.yaml/,
      ]);
      assertProblems(problems(`${BASE}trustPolicyExclude: chokidar\n`), [
        /trustPolicyExclude must be a list/,
      ]);
    });
  });

  describe('the release delay', () => {
    test('fails when the delay is lowered, missing, or allowed to fall back', () => {
      assertProblems(problems(replace('minimumReleaseAge', 'minimumReleaseAge: 1440')), [
        /minimumReleaseAge is 1440, the policy requires at least 10080/,
      ]);
      assertProblems(problems(replace('minimumReleaseAge', '')), [/minimumReleaseAge is not set/]);
      assertProblems(problems(`${BASE}minimumReleaseAgeStrict: false\n`), [
        /minimumReleaseAgeStrict is false/,
      ]);
    });

    test('fails on a pattern, a bare name or a range, whatever the policy says', () => {
      const yaml = `${BASE}minimumReleaseAgeExclude: ['*', '@myorg/*', react-native, source-map-js@^1.2.2]\n`;
      assertProblems(problems(yaml), [
        /"\*" is a pattern/,
        /"@myorg\/\*" is a pattern/,
        /"react-native" does not name exact versions/,
        /"source-map-js@\^1.2.2" does not name exact versions/,
      ]);
    });

    test('fails on an exact version the policy does not record', () => {
      assertProblems(problems(`${BASE}minimumReleaseAgeExclude:\n  - source-map-js@1.2.2\n`), [
        /"source-map-js@1.2.2" is not recorded .* at most 2026-10-17/,
      ]);
    });

    test('accepts a recorded exemption until the day it expires, then fails', () => {
      const yaml = `${BASE}minimumReleaseAgeExclude:\n  - source-map-js@1.2.2\n  - nx@21.6.4 || 21.6.5\n`;
      const rules = policy({
        minimumReleaseAgeExclude: {
          'source-map-js@1.2.2': { reason: 'GHSA-68fv-2mgg-jv7q', expires: '2026-10-10' },
          'nx@21.6.4 || 21.6.5': { reason: 'reviewed', expires: '2026-10-12' },
        },
      });
      const accepted = checkInstallSettings(parseWorkspaceYaml(yaml), rules, '2026-10-09');
      assertProblems(accepted.problems, []);
      assert.ok(
        accepted.advisories.some((line) => /source-map-js@1.2.2 .* until 2026-10-10/.test(line)),
      );
      assertProblems(problems(yaml, rules, '2026-10-10'), [
        /"source-map-js@1.2.2" expired on 2026-10-10.* Delete it here and in/,
      ]);
    });

    test('fails on an expiry later than the delay needs, or not a date, or no reason', () => {
      const yaml = `${BASE}minimumReleaseAgeExclude:\n  - a@1.0.0\n  - b@1.0.0\n  - c@1.0.0\n  - d@1.0.0\n`;
      const rules = policy({
        minimumReleaseAgeExclude: {
          'a@1.0.0': { reason: 'reviewed', expires: '2026-10-18' },
          'b@1.0.0': { reason: 'reviewed', expires: '2026-02-30' },
          'c@1.0.0': { reason: 'reviewed' },
          'd@1.0.0': { reason: '', expires: '2026-10-17' },
        },
      });
      assertProblems(problems(yaml, rules), [
        /"a@1.0.0" expires on 2026-10-18, later than the release delay needs \(at most 2026-10-17\)/,
        /"b@1.0.0" needs "expires", a date/,
        /"c@1.0.0" needs "expires", a date/,
        /minimumReleaseAgeExclude exception "d@1.0.0" needs a reason/,
      ]);
    });

    test('fails on a recorded exemption that is no longer in the file', () => {
      const rules = policy({
        minimumReleaseAgeExclude: { 'a@1.0.0': { reason: 'reviewed', expires: '2026-10-10' } },
      });
      assertProblems(problems(BASE, rules), [/exemption "a@1.0.0" is not in pnpm-workspace.yaml/]);
    });
  });

  test('fails when blockExoticSubdeps is off or not a boolean', () => {
    assertProblems(problems(replace('blockExoticSubdeps', 'blockExoticSubdeps: false')), [
      /blockExoticSubdeps is false, the policy requires true/,
    ]);
    assertProblems(problems(replace('blockExoticSubdeps', "blockExoticSubdeps: 'true'")), [
      /blockExoticSubdeps is "true", the policy requires true/,
    ]);
  });

  test("the repository's file passes its own policy today", () => {
    const settings = parseWorkspaceYaml(
      readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8'),
    );
    const { installSettings } = JSON.parse(
      readFileSync(new URL('dependency-policy.json', import.meta.url), 'utf8'),
    );
    const today = new Date().toISOString().slice(0, 10);
    assertProblems(checkInstallSettings(settings, installSettings, today).problems, []);
  });
});

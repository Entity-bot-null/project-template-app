// Tests of the release sets of the dependency policy (scripts/release-sets.mjs).
// Run: pnpm test:scripts
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { checkReleaseSets } from './release-sets.mjs';

const sets = {
  prisma: {
    packages: ['prisma', '@prisma/client', '@prisma/adapter-pg'],
    reason: 'The CLI generates the code the client runs.',
  },
};

/** @param {string} version as the lockfile resolves it, peer suffix included */
const locked = (version) => ({ specifier: version.replace(/\(.*$/, ''), version });

/**
 * The two documents of a pnpm lockfile: pnpm's own installation, then the workspace's.
 * @param {Record<string, import('./release-sets.mjs').Importer>} workspace
 */
const lockfile = (workspace) => [{ '.': {} }, workspace];

describe('checkReleaseSets', () => {
  test('a set on one version passes, peer suffixes aside', () => {
    const importers = lockfile({
      'apps/api': {
        dependencies: {
          '@prisma/adapter-pg': locked('7.10.0'),
          '@prisma/client': locked('7.10.0(prisma@7.10.0(typescript@6.0.3))(typescript@6.0.3)'),
          prisma: locked('7.10.0(typescript@6.0.3)'),
        },
      },
    });
    assert.deepEqual(checkReleaseSets(importers, sets), []);
  });

  test('a member moved alone fails, naming each version and where it is', () => {
    const importers = lockfile({
      'apps/api': {
        dependencies: {
          '@prisma/adapter-pg': locked('7.10.1'),
          '@prisma/client': locked('7.10.1(prisma@7.10.0)'),
          prisma: locked('7.10.0'),
        },
      },
    });
    const [problem, ...rest] = checkReleaseSets(importers, sets);
    assert.deepEqual(rest, []);
    assert.match(problem ?? '', /^Release set "prisma": .* must resolve to one version/);
    assert.match(problem ?? '', /7\.10\.0 \(prisma in apps\/api\)/);
    assert.match(
      problem ?? '',
      /7\.10\.1 \(@prisma\/client in apps\/api, @prisma\/adapter-pg in apps\/api\)/,
    );
    assert.match(problem ?? '', /The CLI generates the code the client runs\.$/);
  });

  test('every workspace package and dependency type counts', () => {
    const importers = lockfile({
      'apps/api': { dependencies: { '@prisma/client': locked('7.10.0') } },
      'apps/worker': { devDependencies: { prisma: locked('7.9.1') } },
    });
    assert.match(checkReleaseSets(importers, sets)[0] ?? '', /7\.9\.1 \(prisma in apps\/worker\)/);
  });

  test('a member the workspace does not use is fine', () => {
    const importers = lockfile({
      'apps/api': {
        dependencies: { '@prisma/client': locked('7.10.0') },
        devDependencies: { prisma: locked('7.10.0') },
      },
    });
    assert.deepEqual(checkReleaseSets(importers, sets), []);
  });

  test('a set that matches no direct dependency fails', () => {
    const importers = lockfile({ 'apps/api': { dependencies: { zod: locked('4.6.7') } } });
    assert.deepEqual(checkReleaseSets(importers, sets), [
      'scripts/dependency-policy.json: the release set "prisma" applies to no direct dependency in pnpm-lock.yaml. Remove it.',
    ]);
  });

  test('a set needs two packages or more and its reason', () => {
    const importers = lockfile({ 'apps/api': { dependencies: { prisma: locked('7.10.0') } } });
    const invalid = {
      alone: { packages: ['prisma'], reason: 'One package.' },
      unexplained: { packages: ['prisma', '@prisma/client'], reason: ' ' },
    };
    assert.deepEqual(checkReleaseSets(importers, invalid), [
      'scripts/dependency-policy.json: the release set "alone" needs two packages or more and its reason.',
      'scripts/dependency-policy.json: the release set "unexplained" needs two packages or more and its reason.',
    ]);
  });
});

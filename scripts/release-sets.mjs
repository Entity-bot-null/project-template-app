// Release sets of the dependency policy (scripts/check-dependencies.mjs):
// packages published together as one release, which work only at the same
// version. Prisma's CLI generates the client code that @prisma/client runs:
// a grouped update that moves one of them and leaves the other behind (as
// when the install policy refuses the other's new version) still builds and
// can pass every test, with the generated code and its runtime from two
// releases.

/**
 * @typedef {{ packages: string[]; reason: string }} ReleaseSet
 * @typedef {{ specifier: string; version: string }} LockedDependency
 * @typedef {{
 *   dependencies?: Record<string, LockedDependency>;
 *   devDependencies?: Record<string, LockedDependency>;
 *   optionalDependencies?: Record<string, LockedDependency>;
 * }} Importer
 */

/** @type {readonly ('dependencies' | 'devDependencies' | 'optionalDependencies')[]} */
const DEPENDENCY_TYPES = ['dependencies', 'devDependencies', 'optionalDependencies'];

/**
 * The problems of the release sets against the lockfile: the members of a
 * set that the workspace uses directly must resolve to one version, in every
 * workspace package; a member left out is fine (not every project needs all
 * of them). A set that matches no direct dependency fails too: it would apply
 * unseen to packages added later. A resolved version is compared without its
 * peer suffix ("7.10.0(prisma@7.10.0)" is 7.10.0).
 * @param {Record<string, Importer>[]} importers the `importers` of each
 *   document of pnpm-lock.yaml (pnpm's own installation is one, the
 *   workspace's dependencies another)
 * @param {Record<string, ReleaseSet>} sets
 * @returns {string[]}
 */
export function checkReleaseSets(importers, sets) {
  /** @type {string[]} */
  const problems = [];
  for (const [name, set] of Object.entries(sets)) {
    if (
      !Array.isArray(set.packages) ||
      set.packages.length < 2 ||
      typeof set.reason !== 'string' ||
      set.reason.trim() === ''
    ) {
      problems.push(
        `scripts/dependency-policy.json: the release set "${name}" needs two packages or more and its reason.`,
      );
      continue;
    }
    /** @type {Map<string, string[]>} each resolved version, and where */
    const versions = new Map();
    for (const document of importers) {
      for (const [importer, dependencies] of Object.entries(document)) {
        for (const type of DEPENDENCY_TYPES) {
          for (const pkg of set.packages) {
            const locked = dependencies[type]?.[pkg];
            if (locked === undefined) continue;
            const version = locked.version.replace(/\(.*$/, '');
            versions.set(version, [...(versions.get(version) ?? []), `${pkg} in ${importer}`]);
          }
        }
      }
    }
    if (versions.size === 0) {
      problems.push(
        `scripts/dependency-policy.json: the release set "${name}" applies to no direct dependency in pnpm-lock.yaml. Remove it.`,
      );
    } else if (versions.size > 1) {
      const found = [...versions]
        .map(([version, where]) => `${version} (${where.join(', ')})`)
        .join(', ');
      problems.push(
        `Release set "${name}": ${set.packages.join(', ')} must resolve to one version, found ${found}. Update them together, in one pull request. ${set.reason}`,
      );
    }
  }
  return problems;
}

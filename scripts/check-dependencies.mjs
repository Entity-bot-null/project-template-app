// `pnpm deps:check` (part of `pnpm security`, so of `pnpm verify` and CI):
// the dependency policy in scripts/dependency-policy.json
// (SECURITY.md#dependency-policy).
//
// 1. Sources: every package in pnpm-lock.yaml resolves from the registry with
//    a sha512 integrity hash. A git repository, a tarball URL or a local
//    directory bypasses the registry, its integrity checks and the release
//    delay; pnpm already refuses them for transitive dependencies
//    (blockExoticSubdeps), this covers the direct ones.
// 2. Licenses: production dependencies (what the app ships) use an allowed
//    license; development tools may also use the development-only ones.
//    Unknown licenses fail, and so does an exception for a package that left
//    the lockfile: it would approve that license unseen if it came back.
// 3. Install settings: pnpm-workspace.yaml keeps the release delay, the trust
//    policy, the block on transitive sources outside the registry and on
//    install scripts; every entry that weakens one (a build allowed, a
//    package the trust policy skips, a version exempt from the delay) is a
//    reviewed exception with its reason, and a delay exemption also expires
//    (scripts/install-settings.mjs).
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  checkInstallSettings,
  parseWorkspaceYaml,
  WorkspaceYamlError,
} from './install-settings.mjs';
import { isAllowed } from './licenses.mjs';

const policy = JSON.parse(readFileSync(new URL('dependency-policy.json', import.meta.url), 'utf8'));
/** @type {string[]} */
const problems = [];

// --- Sources ---------------------------------------------------------------

const lockfile = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
/** @type {string | undefined} */
let current;
/** @type {string | undefined} */
let dependency;
let checked = 0;
/** Every package name in the lockfile, optional platform builds included. */
const locked = new Set();
for (const line of lockfile.split('\n')) {
  // Package keys sit at two spaces of indentation: "  name@version:".
  const key = /^ {2}'?([^\s'][^']*?)'?:\s*$/.exec(line);
  if (key?.[1] !== undefined) {
    current = key[1];
    locked.add(current.replace(/@[^@]+$/, ''));
  }
  // A local directory linked as a direct dependency ("link:../dir") has no
  // package entry, only its importer's "name:" key and "version: link:...".
  const importerKey = /^ {6}'?([^\s'][^']*?)'?:\s*$/.exec(line);
  if (importerKey) dependency = importerKey[1];
  if (/^ {8}version: link:/.test(line)) {
    checked += 1;
    const name = dependency ?? '(unknown)';
    if (!Object.hasOwn(policy.sources.exceptions, name)) {
      problems.push(
        `${name}: linked from a local directory (${line.trim()}), not resolved from the registry. Use a registry release, or add a reviewed exception to scripts/dependency-policy.json.`,
      );
    }
    continue;
  }
  if (!line.trimStart().startsWith('resolution:')) continue;
  checked += 1;
  if (/\{integrity: sha512-[A-Za-z0-9+/=]+\}/.test(line)) continue;
  const name = current?.replace(/@[^@]+$/, '') ?? '(unknown)';
  if (Object.hasOwn(policy.sources.exceptions, name)) continue;
  problems.push(
    `${current}: not resolved from the registry with a sha512 hash (${line.trim()}). Use a registry release, or add a reviewed exception to scripts/dependency-policy.json.`,
  );
}

// --- Licenses --------------------------------------------------------------

/**
 * @param {string[]} flags
 * @returns {Record<string, { name: string; versions: string[] }[]>}
 */
function licenses(...flags) {
  // Through the shell: pnpm is a .cmd shim on Windows. The command is constant.
  const output = execSync(`pnpm licenses list --json ${flags.join(' ')}`, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(output);
}

/**
 * @param {Record<string, { name: string; versions: string[] }[]>} byLicense
 * @param {Set<string>} allowed
 * @param {string} scope
 * @param {Set<string>} [skip] package versions (name@version) already judged
 * @returns {Set<string>} the package versions checked
 */
function checkLicenses(byLicense, allowed, scope, skip = new Set()) {
  /** @type {Set<string>} */
  const seen = new Set();
  for (const [expression, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      // By version: a development-only version may carry another license
      // than the production one of the same package.
      const versions = pkg.versions.map((version) => `${pkg.name}@${version}`);
      for (const version of versions) seen.add(version);
      if (versions.every((version) => skip.has(version)) || isAllowed(expression, allowed)) {
        continue;
      }
      const exception = policy.licenses.exceptions[pkg.name];
      if (exception?.license === expression) continue;
      problems.push(
        `${pkg.name}@${pkg.versions.join(', ')} (${scope}): license "${expression}" is not allowed by scripts/dependency-policy.json.`,
      );
    }
  }
  return seen;
}

const production = new Set(policy.licenses.allowed);
const development = new Set([...production, ...policy.licenses.allowedInDevelopment]);
// Production packages were judged by the stricter list already.
const prodPackages = checkLicenses(licenses('--prod'), production, 'production');
const allPackages = checkLicenses(licenses(), development, 'development', prodPackages);

for (const name of Object.keys(policy.licenses.exceptions)) {
  if (!locked.has(name)) {
    problems.push(
      `scripts/dependency-policy.json: the license exception for "${name}" applies to no package in pnpm-lock.yaml. Remove it.`,
    );
  }
}

// --- Install settings --------------------------------------------------------

// The settings in pnpm-workspace.yaml that keep the supply chain policy: an
// edit that weakens one fails here, in review's sight, not silently.
try {
  const workspace = parseWorkspaceYaml(
    readFileSync(new URL('../pnpm-workspace.yaml', import.meta.url), 'utf8'),
  );
  const today = new Date().toISOString().slice(0, 10);
  const settings = checkInstallSettings(workspace, policy.installSettings, today);
  problems.push(...settings.problems);
  for (const advisory of settings.advisories) console.warn(advisory);
} catch (error) {
  if (!(error instanceof WorkspaceYamlError)) throw error;
  problems.push(
    `pnpm-workspace.yaml, ${error.message}. Write the settings in the plain style the file uses (scripts/install-settings.mjs).`,
  );
}

// --- Report ----------------------------------------------------------------

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(
    'Dependency policy: replace the dependency or restore the setting, or record a reviewed exception with its reason in scripts/dependency-policy.json (SECURITY.md#dependency-policy).',
  );
  process.exit(1);
}
console.log(
  `Dependency policy OK: ${checked} lockfile sources, licenses of ${prodPackages.size} production and ${allPackages.size} total package versions.`,
);

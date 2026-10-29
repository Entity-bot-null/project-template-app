// `pnpm expo:doctor` (part of `pnpm verify` and CI): expo-doctor, every
// check, with one setting: the SDK compatibility of the dependencies is
// checked against the manifest of the installed `expo` package
// (bundledNativeModules.json, so the lockfile), not against Expo's live list
// of the newest patches. Online, every Expo patch release would fail this
// gate on every branch for the seven days the supply-chain policy keeps that
// release out (pnpm-workspace.yaml, minimumReleaseAge): a result that depends
// on the date instead of the code. New patches arrive through Dependabot's
// expo-sdk group after that delay. The other checks (React Native Directory
// included) still go online.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The package's own entry point, run with this Node.js: no shell involved,
// so the arguments reach expo-doctor as they are, on every platform.
const require = createRequire(import.meta.url);
const manifest = require.resolve('expo-doctor/package.json');
const { bin } = /** @type {{ bin: string | Record<string, string> }} */ (
  require('expo-doctor/package.json')
);
// `bin` is one path, or a map of command names to paths (expo-doctor 1.21).
const entry = typeof bin === 'string' ? bin : bin['expo-doctor'];
if (entry === undefined) {
  console.error('Could not run expo-doctor: its package.json declares no expo-doctor command.');
  process.exit(1);
}

// The app's directory, whatever the caller's: expo-doctor checks the project
// it runs in, and in this workspace that is apps/mobile.
const run = spawnSync(
  process.execPath,
  [join(dirname(manifest), entry), ...process.argv.slice(2)],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, EXPO_OFFLINE: '1' },
  },
);
if (run.error) {
  console.error(`Could not run expo-doctor: ${run.error.message}`);
}
process.exit(run.status ?? 1);

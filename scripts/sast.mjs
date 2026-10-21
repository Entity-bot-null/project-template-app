// `pnpm sast` and the CI job "Static analysis (Semgrep)": static application
// security testing of the app code, its config and the repository scripts
// (SECURITY.md#static-analysis). Needs Docker. Any finding fails.
//
// The rulesets are Semgrep's curated, high-confidence ones. A false positive
// is suppressed where it occurs, with the reason, so review sees it:
//   // nosemgrep: <rule-id> -- why this is safe
//
// What is scanned: the files git tracks plus the new ones it would pick up
// (not ignored), copied to a temporary directory first, minus .semgrepignore.
// Mounting the working tree instead makes Semgrep crawl node_modules and the
// native build output through Docker's file sharing: minutes on Linux, an
// hour on Windows and macOS.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runTool } from './tool-image.mjs';

const RULESETS = [
  'p/default',
  'p/owasp-top-ten',
  'p/typescript',
  'p/react',
  'p/secrets',
  // The scripts (the repository's checks, the app's mock API and tools) run
  // on Node.js.
  'p/nodejs',
];

const files = execFileSync(
  'git',
  ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  {
    encoding: 'utf8',
  },
)
  .split('\0')
  .filter((file) => file.length > 0 && existsSync(file));

const copy = mkdtempSync(join(tmpdir(), 'sast-'));
let status = 1;
try {
  for (const file of files) {
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    copyFileSync(file, join(copy, file));
  }
  console.log(`Semgrep: ${files.length} files.`);
  // The Semgrep image refuses to run unless the code is mounted at /src.
  status = runTool(
    'semgrep',
    [
      'semgrep',
      'scan',
      '--metrics=off',
      '--disable-version-check',
      '--error',
      ...RULESETS.flatMap((ruleset) => ['--config', ruleset]),
    ],
    { mount: '/src', source: copy },
  );
} finally {
  rmSync(copy, { recursive: true, force: true });
}
process.exit(status);

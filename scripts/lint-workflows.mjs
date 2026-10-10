// `pnpm lint:workflows` and the CI step "Lint GitHub workflows": actionlint
// (syntax, expressions, shellcheck on every `run:`) and zizmor (security:
// excessive permissions, template injection, unpinned actions, persisted
// credentials, cache poisoning, Dependabot cooldown), then shellcheck on the
// Git hooks (.husky/, POSIX sh) and any shell script, which workflows do not
// cover. Needs Docker. Any finding fails
// (docs/CI_CD.md#workflow-security).
//
// With GH_TOKEN set (CI), zizmor also runs its online audits: impostor
// commits (a pinned SHA that is not in the action's repository) and actions
// with known vulnerabilities.
import { execFileSync } from 'node:child_process';
import { runTool } from './tool-image.mjs';

const actionlint = runTool('actionlint', ['-color']);
const zizmor = runTool(
  'zizmor',
  [
    ...(process.env.GH_TOKEN ? [] : ['--offline']),
    '--config',
    '.github/zizmor.yml',
    '--min-severity',
    'low',
    '.github',
  ],
  { env: ['GH_TOKEN'] },
);

// Tracked and new files, not ignored ones (node_modules, .husky/_). shellcheck
// comes with the pinned actionlint image.
/** @param {string[]} pathspecs */
const filesMatching = (pathspecs) =>
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', ...pathspecs], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter((file) => file.length > 0);

/** @param {string[]} files @param {string[]} [flags] */
const shellcheck = (files, flags = []) =>
  files.length > 0 ? runTool('actionlint', [...flags, ...files], { entrypoint: 'shellcheck' }) : 0;

// Husky runs the hooks with sh and they carry no shebang: name the shell.
const hooks = shellcheck(filesMatching(['.husky/*']), ['--shell=sh']);
const scripts = shellcheck(filesMatching(['*.sh']));
process.exit(actionlint || zizmor || hooks || scripts);

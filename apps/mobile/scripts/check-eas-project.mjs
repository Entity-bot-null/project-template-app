// Before anything talks to EAS (the EAS build, update and rollback
// workflows): the app config must name its EAS project. The template ships
// without one (README.md#start-a-new-project), and a non-interactive run
// cannot create it. Reads the config of apps/mobile from any directory.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const config = JSON.parse(
  execFileSync('pnpm', ['exec', 'expo', 'config', '--json', '--type', 'public'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    // pnpm is a .cmd shim on Windows.
    shell: process.platform === 'win32',
  }),
);
const projectId = config.extra?.eas?.projectId;
if (typeof projectId !== 'string' || projectId.length === 0) {
  console.error(
    'No EAS project: run `eas init`, then set APP.easProjectId and APP.owner in apps/mobile/app.config.ts (README.md#start-a-new-project).',
  );
  process.exit(1);
}
console.log(`EAS project ${projectId}`);

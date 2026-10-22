// The web image for the browser suite (playwright.config.ts starts it, and
// stops it with the suite): built from apps/landing/Dockerfile, then run on
// the port and with the app identity the suite passes in its environment
// (e2e/support/web-image.ts), and an API upstream that answers nothing (the
// suite checks the pages, the links and their files, not the API). Needs
// Docker. With TOOL_IMAGE_MIRROR set (CI), the base images come from that
// mirror, by the same digests, as in .github/workflows/docker-images.yml.
//
//   WEB_IMAGE_PORT=8091 APPLE_TEAM_ID=… … node scripts/e2e-web-image.mjs
import { spawn, spawnSync } from 'node:child_process';

const IMAGE = 'template-app-web:e2e';
const CONTAINER = 'template-app-web-e2e';
const IDENTITY = [
  'APPLE_TEAM_ID',
  'IOS_BUNDLE_ID',
  'ANDROID_PACKAGE',
  'ANDROID_SHA256_CERT_FINGERPRINTS',
];

const port = process.env.WEB_IMAGE_PORT;
if (port === undefined || !/^\d+$/.test(port)) {
  console.error('WEB_IMAGE_PORT is not set: run this through `pnpm test:e2e`.');
  process.exit(2);
}

const root = new URL('..', import.meta.url);
const dockerfile = 'apps/landing/Dockerfile';
const mirrored = process.env.TOOL_IMAGE_MIRROR
  ? spawnSync(process.execPath, ['scripts/tool-image.mjs', '--build-contexts', dockerfile], {
      cwd: root,
      encoding: 'utf8',
    })
      .stdout.split('\n')
      .filter((line) => line !== '')
      .flatMap((context) => ['--build-context', context])
  : [];
const build = spawnSync('docker', ['build', ...mirrored, '-f', dockerfile, '-t', IMAGE, '.'], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) {
  console.error('The web image did not build (is Docker running?).');
  process.exit(1);
}

// A container left by an interrupted run would hold the port.
spawnSync('docker', ['rm', '--force', CONTAINER], { stdio: 'ignore' });
const container = spawn(
  'docker',
  [
    'run',
    '--rm',
    '--name',
    CONTAINER,
    '--publish',
    `127.0.0.1:${port}:8080`,
    '--env',
    `APP_ORIGIN=http://localhost:${port}`,
    // A port nothing listens on: /api answers 502 in the API's envelope.
    '--env',
    'API_UPSTREAM=http://127.0.0.1:9',
    ...IDENTITY.flatMap((name) => ['--env', `${name}=${process.env[name] ?? ''}`]),
    IMAGE,
  ],
  { stdio: 'inherit' },
);
const stop = () => {
  spawnSync('docker', ['stop', '--time', '2', CONTAINER], { stdio: 'ignore' });
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
container.on('exit', (code) => {
  process.exitCode = code ?? 0;
});

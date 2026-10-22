// Bundle budget (docs/performance.md#bundle-budget): fails when the exported
// JavaScript bundle or the assets of a platform outgrow bundle-budget.json.
// The bundle is Hermes bytecode: its size is what the binary carries, what
// the runtime maps at startup and what an OTA update downloads (compressed in
// transit; the gzip size is printed for reference). Assets are counted once
// per platform, as a fresh install of an update downloads them.
// Run after the app's export (`pnpm build`); it is `pnpm perf:check`, part of
// `pnpm verify` and CI.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url);
const BUDGET_FILE = new URL('../bundle-budget.json', import.meta.url);

/** @typedef {{ maxBundleKb: number; maxAssetsKb: number }} Budget */
/** @typedef {{ bundle: string; assets: { path: string; ext: string }[] }} PlatformMetadata */

if (!existsSync(new URL('metadata.json', DIST))) {
  console.error('No export found in apps/mobile/dist/: run `pnpm build` first.');
  process.exit(1);
}

const { budgets } = /** @type {{ budgets: Record<string, Budget> }} */ (
  JSON.parse(readFileSync(BUDGET_FILE, 'utf8'))
);
const { fileMetadata } = /** @type {{ fileMetadata: Record<string, PlatformMetadata> }} */ (
  JSON.parse(readFileSync(new URL('metadata.json', DIST), 'utf8'))
);

const kb = (/** @type {number} */ bytes) => bytes / 1000;
let failed = false;

for (const [platform, budget] of Object.entries(budgets)) {
  const metadata = fileMetadata[platform];
  if (!metadata) {
    console.error(`MISSING  ${platform}: not in the export (pnpm build exports android and ios).`);
    failed = true;
    continue;
  }
  const bundle = readFileSync(new URL(metadata.bundle, DIST));
  const assets = [...new Set(metadata.assets.map((asset) => asset.path))].reduce(
    (sum, path) => sum + statSync(new URL(path, DIST)).size,
    0,
  );
  /** @type {[what: string, sizeKb: number, maxKb: number, detail: string][]} */
  const checks = [
    [
      'bundle',
      kb(bundle.length),
      budget.maxBundleKb,
      `(${kb(gzipSync(bundle).length).toFixed(0)} kB gzip)`,
    ],
    ['assets', kb(assets), budget.maxAssetsKb, `(${metadata.assets.length} files)`],
  ];
  for (const [what, size, max, detail] of checks) {
    const line = `${platform} ${what}: ${size.toFixed(0)} kB, budget ${max} kB ${detail}`;
    if (size > max) {
      console.error(`OVER BUDGET  ${line}`);
      failed = true;
    } else {
      console.log(`ok  ${line}`);
    }
  }
}

if (failed) {
  console.error(
    'Shrink the bundle (drop or replace heavy dependencies, import only what you use, compress images), or raise the budget in a reviewed pull request that explains why.',
  );
  process.exit(1);
}

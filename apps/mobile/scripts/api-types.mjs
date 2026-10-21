// `pnpm contract`: generates src/api/schema.d.ts from the committed contract
// (openapi/openapi.json). With --check (part of `pnpm typecheck`, so of the
// pre-push hook and CI) it fails when the committed file is out of date.
//
//   node scripts/api-types.mjs [--check]
//
// To generate from a running backend instead, download its document into
// openapi/openapi.json first (openapi/README.md): the contract is reviewed in
// the pull request like code.
import { readFileSync, writeFileSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';

const CONTRACT = new URL('../openapi/openapi.json', import.meta.url);
const TARGET = new URL('../src/api/schema.d.ts', import.meta.url);
const BANNER = '// Generated from openapi/openapi.json by `pnpm contract`. Do not edit.\n\n';

const generated = BANNER + astToString(await openapiTS(CONTRACT));

if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(TARGET, 'utf8');
  } catch {
    // Missing counts as out of date.
  }
  if (committed !== generated) {
    console.error(
      'src/api/schema.d.ts does not match openapi/openapi.json. Run `pnpm contract` and commit both files.',
    );
    process.exit(1);
  }
} else {
  writeFileSync(TARGET, generated);
  console.log('API types written to src/api/schema.d.ts');
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_LINKS_PATH } from './links';

/** A file of the repository, from its root. */
const read = (path: string) =>
  readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8');

// The path of the app's links is agreed in three places: the links the API
// emails (APP_BASE_PATH), the links the app accepts (APP_LINK_PREFIX) and
// this site, which keeps crawlers out of it and whose web image answers it
// with the open-in-app page. One of them changed alone would break every
// emailed link.
describe('APP_LINKS_PATH', () => {
  it('is where the app takes its links from', () => {
    const prefix = /export const APP_LINK_PREFIX = '([^']+)';/.exec(
      read('apps/mobile/src/lib/links.ts'),
    )?.[1];
    expect(`${String(prefix)}/`).toBe(APP_LINKS_PATH);
  });

  it('is where the API points the links of its emails by default', () => {
    const basePath = /APP_BASE_PATH: emptyAsUnset\(urlPath\.default\('([^']+)'\)\)/.exec(
      read('apps/api/src/env/env.schema.ts'),
    )?.[1];
    expect(`${String(basePath)}/`).toBe(APP_LINKS_PATH);
  });
});

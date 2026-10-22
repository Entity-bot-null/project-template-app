// @ts-check
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';
import { DEFAULT_LOCALE, LOCALES } from './src/i18n/locales.ts';

// The public origin of the site: canonical and alternate links, the sitemap,
// robots.txt. An origin only (scheme, host and port), from the environment of
// the build; without it, the address of the dev and preview servers. The web
// image builds with a placeholder its web server replaces with APP_ORIGIN as
// it answers (apps/landing/Dockerfile, apps/landing/nginx): one image, every
// environment.
const site = process.env.PUBLIC_URL ?? 'http://localhost:4331';
if (!URL.canParse(site) || new URL(site).origin !== site) {
  throw new Error(
    `PUBLIC_URL must be an origin such as https://example.com, without a path or a trailing slash: "${site}"`,
  );
}

// In development this server is the site's single entry, as the web image is
// in production: /api reaches the API, with the Host the browser sent. An IP,
// since the API listens on IPv4 loopback. The app's links (/app/*) are the web
// image's (its open-in-app page): the dev server has no route for them.
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3010';

export default defineConfig({
  site,
  // Static files only: the web server hands them out as they are, nothing
  // runs per request.
  output: 'static',
  i18n: {
    locales: [...LOCALES],
    defaultLocale: DEFAULT_LOCALE,
    // The default language at the root (/), the others under their code (/es/).
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: Object.fromEntries(LOCALES.map((locale) => [locale, locale])),
      },
      // The not-found pages are for people who mistype an address, and the
      // open-in-app page for the app's links: neither is for search engines.
      filter: (page) => !/\/(404|open-in-app)\/?$/.test(new URL(page).pathname),
    }),
  ],
  // Vector images only, so no image optimizer to install (sharp, skipped in
  // pnpm-workspace.yaml: ignoredOptionalDependencies).
  image: { service: { entrypoint: 'astro/assets/services/noop' } },
  build: {
    // Every stylesheet as a file, never inlined in a <style> tag, so the web
    // server's Content-Security-Policy can allow styles from this origin only.
    inlineStylesheets: 'never',
  },
  server: { port: 4331 },
  vite: {
    plugins: [tailwindcss()],
    server: {
      // The port the box of `pnpm dev` shows (scripts/dev-banner.mjs): fail
      // rather than move to another one.
      strictPort: true,
      // A regular expression: a string key matches any path with that prefix.
      proxy: {
        '^/api(/|$)': { target: apiTarget, changeOrigin: false },
      },
    },
  },
});

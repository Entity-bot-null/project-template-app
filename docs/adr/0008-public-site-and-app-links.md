# 0008. Serve a static Astro site and the app's link files from one web image

- **Status:** Accepted
- **Date:** 2026-10-22
- **Deciders:** template maintainers

## Context

The app needs a public face beside the stores: what the product is, in the languages of its
audience, findable by search engines, with the way to download it. Two store rules add pages of
their own: a privacy policy at a public URL (both stores), and a web page where users can ask for
their account to be deleted (Google Play's Data safety form, besides deletion inside the app,
[store-compliance.md](../store-compliance.md)).

The API's emails also carry links into the app: `APP_ORIGIN + /app/<screen>#token=…`
([mobile-architecture.md](../mobile-architecture.md#deep-links)). A phone opens such a link in the
app only when the domain proves it belongs to the app: `/.well-known/apple-app-site-association`
for iOS and `/.well-known/assetlinks.json` for Android, served as JSON without a redirect. Where
the app does not open the link (a computer, a phone without the app), the browser shows whatever
the domain answers at that address, and the link's token must not leave the device.

The web template (project-template-web) already answered most of this for a browser app: a static
Astro landing in English and Spanish behind nginx, one image per environment, a strict CSP and the
supply-chain rules (its ADR 0005). This repository has no web app to serve, and two new duties:
the app's link files, and a page for the app's links.

## Options

1. **The store listings only**: no site to keep; but no privacy or deletion URL of the project's
   own, no domain for the app's links, and nothing findable outside the stores.
2. **A hosted site builder, the link files hosted apart**: no code to keep; but outside the
   repository, its gates and reviews, and the link files and the emails' domain kept in step by
   hand.
3. **The web template's landing and web image, adapted**: Astro pages rendered to HTML and CSS at
   build time, nothing running per request, served by nginx with the API at `/api`; the image also
   writes the link files at start, from the app's identity in its environment, and answers
   `/app/*` with a page that explains how to open the link in the app.

## Decision

Option 3. `apps/landing` is the web template's landing, rewritten for a mobile product: the home
page (the app drawn in code inside a phone, capabilities, how it works, the store badges of
`src/lib/stores.ts`, hidden while no listing exists), and the privacy, account deletion,
open-in-app and not-found pages, in English at `/` and Spanish at `/es/`. Its image keeps the web
template's name, `web` (so the deployment, the image workflow and the smoke test stay the same
in both templates), and its guarantees: 0 kB of JavaScript (a CSP with `script-src 'none'`), no
inline style, the system's fonts, a performance budget, and one image for every environment (the
pages are built for a placeholder origin that nginx replaces with `APP_ORIGIN` as it serves them).

The image adds:

- `19-app-links.sh`, which writes the two link files from `APPLE_TEAM_ID` + `IOS_BUNDLE_ID` and
  `ANDROID_PACKAGE` + `ANDROID_SHA256_CERT_FINGERPRINTS` before nginx starts, claiming `/app/*`;
  without a pair, that file answers 404 and the start-up log says so;
- the open-in-app page for every `/app/*` address, at that address, with no redirect: the token
  stays in the fragment, which never reaches a server, and the page is kept out of search results.

## Consequences

- One more app under every gate: lint (accessibility rules for `.astro` files, Tailwind's class
  checks), `astro check`, unit and page tests at 100 % coverage, the performance budget, the browser
  suite (Playwright, against the built landing and against the image itself), the release version.
  `pnpm dev` runs it with the API.
- ESLint stays on 9 for Expo (ADR 0002): the landing uses eslint-plugin-astro 1.x, whose later
  majors need ESLint 10.
- The app's identity reaches the server as configuration (docs/environment.md#web-variables), and
  the domain the app claims (`APP.linkDomain` in `apps/mobile/app.config.ts`) is the domain of the
  API's `APP_ORIGIN`: changing one means changing both.
- The privacy page is a template: its sections follow the data inventory, its legal text is the
  project's to write; the account deletion page explains deletion in the app and by email to an
  address the project sets.
- Wrong if: the site needs per-request content (a server, or a rebuild per change), a client-side
  feature large enough to keep raising the 0 kB budget, or link files that differ per request.

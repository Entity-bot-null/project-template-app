# Changelog

## [1.0.0](https://github.com/Entity-bot-null/project-template-app/compare/v0.2.0...v1.0.0) (2026-10-24)


### Features

* **api:** add the NestJS API ported from project-template-web ([#41](https://github.com/Entity-bot-null/project-template-app/issues/41)) ([c45bf2e](https://github.com/Entity-bot-null/project-template-app/commit/c45bf2e652bfeebf753a9c4adf06389abeebb936))
* **deploy:** deploy the API and the landing to a server ([#49](https://github.com/Entity-bot-null/project-template-app/issues/49)) ([549f704](https://github.com/Entity-bot-null/project-template-app/commit/549f704cd3ebecf11ed6f5a2233a21a4788e71f2))
* **doberman:** audit in rounds that fix what each one finds (--loop) ([#56](https://github.com/Entity-bot-null/project-template-app/issues/56)) ([f6e8fa7](https://github.com/Entity-bot-null/project-template-app/commit/f6e8fa7ee822a1195d669aff30275f3de05f2531))
* **landing:** add the Astro landing and the public web image ([#46](https://github.com/Entity-bot-null/project-template-app/issues/46)) ([97557ea](https://github.com/Entity-bot-null/project-template-app/commit/97557ea1179f2a4987367111db05ac65f057c637))
* **mobile:** use the real API: accounts, email links, admin and minimum version ([#45](https://github.com/Entity-bot-null/project-template-app/issues/45)) ([42f41fe](https://github.com/Entity-bot-null/project-template-app/commit/42f41feb9031835552944ea8304d443e05bf81ed))
* **push:** push notifications through an outbox and Expo's push service ([#55](https://github.com/Entity-bot-null/project-template-app/issues/55)) ([9ad9fbb](https://github.com/Entity-bot-null/project-template-app/commit/9ad9fbbd05b66390bf62c86c289ee0c10e8befa1))


### Bug fixes

* **deps:** install the fixes of the advisories published on 2026-10-23 ([#52](https://github.com/Entity-bot-null/project-template-app/issues/52)) ([b241304](https://github.com/Entity-bot-null/project-template-app/commit/b241304de084a07b31edf78efa2f5e24c1927725))
* **mobile:** sign this phone out at once when a link ends every session ([#53](https://github.com/Entity-bot-null/project-template-app/issues/53)) ([a107264](https://github.com/Entity-bot-null/project-template-app/commit/a107264280723b158ad66c4784a8b01d49e7eb89))
* port the session, email change, outbox and gate fixes of the web template's v2.0.0 audit ([#57](https://github.com/Entity-bot-null/project-template-app/issues/57)) ([29ba717](https://github.com/Entity-bot-null/project-template-app/commit/29ba717a38d25b7f27857a3b969792f2e0828abf))

## [0.2.0](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.3...v0.2.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* the app lives in apps/mobile. build:check is now build + perf:check, test:e2e is test:e2e:mobile, the app's contract script is api:types (pnpm contract stays at the root); the local .env goes to apps/mobile/.env and eas commands run in apps/mobile. The move changes the app's runtime version (fingerprint): the first release from the workspace is a store build.

### Bug fixes

* **auth:** keep one renewal at a time across a sign-out and a new sign-in ([#27](https://github.com/Entity-bot-null/project-template-app/issues/27)) ([9536d02](https://github.com/Entity-bot-null/project-template-app/commit/9536d02f4de1434a39a8fdd7887677f529de32d0))
* **items:** say when a refresh or the next page fails with items on screen ([#28](https://github.com/Entity-bot-null/project-template-app/issues/28)) ([a3d67fe](https://github.com/Entity-bot-null/project-template-app/commit/a3d67fe1803df5c6bafb73434bb460bf927c670b))
* **lint:** give Expo's rules the repository's typescript-eslint plugin ([#39](https://github.com/Entity-bot-null/project-template-app/issues/39)) ([7bb30ef](https://github.com/Entity-bot-null/project-template-app/commit/7bb30ef13d6a9cc505cf1b47ff8c4d9eb926cbc7))
* **ui:** keep the offline banner below the status bar ([#37](https://github.com/Entity-bot-null/project-template-app/issues/37)) ([f2ba20d](https://github.com/Entity-bot-null/project-template-app/commit/f2ba20d558b37cff276635e89437d89c5b13435c))


### Refactoring

* move the Expo app to apps/mobile in a pnpm workspace ([#30](https://github.com/Entity-bot-null/project-template-app/issues/30)) ([f4e2c35](https://github.com/Entity-bot-null/project-template-app/commit/f4e2c353427b1ab23ff49eabc745eaf79b1d0681))

## [0.1.3](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.2...v0.1.3) (2026-10-20)


### Bug fixes

* **security:** keep Doberman's run directories private ([#24](https://github.com/Entity-bot-null/project-template-app/issues/24)) ([d32b239](https://github.com/Entity-bot-null/project-template-app/commit/d32b239215a5c26d27e42b718b0cb8ecfffee405))

## [0.1.2](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.1...v0.1.2) (2026-10-11)


### Bug fixes

* **navigation:** keep the list below an item opened by a link ([ceb9284](https://github.com/Entity-bot-null/project-template-app/commit/ceb928426d7ee3cbe1c26fc71e45ad5e7b31c02d))

## [0.1.1](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.0...v0.1.1) (2026-10-11)


### Bug fixes

* **a11y:** read field errors, announce search results, and measure contrast as rendered ([#3](https://github.com/Entity-bot-null/project-template-app/issues/3)) ([24c3079](https://github.com/Entity-bot-null/project-template-app/commit/24c307993c6c240c448445d9751d03972ad7ae98))
* align app links, EAS update and docs with what the code does ([#3](https://github.com/Entity-bot-null/project-template-app/issues/3)) ([24c3079](https://github.com/Entity-bot-null/project-template-app/commit/24c307993c6c240c448445d9751d03972ad7ae98))
* **ci:** keep Dependabot auto-merge to what the maintainer approved ([820f1bf](https://github.com/Entity-bot-null/project-template-app/commit/820f1bf4eba86b6c90206076c71a09cc75b8447a))
* **ci:** let main guard accept a template's first push and report long pushes ([820f1bf](https://github.com/Entity-bot-null/project-template-app/commit/820f1bf4eba86b6c90206076c71a09cc75b8447a))
* **ci:** let the EAS update workflow read the app config and publish ([820f1bf](https://github.com/Entity-bot-null/project-template-app/commit/820f1bf4eba86b6c90206076c71a09cc75b8447a))
* **ci:** retry a tool image pull that a registry rate-limited ([e802604](https://github.com/Entity-bot-null/project-template-app/commit/e8026043314ecb4f07e89f37848fc3c57938003d))
* **config:** fail the typecheck when env.ts misses a variable of the schema ([8025f39](https://github.com/Entity-bot-null/project-template-app/commit/8025f39c78fe2f3715e05abd754d27c0445f2c0a))
* **config:** refuse feature flag overrides in production builds ([8025f39](https://github.com/Entity-bot-null/project-template-app/commit/8025f39c78fe2f3715e05abd754d27c0445f2c0a))
* **deps:** fail deps:check when supply-chain settings are weakened ([#3](https://github.com/Entity-bot-null/project-template-app/issues/3)) ([24c3079](https://github.com/Entity-bot-null/project-template-app/commit/24c307993c6c240c448445d9751d03972ad7ae98))
* **lint:** refuse JavaScript files in src/ ([8025f39](https://github.com/Entity-bot-null/project-template-app/commit/8025f39c78fe2f3715e05abd754d27c0445f2c0a))
* **mock-api:** print the adb reverse command for the port it listens on ([ea6642d](https://github.com/Entity-bot-null/project-template-app/commit/ea6642db4de1c42ea282810ac07b4974fdaab210))
* **observability:** scrub performance traces before they leave the device ([03fb648](https://github.com/Entity-bot-null/project-template-app/commit/03fb6484195531772d01f7b53c24e1230f0dcac0))
* **security:** read license expressions as SPDX does ([8025f39](https://github.com/Entity-bot-null/project-template-app/commit/8025f39c78fe2f3715e05abd754d27c0445f2c0a))

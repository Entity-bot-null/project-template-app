# Changelog

## [1.0.0](https://github.com/Entity-bot-null/project-template-app/compare/v0.2.0...v1.0.0) (2026-10-24)


### Features

* **api:** add the NestJS API ported from project-template-web ([#41](https://github.com/Entity-bot-null/project-template-app/issues/41)) ([0d0122e](https://github.com/Entity-bot-null/project-template-app/commit/0d0122e5e7b4bcfab688a6346102549c6b50a0bc))
* **deploy:** deploy the API and the landing to a server ([#49](https://github.com/Entity-bot-null/project-template-app/issues/49)) ([4bded6a](https://github.com/Entity-bot-null/project-template-app/commit/4bded6a3d7bfc6e7f4f0cd9ef16602142947442f))
* **doberman:** audit in rounds that fix what each one finds (--loop) ([#56](https://github.com/Entity-bot-null/project-template-app/issues/56)) ([83a7c34](https://github.com/Entity-bot-null/project-template-app/commit/83a7c34ac75dd3b19ad599e26d6cb5c380088544))
* **landing:** add the Astro landing and the public web image ([#46](https://github.com/Entity-bot-null/project-template-app/issues/46)) ([4ff09bb](https://github.com/Entity-bot-null/project-template-app/commit/4ff09bb14df45e14a0f95025a2df334bf1495e11))
* **mobile:** use the real API: accounts, email links, admin and minimum version ([#45](https://github.com/Entity-bot-null/project-template-app/issues/45)) ([bf57b2b](https://github.com/Entity-bot-null/project-template-app/commit/bf57b2b502df725cabc1299feafe8605c77db2f1))
* **push:** push notifications through an outbox and Expo's push service ([#55](https://github.com/Entity-bot-null/project-template-app/issues/55)) ([3eb1570](https://github.com/Entity-bot-null/project-template-app/commit/3eb1570cf1721eceae4c18c19c311d26ae81fc1d))


### Bug fixes

* **deps:** install the fixes of the advisories published on 2026-10-23 ([#52](https://github.com/Entity-bot-null/project-template-app/issues/52)) ([f059106](https://github.com/Entity-bot-null/project-template-app/commit/f05910669413effc6c9f5f1ea55e29380667ebb9))
* **mobile:** sign this phone out at once when a link ends every session ([#53](https://github.com/Entity-bot-null/project-template-app/issues/53)) ([1d32487](https://github.com/Entity-bot-null/project-template-app/commit/1d3248724d2a70ed9babadbdfe1b28e2dcba5fc1))
* port the session, email change, outbox and gate fixes of the web template's v2.0.0 audit ([#57](https://github.com/Entity-bot-null/project-template-app/issues/57)) ([0ac4798](https://github.com/Entity-bot-null/project-template-app/commit/0ac479808e58545f5fecc35616ce5ba0f027ce22))

## [0.2.0](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.3...v0.2.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* the app lives in apps/mobile. build:check is now build + perf:check, test:e2e is test:e2e:mobile, the app's contract script is api:types (pnpm contract stays at the root); the local .env goes to apps/mobile/.env and eas commands run in apps/mobile. The move changes the app's runtime version (fingerprint): the first release from the workspace is a store build.

### Bug fixes

* **auth:** keep one renewal at a time across a sign-out and a new sign-in ([#27](https://github.com/Entity-bot-null/project-template-app/issues/27)) ([1f2c081](https://github.com/Entity-bot-null/project-template-app/commit/1f2c081e5d096c65a80ba2659e87a1ed4ddc85ce))
* **items:** say when a refresh or the next page fails with items on screen ([#28](https://github.com/Entity-bot-null/project-template-app/issues/28)) ([23e93ae](https://github.com/Entity-bot-null/project-template-app/commit/23e93ae2bcbe5d2ee93f74221688e00b66f397e7))
* **lint:** give Expo's rules the repository's typescript-eslint plugin ([#39](https://github.com/Entity-bot-null/project-template-app/issues/39)) ([85f140f](https://github.com/Entity-bot-null/project-template-app/commit/85f140f193be2ca2dfcf8e8f51e41da33bc2f89e))
* **ui:** keep the offline banner below the status bar ([#37](https://github.com/Entity-bot-null/project-template-app/issues/37)) ([8938722](https://github.com/Entity-bot-null/project-template-app/commit/89387229c24dc10f2515b75edafcb11091bf3133))


### Refactoring

* move the Expo app to apps/mobile in a pnpm workspace ([#30](https://github.com/Entity-bot-null/project-template-app/issues/30)) ([25f5c7a](https://github.com/Entity-bot-null/project-template-app/commit/25f5c7a9d988886d2bd2f82fb9eb1b68564c46b2))

## [0.1.3](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.2...v0.1.3) (2026-10-20)


### Bug fixes

* **security:** keep Doberman's run directories private ([#24](https://github.com/Entity-bot-null/project-template-app/issues/24)) ([7be057e](https://github.com/Entity-bot-null/project-template-app/commit/7be057e0f823b84c6378554f42787ed35008a74c))

## [0.1.2](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.1...v0.1.2) (2026-10-11)


### Bug fixes

* **navigation:** keep the list below an item opened by a link ([43b49f7](https://github.com/Entity-bot-null/project-template-app/commit/43b49f774505d90d78aacd1366fcd1167f3d06d7))

## [0.1.1](https://github.com/Entity-bot-null/project-template-app/compare/v0.1.0...v0.1.1) (2026-10-11)


### Bug fixes

* **a11y:** read field errors, announce search results, and measure contrast as rendered ([#3](https://github.com/Entity-bot-null/project-template-app/issues/3)) ([24c3079](https://github.com/Entity-bot-null/project-template-app/commit/24c307993c6c240c448445d9751d03972ad7ae98))
* align app links, EAS update and docs with what the code does ([#3](https://github.com/Entity-bot-null/project-template-app/issues/3)) ([24c3079](https://github.com/Entity-bot-null/project-template-app/commit/24c307993c6c240c448445d9751d03972ad7ae98))
* **ci:** keep Dependabot auto-merge to what the maintainer approved ([47e180b](https://github.com/Entity-bot-null/project-template-app/commit/47e180ba702fce7c75224d3fa79d64b8c787f79d))
* **ci:** let main guard accept a template's first push and report long pushes ([47e180b](https://github.com/Entity-bot-null/project-template-app/commit/47e180ba702fce7c75224d3fa79d64b8c787f79d))
* **ci:** let the EAS update workflow read the app config and publish ([47e180b](https://github.com/Entity-bot-null/project-template-app/commit/47e180ba702fce7c75224d3fa79d64b8c787f79d))
* **ci:** retry a tool image pull that a registry rate-limited ([32c376b](https://github.com/Entity-bot-null/project-template-app/commit/32c376b913334a215d4bdbccb9bdff7867b0680e))
* **config:** fail the typecheck when env.ts misses a variable of the schema ([28fc03e](https://github.com/Entity-bot-null/project-template-app/commit/28fc03eea101f6735ad15c17d5e68abc55ce656e))
* **config:** refuse feature flag overrides in production builds ([28fc03e](https://github.com/Entity-bot-null/project-template-app/commit/28fc03eea101f6735ad15c17d5e68abc55ce656e))
* **deps:** fail deps:check when supply-chain settings are weakened ([#3](https://github.com/Entity-bot-null/project-template-app/issues/3)) ([24c3079](https://github.com/Entity-bot-null/project-template-app/commit/24c307993c6c240c448445d9751d03972ad7ae98))
* **lint:** refuse JavaScript files in src/ ([28fc03e](https://github.com/Entity-bot-null/project-template-app/commit/28fc03eea101f6735ad15c17d5e68abc55ce656e))
* **mock-api:** print the adb reverse command for the port it listens on ([7d519b0](https://github.com/Entity-bot-null/project-template-app/commit/7d519b0b6495cbe937bc466cc5ec44f429786c5e))
* **observability:** scrub performance traces before they leave the device ([018c5e7](https://github.com/Entity-bot-null/project-template-app/commit/018c5e7941122257fd578f152dd01389e81d75f0))
* **security:** read license expressions as SPDX does ([28fc03e](https://github.com/Entity-bot-null/project-template-app/commit/28fc03eea101f6735ad15c17d5e68abc55ce656e))

# 0001. Build mobile apps with Expo, React Native and a small set of official or established libraries

- **Status:** Accepted
- **Date:** 2026-10-05
- **Deciders:** template maintainers

## Context

The template must produce commercial Android and iOS apps of store quality, maintained for years by
teams that also build the web template's TypeScript/React stack. Requirements: one codebase for both
platforms, native performance and access to native APIs, OTA fixes, reproducible cloud builds and
signing, strict typing end to end, and as few dependencies as possible, each with a clear reason,
compatible with React Native's New Architecture (the only architecture from React Native 0.82 on).

## Options

**Framework**

1. **Native (Swift + Kotlin):** best platform fidelity; two codebases, two teams, nothing shared
   with the web stack.
2. **Flutter:** one codebase, good performance; Dart and its own widget set, nothing shared with
   the web stack (TypeScript, React, Zod, OpenAPI tooling).
3. **React Native without a framework:** hand-maintained native projects, upgrades by diffing
   templates, no OTA or cloud build service.
4. **React Native with Expo** (the framework React Native's documentation recommends): native
   projects generated from configuration (upgrades become dependency bumps), a versioned SDK of
   native modules tested together, EAS for builds, signing, submission and OTA updates, and the
   same language and libraries as the web template.

**Libraries**, each the smallest well-maintained option that fits:

| Need                     | Chosen                         | Ruled out, and why                                                                                                                 |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Navigation               | Expo Router                    | React Navigation directly: Expo Router is built on it and adds file routes, typed routes, deep links and protected groups          |
| Server state             | TanStack Query                 | Redux Toolkit Query (pulls Redux in), SWR (weaker mutations and offline handling), hand-written fetching                           |
| Client state             | Zustand                        | Redux (ceremony for little client state), Context alone (re-renders everything), MobX                                              |
| Validation               | Zod                            | Yup, Valibot: Zod is shared with the web template and its resolvers                                                                |
| Forms                    | React Hook Form + Zod resolver | Formik (more re-renders, less maintained), TanStack Form (younger ecosystem)                                                       |
| HTTP                     | `fetch` + `openapi-fetch`      | Axios (bigger, duplicates `fetch`, its interceptors are reimplemented in 100 lines here)                                           |
| Contract types           | `openapi-typescript`           | Orval / code generators of whole clients (more generated code to review)                                                           |
| Secure storage           | `expo-secure-store`            | `react-native-keychain` (equivalent, not in the SDK), AsyncStorage (not encrypted)                                                 |
| Other storage            | `expo-sqlite` key-value store  | AsyncStorage (asynchronous only, a community module), MMKV (fast, but a third-party native module for what the SDK already covers) |
| Images                   | `expo-image`                   | React Native `Image` (no disk cache, no placeholders), FastImage (unmaintained)                                                    |
| Errors and crashes       | Sentry                         | Firebase Crashlytics (pulls Firebase in, weaker JavaScript support), Bugsnag (equivalent; Sentry has Expo's official integration)  |
| Unit and component tests | Jest (`jest-expo`) + RNTL      | Vitest (not supported by React Native's toolchain)                                                                                 |
| End-to-end tests         | Maestro                        | Detox (gray-box, needs native test builds per platform and more maintenance), Appium (slower, heavier)                             |
| Builds and updates       | EAS Build, Submit, Update      | Fastlane + CodePush (CodePush retired; more infrastructure to own)                                                                 |
| Styling                  | `StyleSheet` + design tokens   | NativeWind/Tailwind, Tamagui, styled-components (another layer to learn and upgrade; tokens cover the need)                        |
| Package manager          | pnpm                           | npm, Yarn: pnpm is the web template's, with its supply-chain settings                                                              |

Not included until a product needs them, with the recommended choice documented where it would go:
query persistence and offline writes, a remote feature flag provider, an analytics provider,
FlashList, certificate pinning, attestation, internationalization (`expo-localization` with an i18n
library), biometric unlock.

## Decision

Expo (SDK 57) with React Native's New Architecture, Expo Router, TanStack Query, Zustand, Zod,
React Hook Form, `openapi-fetch`, Expo SDK modules for storage, images, notifications, network and
updates, Sentry behind an interface, Jest with React Native Testing Library, Maestro, and EAS for
delivery. Every library is either part of the Expo SDK, recommended by Expo's documentation, or
shared with the web template.

## Consequences

- One TypeScript codebase for both platforms, sharing contract tooling, validation and practices
  with the web template; developers move between them.
- Native projects are generated: native customization goes through config plugins or local Expo
  modules, never hand edits ([MOBILE_ARCHITECTURE.md](../MOBILE_ARCHITECTURE.md#native-code)).
- The Expo SDK sets the versions of React Native and native modules: upgrades happen an SDK at a
  time, about three times a year ([RELEASES.md](../RELEASES.md#expo-sdk-upgrades)).
- Builds, signing and OTA updates depend on EAS (an Expo account; paid plans for volume, priority
  builders and some features). Local builds (`pnpm android`, `pnpm ios`, `eas build --local`)
  remain possible if that dependency must be reduced.
- The decision would be wrong if the product needs heavy native UI per platform (then native, or
  local Expo modules for those screens) or a capability no React Native library or Expo module
  can reach.

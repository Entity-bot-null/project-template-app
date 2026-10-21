# Performance

What the template does for performance, how it is measured, and the rules for new code. The first
rule: measure before optimizing. Most "optimizations" without a measurement add complexity and fix
nothing; the ones below are either free (configuration) or address a known cost.

- [Targets](#targets)
- [What is already in place](#what-is-already-in-place)
- [Lists](#lists)
- [Rendering](#rendering)
- [Images](#images)
- [Startup](#startup)
- [Bundle budget](#bundle-budget)
- [Network and data](#network-and-data)
- [Measuring](#measuring)
- [Known costs](#known-costs)

## Targets

Set per project; these are reasonable defaults for a commercial app, measured on a **mid-range
Android device in a release build** (an emulator or a debug build says little about real
performance):

| Metric                                 | Target                      |
| -------------------------------------- | --------------------------- |
| Cold start to first interactive screen | < 2 s                       |
| Interactions (tap → visible response)  | < 100 ms                    |
| Scrolling                              | 60 fps without blank areas  |
| JavaScript bundle (Hermes bytecode)    | within `bundle-budget.json` |
| Crash-free sessions (Sentry)           | > 99.5 %                    |

## What is already in place

| Measure                                                        | Where                                          |
| -------------------------------------------------------------- | ---------------------------------------------- |
| New Architecture (Fabric, TurboModules, bridgeless) and Hermes | Expo SDK 57 defaults; nothing to enable        |
| React Compiler: components and hooks memoized automatically    | `experiments.reactCompiler` in `app.config.ts` |
| Virtualized, paginated lists                                   | `ItemsScreen.tsx`                              |
| Cached, deduplicated server data; no refetch on every focus    | TanStack Query defaults (`queryClient.ts`)     |
| Images decoded natively, cached, downsampled                   | `Image` (`expo-image`) in `src/ui`             |
| Styles created once per theme, not per render                  | `createStyles` (`ThemeProvider.tsx`)           |
| Store selectors: components re-render only on what they read   | Zustand selectors                              |
| Startup state read synchronously (no flash of defaults)        | `persistentStorageSync`                        |
| R8 minification and resource shrinking on Android release      | `expo-build-properties` in `app.config.ts`     |
| Bundle size budget in CI                                       | `pnpm bundle:check`                            |

## Lists

Any list that can grow beyond a screenful is virtualized: `FlatList` (or `SectionList`), never
`ScrollView` with `.map()`. `ItemsScreen.tsx` is the reference:

- a stable `keyExtractor` (the id, never the index);
- rows are components that receive only what they render (`ItemRow`), so the React Compiler can
  skip unchanged rows;
- pagination with `onEndReached` and `onEndReachedThreshold`, guarded against duplicate requests
  (`hasNextPage && !isFetchingNextPage`);
- pull to refresh, empty and error states, a footer spinner while the next page loads; a refresh
  or a next page that fails keeps the items on screen and says so where it happened (above the
  list, at its end), with a retry;
- `removeClippedSubviews` on Android.

Add when a measurement shows the need:

- fixed-height rows: `getItemLayout` (no measuring pass, instant `scrollToIndex`);
- heavy rows or thousands of items: [FlashList](https://shopify.github.io/flash-list/) (view
  recycling); remember `recyclingKey` on images in recycled rows;
- `initialNumToRender`, `windowSize`, `maxToRenderPerBatch` tuning, measured.

## Rendering

- The React Compiler memoizes components and hooks; manual `useMemo`, `useCallback` and `memo` are
  not needed for render performance and add noise. Code must follow the Rules of React for the
  compiler to apply (the `react-compiler` lint rules from `eslint-config-expo` report violations).
- Keep state as local as possible: a text field's value lives in the screen, not in a store, so
  typing re-renders one screen and not the app.
- Select from stores (`usePreferences((state) => state.theme)`), never the whole store.
- Animations: `react-native-reanimated` runs them on the UI thread (it ships with Expo Router;
  declare it with `pnpm exec expo install react-native-reanimated` before importing it); never
  animate with `setState` in a loop or JavaScript timers.
- Heavy work (parsing a large payload, sorting thousands of rows) does not run during a render or
  a gesture: do it in the query function (once per fetch), or defer it with
  `InteractionManager.runAfterInteractions` / `requestIdleCallback`.

## Images

`Image` from `src/ui` (built on `expo-image`): native decoding off the JavaScript thread, memory and
disk cache, downsampling to the displayed size, placeholders (blurhash/thumbhash) and a short
transition. Rules:

- ask the server for an image close to the displayed size (a CDN size parameter); a 4000 px photo in
  a 64 dp thumbnail wastes bandwidth and memory even when downsampled;
- give lists' images a `recyclingKey`;
- bundled images: PNG/WebP at the sizes used, compressed; they count toward the assets budget and
  every OTA update that changes them downloads them again.

## Startup

What happens before the first screen, in order: native launch → Hermes loads the bundle (bytecode:
no parsing) → module scope of `src/app/_layout.tsx` (observability, notifications, query client) →
session restore (secure storage read) → first render → splash screen hidden.

- Keep module scope cheap: no network calls, no large JSON parsing, no synchronous storage reads
  beyond the few startup keys.
- The splash screen stays until the session is restored, so the first visible screen is the right
  one; a restore never waits for the network (offline launches are instant).
- Import heavy, rarely used modules where they are used, not in the root layout.
- Fonts: the template uses system fonts. Custom fonts are embedded at build time with the
  `expo-font` config plugin (no runtime loading, no flash), not loaded with `useFonts` at startup.

## Bundle budget

`pnpm export` builds the release JavaScript bundles (Hermes bytecode) for Android and iOS into
`dist/`; `pnpm bundle:check` compares them with `bundle-budget.json` and fails when a bundle or the
assets of a platform grow past it. Both run in `pnpm build:check`, `pnpm verify` and CI.

Measured when the template was built (Expo SDK 57):

| Platform | Bundle (Hermes bytecode) | gzip     | Assets   | Budget (bundle / assets) |
| -------- | ------------------------ | -------- | -------- | ------------------------ |
| Android  | 5 640 kB                 | 2 454 kB | 1 385 kB | 6 200 / 1 500 kB         |
| iOS      | 5 312 kB                 | 2 303 kB | 419 kB   | 5 800 / 500 kB           |

The bundle matters three times: it is inside every store binary, Hermes maps it at every start, and
an OTA update downloads it (compressed) every time it changes. When the check fails:

1. Find what grew with Expo Atlas: `EXPO_ATLAS=true pnpm export`, then
   `pnpm dlx expo-atlas .expo/atlas.jsonl` shows the bundle's modules by size.
2. Drop or replace the heavy dependency, import only what is used (`lodash/debounce`, not `lodash`),
   compress images.
3. If the growth is justified, raise the budget in the same pull request and say why. A reviewer of
   `bundle-budget.json` (CODEOWNERS) decides.

## Network and data

- TanStack Query deduplicates identical requests, caches results (30 s fresh) and cancels the
  requests of screens the user left.
- Paginate on the server (`limit`/`offset` or cursors); never download a whole collection to filter
  it on the device.
- Debounce search input (`useDebouncedValue`, 300 ms): one request per pause in typing.
- Prefetch the next screen's data when the intent is clear (`queryClient.prefetchQuery` on press-in
  of a row), not speculatively for everything.

## Measuring

| Question                               | Tool                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| Which component re-renders and why     | React DevTools Profiler (`j` in the `pnpm start` terminal opens the DevTools)        |
| JavaScript CPU time                    | React Native DevTools, Performance panel (`j` in the `pnpm start` terminal)          |
| Frame drops, UI vs JavaScript thread   | Performance monitor (dev menu); Android Studio profiler; Xcode Instruments           |
| Startup and slow screens in production | Sentry performance tracing (`EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, a small sample) |
| What is in the bundle                  | Expo Atlas (above)                                                                   |
| Release behavior on a device           | a `preview` build, or `pnpm android --variant release` locally                       |

Always measure release builds: development builds run without minification, with extra checks and
the dev tools attached, and are several times slower.

## Known costs

Framework costs measured in the template, not worth fighting:

- **Expo Router's dependencies** (`react-native-reanimated`, `react-native-worklets`, `@expo/ui`,
  `expo-symbols`) are compiled into every build, used or not.
- **Material Symbols font (967 kB, Android assets)**: `expo-symbols`, used by Expo Router's native
  tabs on Android, ships it. It is most of the Android assets budget. EAS Update stores assets by
  content hash, so an update downloads it only when it changes, which in practice means after an
  SDK upgrade.
- **`expo-dev-client`** is a dependency so development builds have the launcher and dev menu. Its
  tools exist only in debug builds; a release build changes by little more than a few header files.

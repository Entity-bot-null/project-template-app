// The fingerprint behind the runtime version (runtimeVersion: { policy:
// 'fingerprint' } in app.config.ts): Expo's default ('balanced' preset), with
// one change. By default every script of package.json is hashed, so renaming
// a test script gave the app a new runtime version, and the next OTA update
// needed a new store binary although no native code had changed. Here the
// fingerprint keeps only the scripts that run while dependencies install or
// a build compiles, the ones that can change the binary: npm's install
// lifecycle, EAS Build's hooks, and `android`/`ios` when they do more than
// `expo run:<platform>` (Expo drops those itself). Adding or changing one of
// them still changes the runtime version
// (docs/releases.md#runtime-versions-and-compatibility).
//
//   pnpm --filter mobile exec fingerprint fingerprint:generate   the fingerprint and its sources

/** The scripts of package.json that can change what a build compiles. */
const NATIVE_SCRIPTS = /^(preinstall|install|postinstall|prepare|android|ios|eas-build-.+)$/;

/**
 * The scripts source with only those scripts; every other source unchanged.
 * @type {import('@expo/fingerprint').FileHookTransformFunction}
 */
function fileHookTransform(source, chunk) {
  if (source.type !== 'contents' || source.id !== 'packageJson:scripts' || chunk === null) {
    return chunk;
  }
  const scripts = /** @type {Record<string, string>} */ (JSON.parse(chunk.toString()));
  return JSON.stringify(
    Object.fromEntries(Object.entries(scripts).filter(([name]) => NATIVE_SCRIPTS.test(name))),
  );
}

/** @type {import('@expo/fingerprint').Config} */
module.exports = { fileHookTransform };

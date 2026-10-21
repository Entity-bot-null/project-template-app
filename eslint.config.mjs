// ESLint, one configuration for the whole workspace (`pnpm lint` runs it once
// from the root, the pre-commit hook on staged files, CI on everything). The
// app (apps/mobile): Expo's recommended rules (React, hooks, imports, Expo),
// the strict type-aware rules of typescript-eslint, and the architecture rules
// of this template (docs/mobile-architecture.md): which layer may import what.
// The repository tooling: ESLint's recommended rules for Node.js. Prettier
// owns formatting. `pnpm lint` allows zero warnings.
import { createRequire } from 'node:module';

import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import { configs as tsConfigs, plugin as tsPlugin } from 'typescript-eslint';

// eslint-config-expo is versioned with the Expo SDK (expo/bundledNativeModules.json):
// apps/mobile declares it, so expo-doctor and `expo install --fix` keep it in
// step with the SDK, and it is loaded from there (docs/adr/0002-pnpm-monorepo.md).
const requireFromMobile = createRequire(new URL('./apps/mobile/package.json', import.meta.url));
/** @type {import('eslint').Linter.Config[]} */
const expoConfig = requireFromMobile('eslint-config-expo/flat.js');

const MOBILE = 'apps/mobile';

/**
 * A shared configuration applied to the app only: each block's file patterns
 * moved under apps/mobile (all of the app for a block without them), and the
 * patterns of a global ignore too. Expo's blocks bring their own copy of
 * typescript-eslint's plugin, which a typescript-eslint update leaves behind
 * at its older version; ESLint refuses two plugin objects under one name for
 * a file, so those blocks get this repository's (the same major), which also
 * serves Expo's @typescript-eslint rules.
 * @param {import('eslint').Linter.Config[]} configs
 * @returns {import('eslint').Linter.Config[]}
 */
function inMobile(configs) {
  const under = (/** @type {string} */ pattern) => `${MOBILE}/${pattern}`;
  return configs.map((config) => {
    const keys = Object.keys(config).filter((key) => key !== 'name');
    if (keys.length === 1 && config.ignores) {
      return { ...config, ignores: config.ignores.map(under) };
    }
    const plugins = config.plugins?.['@typescript-eslint']
      ? { ...config.plugins, '@typescript-eslint': tsPlugin }
      : config.plugins;
    return {
      ...config,
      ...(plugins ? { plugins } : {}),
      files: config.files
        ? config.files.map((pattern) => under(/** @type {string} */ (pattern)))
        : [`${MOBILE}/**`],
    };
  });
}

// Raw colors belong to the theme only (src/ui/theme): one palette, light and
// dark mode from the same tokens. Caught: hex, rgb(), hsl() and hwb() values,
// and every named color React Native resolves, in lowercase as React Native
// matches them (@react-native/normalize-colors). 'transparent' stays allowed:
// it is the absence of a color, with no contrast or dark mode to get wrong.
const NAMED_COLORS = `aliceblue antiquewhite aqua aquamarine azure beige bisque black
  blanchedalmond blue blueviolet brown burlywood burntsienna cadetblue chartreuse chocolate
  coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen
  darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon
  darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink
  deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro
  ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory
  khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
  lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
  magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
  mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
  mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
  palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen
  seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal
  thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/);
const COLOR_LITERAL = String.raw`/^(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|hwb\(|(?:${NAMED_COLORS.join('|')})$)/`;

// What only one layer may import (docs/mobile-architecture.md#layers-and-dependency-rules),
// by the layer that owns it. Every block below builds no-restricted-imports
// from this list with restrictedImports(): in flat config a later block's
// options replace the earlier ones, so a block that restated the rule by hand,
// or switched it off, would drop every other boundary for its files.
const LAYER_IMPORTS = {
  designSystem: {
    name: 'react-native',
    importNames: [
      'Text',
      'TextInput',
      'Button',
      'Image',
      'TouchableOpacity',
      'TouchableHighlight',
      'TouchableWithoutFeedback',
      'TouchableNativeFeedback',
    ],
    message:
      'Use the design system (src/ui: Text, TextField, Button, Card, Image): consistent typography, theming and accessibility.',
  },
  image: {
    name: 'expo-image',
    message: 'Use Image from src/ui: caching, transitions and a required accessibility label.',
  },
  observability: {
    name: '@sentry/react-native',
    message:
      'Report through src/lib/observability (errorReporter); only its Sentry adapter imports the SDK.',
  },
  secureStorage: {
    name: 'expo-secure-store',
    message: 'Use src/lib/storage (secureStorage).',
  },
  persistentStorage: {
    name: 'expo-sqlite/kv-store',
    message: 'Use src/lib/storage (persistentStorage).',
  },
  apiClient: {
    name: 'openapi-fetch',
    message: 'Use the API client of src/api.',
  },
};

/**
 * The no-restricted-imports rule for a layer: every boundary of LAYER_IMPORTS
 * except the imports the layer owns, plus the layer's own patterns.
 * @param {{ owns?: (keyof typeof LAYER_IMPORTS)[]; patterns?: { group: string[]; message: string }[] }} [layer]
 */
function restrictedImports({ owns = [], patterns = [] } = {}) {
  const paths = Object.entries(LAYER_IMPORTS)
    .filter(([layer]) => !owns.includes(/** @type {keyof typeof LAYER_IMPORTS} */ (layer)))
    .map(([, path]) => path);
  return ['error', patterns.length > 0 ? { paths, patterns } : { paths }];
}

export default defineConfig([
  globalIgnores([
    '**/dist/**',
    '**/coverage/**',
    '**/.expo/**',
    // Generated native projects (expo prebuild), the app's and any left at the
    // root by a checkout from before the workspace.
    'android/**',
    'ios/**',
    'apps/mobile/android/**',
    'apps/mobile/ios/**',
    // Written by `expo customize tsconfig.json` (types:generate).
    '**/expo-env.d.ts',
    'apps/mobile/src/api/schema.d.ts',
  ]),

  // The repository tooling (scripts/, the root configuration files): plain
  // JavaScript on Node.js. ESLint's and the import plugin's recommended
  // rules, plus the ones of Expo's core set they lack: Expo's configuration
  // checked these files before the app moved to apps/mobile.
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended, importPlugin.flatConfigs.recommended],
    // The import plugin's preset parses as ES2018: these scripts run on the
    // Node.js of .nvmrc.
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    // TypeScript's resolution reads package.json "exports" (eslint/config,
    // typescript-eslint), which the plugin's Node.js resolver does not.
    settings: { 'import/resolver': { node: true, typescript: true } },
    rules: {
      eqeqeq: ['error', 'smart'],
      'import/first': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-unused-expressions': ['error', { allowShortCircuit: true }],
      'no-var': 'error',
      'unicode-bom': ['error', 'never'],
    },
  },

  ...inMobile(expoConfig),
  // Expo's import rules resolve the app's path aliases (@/) through its tsconfig.
  {
    files: [`${MOBILE}/**`],
    settings: {
      'import/resolver': {
        typescript: { project: `${MOBILE}/tsconfig.json` },
      },
    },
  },

  // Directive comments: an eslint-disable names its rules and says why on the
  // same line (`// eslint-disable-next-line <rule> -- <why>`), so review sees
  // the reason. Unused ones are errors too (reportUnusedDisableDirectives).
  {
    plugins: comments.recommended.plugins,
    rules: {
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/require-description': [
        'error',
        { ignore: ['eslint-enable'] },
      ],
    },
  },

  // TypeScript: strict, type-aware.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tsConfigs.strictTypeChecked, tsConfigs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Type-only aliases and interfaces both have their place.
      '@typescript-eslint/consistent-type-definitions': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // Application code: the architecture rules.
  {
    files: ['apps/mobile/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${COLOR_LITERAL}]`,
          message: 'Use a theme color (useTheme().colors): raw colors live in src/ui/theme only.',
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from apps/mobile/src/config/env.ts (validated at startup).',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message: 'Call the API through src/api (timeouts, auth, errors) and TanStack Query.',
        },
      ],
      'no-restricted-imports': restrictedImports(),
    },
  },

  // The layers allowed to use what the rules above keep from everyone else:
  // each one lifts only what it owns.
  {
    files: ['apps/mobile/src/ui/theme/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['apps/mobile/src/config/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['apps/mobile/src/lib/observability/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['apps/mobile/src/api/**'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-imports': restrictedImports({ owns: ['apiClient'] }),
    },
  },
  {
    files: ['apps/mobile/src/ui/**'],
    rules: { 'no-restricted-imports': restrictedImports({ owns: ['designSystem', 'image'] }) },
  },
  {
    files: ['apps/mobile/src/lib/storage/**'],
    rules: {
      'no-restricted-imports': restrictedImports({ owns: ['secureStorage', 'persistentStorage'] }),
    },
  },
  {
    files: ['apps/mobile/src/lib/observability/sentry.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ owns: ['observability'] }) },
  },

  // Routes (apps/mobile/src/app) stay thin: they compose screens from features and never
  // reach the API or storage themselves.
  {
    files: ['apps/mobile/src/app/**'],
    rules: {
      'no-restricted-imports': restrictedImports({
        patterns: [
          {
            group: ['@/api', '@/api/*', '@/lib/storage', '@/lib/storage/*'],
            message:
              'Routes compose screens from src/features; data access belongs to the feature (docs/mobile-architecture.md#navigation).',
          },
        ],
      }),
    },
  },

  // Tests: jest mocks are loosely typed by nature.
  {
    files: ['apps/mobile/**/*.spec.{ts,tsx}', 'apps/mobile/src/test/**'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
      // Tests set the configuration the app reads.
      'no-restricted-properties': 'off',
    },
  },

  // No JavaScript in the app's src/ (ENGINEERING_STANDARDS.md): TypeScript
  // never reads a .js file nothing imports, and Expo Router would still load
  // one under src/app as a route.
  {
    files: ['apps/mobile/src/**/*.{js,jsx,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Program', message: 'Write it in TypeScript: no JavaScript in src/.' },
      ],
    },
  },

  // Node.js: configuration files and scripts, the repository's and the app's.
  {
    files: [
      '*.{js,mjs,cjs}',
      'scripts/**/*.mjs',
      'apps/mobile/*.{js,mjs,cjs}',
      'apps/mobile/scripts/**/*.mjs',
    ],
    extends: [tsConfigs.disableTypeChecked],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        module: 'writable',
        require: 'readonly',
      },
    },
  },
  // Maestro's JavaScript (runScript in apps/mobile/.maestro/flows): its own globals, and
  // each variable of the flow's `env` as a global of the same name.
  {
    files: ['apps/mobile/.maestro/**/*.js'],
    extends: [tsConfigs.disableTypeChecked],
    languageOptions: {
      globals: {
        http: 'readonly',
        json: 'readonly',
        output: 'writable',
        maestro: 'readonly',
        MOCK_API_URL: 'readonly',
        CONTROL: 'readonly',
        ROUTE: 'readonly',
        STATUS: 'readonly',
      },
    },
  },
  {
    files: ['apps/mobile/app.config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  prettier,
]);

// ESLint: Expo's recommended rules (React, hooks, imports, Expo), the strict
// type-aware rules of typescript-eslint, and the architecture rules of this
// template (docs/MOBILE_ARCHITECTURE.md): which layer may import what. Prettier
// owns formatting. `pnpm lint` allows zero warnings.
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';
import { configs as tsConfigs } from 'typescript-eslint';

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

// What only one layer may import (docs/MOBILE_ARCHITECTURE.md#layers-and-dependency-rules),
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
    'dist/**',
    'coverage/**',
    'android/**',
    'ios/**',
    '.expo/**',
    'expo-env.d.ts',
    'src/api/schema.d.ts',
  ]),

  expoConfig,

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
    files: ['src/**/*.{ts,tsx}'],
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
          message: 'Read configuration from src/config/env.ts (validated at startup).',
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
    files: ['src/ui/theme/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['src/config/env.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['src/lib/observability/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/api/**'],
    rules: {
      'no-restricted-globals': 'off',
      'no-restricted-imports': restrictedImports({ owns: ['apiClient'] }),
    },
  },
  {
    files: ['src/ui/**'],
    rules: { 'no-restricted-imports': restrictedImports({ owns: ['designSystem', 'image'] }) },
  },
  {
    files: ['src/lib/storage/**'],
    rules: {
      'no-restricted-imports': restrictedImports({ owns: ['secureStorage', 'persistentStorage'] }),
    },
  },
  {
    files: ['src/lib/observability/sentry.ts'],
    rules: { 'no-restricted-imports': restrictedImports({ owns: ['observability'] }) },
  },

  // Routes (src/app) stay thin: they compose screens from features and never
  // reach the API or storage themselves.
  {
    files: ['src/app/**'],
    rules: {
      'no-restricted-imports': restrictedImports({
        patterns: [
          {
            group: ['@/api', '@/api/*', '@/lib/storage', '@/lib/storage/*'],
            message:
              'Routes compose screens from src/features; data access belongs to the feature (docs/MOBILE_ARCHITECTURE.md#navigation).',
          },
        ],
      }),
    },
  },

  // Tests: jest mocks are loosely typed by nature.
  {
    files: ['**/*.spec.{ts,tsx}', 'src/test/**'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-restricted-globals': 'off',
      'no-restricted-imports': 'off',
      // Tests set the configuration the app reads.
      'no-restricted-properties': 'off',
    },
  },

  // No JavaScript in src/ (ENGINEERING_STANDARDS.md): TypeScript never reads
  // a .js file nothing imports, and Expo Router would still load one under
  // src/app as a route.
  {
    files: ['src/**/*.{js,jsx,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'Program', message: 'Write it in TypeScript: no JavaScript in src/.' },
      ],
    },
  },

  // Node.js: configuration files and repository scripts.
  {
    files: ['*.{js,mjs,cjs}', 'scripts/**/*.mjs'],
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
  {
    files: ['app.config.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },

  prettier,
]);

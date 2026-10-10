// ESLint: Expo's recommended rules (React, hooks, imports, Expo), the strict
// type-aware rules of typescript-eslint, and the architecture rules of this
// template (docs/MOBILE_ARCHITECTURE.md): which layer may import what. Prettier
// owns formatting. `pnpm lint` allows zero warnings.
import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettier from 'eslint-config-prettier';
import { configs as tsConfigs } from 'typescript-eslint';

// Raw colors belong to the theme only (src/ui/theme): one palette, light and
// dark mode from the same tokens.
const COLOR_LITERAL = String.raw`/^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/`;

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
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text', 'TextInput', 'Button', 'Image', 'TouchableOpacity'],
              message:
                'Use the design system (src/ui: Text, TextField, Button, Image): consistent typography, theming and accessibility.',
            },
            {
              name: 'expo-image',
              message:
                'Use Image from src/ui: caching, transitions and a required accessibility label.',
            },
            {
              name: '@sentry/react-native',
              message:
                'Report through src/lib/observability (errorReporter); only its Sentry adapter imports the SDK.',
            },
            {
              name: 'expo-secure-store',
              message: 'Use src/lib/storage (secureStorage).',
            },
            {
              name: 'expo-sqlite/kv-store',
              message: 'Use src/lib/storage (persistentStorage).',
            },
            {
              name: 'openapi-fetch',
              message: 'Use the API client of src/api.',
            },
          ],
        },
      ],
    },
  },

  // The layers allowed to use what the rules above keep from everyone else.
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
    rules: { 'no-restricted-globals': 'off', 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/ui/**', 'src/lib/storage/**', 'src/lib/observability/sentry.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },

  // Routes (src/app) stay thin: they compose screens from features and never
  // reach the API or storage themselves.
  {
    files: ['src/app/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/api', '@/api/*', '@/lib/storage', '@/lib/storage/*'],
              message:
                'Routes compose screens from src/features; data access belongs to the feature (docs/MOBILE_ARCHITECTURE.md#navigation).',
            },
          ],
        },
      ],
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

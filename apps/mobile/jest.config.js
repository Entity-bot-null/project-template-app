// Jest with Expo's preset (jest-expo): React Native's test environment with
// the native side of the Expo SDK mocked. Unit, component and integration
// tests run here (docs/testing.md); end-to-end flows run on a device with
// Maestro (.maestro/).
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/src/test/env.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testMatch: ['<rootDir>/src/**/*.spec.ts?(x)'],
  // pnpm keeps packages under node_modules/.pnpm: React Native and Expo
  // packages ship untranspiled code and must go through Babel.
  transformIgnorePatterns: [
    'node_modules/(?!(.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@sentry/react-native|react-navigation|@react-navigation/.*|standard-navigation))',
  ],
  moduleNameMapper: {
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/test/**',
    '!src/**/*.spec.{ts,tsx}',
  ],
  coverageReporters: ['text-summary', 'html', 'lcov'],
  // A ratchet, never lowered silently (docs/testing.md#coverage): set to the
  // coverage measured when the template was built, rounded down.
  coverageThreshold: {
    global: { lines: 97, statements: 96, functions: 94, branches: 90 },
  },
};

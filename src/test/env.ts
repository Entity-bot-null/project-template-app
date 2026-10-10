// Runs before every test file (jest.config.js setupFiles): the public
// configuration the app validates at import time (src/config/env.ts).
// Placeholder values only: tests never reach a network.
process.env.EXPO_PUBLIC_APP_ENV = 'development';
process.env.EXPO_PUBLIC_API_URL = 'https://api.example.com';

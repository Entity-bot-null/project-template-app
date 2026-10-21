// Expo's Metro configuration, with Sentry's serializer: every bundle gets
// debug ids, so error reports map back to the original TypeScript once the
// source maps are uploaded (the Sentry config plugin does it in EAS builds).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);

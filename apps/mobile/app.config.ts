import type { ConfigContext, ExpoConfig } from 'expo/config';
import { type ConfigPlugin, withGradleProperties } from 'expo/config-plugins';

import pkg from './package.json';
import { parsePublicEnv } from './src/config/env.schema.ts';
import { APP_LINK_PATHS } from './src/lib/links.ts';

// The app config, evaluated by Expo CLI and EAS at build time (docs/releases.md).
// Everything returned here ends up in the app's manifest, readable by anyone
// who has the binary: never a secret.

/**
 * The app's identity. REQUIERE CONFIGURACIÓN: replace every placeholder when
 * starting a project (README.md#start-a-new-project). The identifier cannot
 * change after the first store release.
 */
interface AppIdentity {
  name: string;
  slug: string;
  identifier: string;
  scheme: string;
  easProjectId: string;
  owner: string | undefined;
  linkDomain: string;
  colors: Record<
    'splashBackground' | 'splashBackgroundDark' | 'adaptiveIconBackground' | 'notificationAccent',
    string
  >;
}

const APP: AppIdentity = {
  name: 'Template App',
  slug: 'template-app',
  // iOS bundle identifier and Android package (reverse DNS of a domain you own).
  identifier: 'com.example.templateapp',
  // Custom URL scheme for deep links: templateapp://items/42
  scheme: 'templateapp',
  // EAS project and account: printed by `eas init` (EAS CLI, not a project
  // dependency: README.md#commands). Empty: EAS Update off.
  easProjectId: '',
  owner: undefined,
  // Domain of universal links / Android App Links (https://<domain>/app/items/42),
  // once it serves apple-app-site-association and assetlinks.json (the `web`
  // image generates both: docs/mobile-architecture.md#deep-links). Empty: off.
  // REQUIERE CONFIGURACIÓN.
  linkDomain: '',
  colors: {
    splashBackground: '#FFFFFF',
    splashBackgroundDark: '#000000',
    adaptiveIconBackground: '#FFFFFF',
    notificationAccent: '#000000',
  },
};

/**
 * Build variants, chosen by APP_VARIANT (eas.json sets it per profile). Each
 * one installs side by side with the others: its own identifier and scheme.
 */
const VARIANTS = {
  development: { nameSuffix: ' (Dev)', idSuffix: '.dev', schemeSuffix: '-dev' },
  preview: { nameSuffix: ' (Preview)', idSuffix: '.preview', schemeSuffix: '-preview' },
  // A release build against the local mock API (Maestro, .maestro/README.md).
  e2e: { nameSuffix: ' (E2E)', idSuffix: '.e2e', schemeSuffix: '-e2e' },
  production: { nameSuffix: '', idSuffix: '', schemeSuffix: '' },
} as const;

type Variant = keyof typeof VARIANTS;

function variantFromEnv(value: string | undefined): Variant {
  const name = value ?? 'development';
  if (!Object.hasOwn(VARIANTS, name)) {
    throw new Error(
      `APP_VARIANT must be one of ${Object.keys(VARIANTS).join(', ')} (got "${name}")`,
    );
  }
  return name as Variant;
}

// Memory of the Android build's JVMs, written into the generated
// android/gradle.properties. Expo's template gives the Gradle daemon
// -Xmx2048m and 512 MB of metaspace, which a release build of this app runs
// out of while compiling Kotlin ("java.lang.OutOfMemoryError: Metaspace",
// then "Gradle build daemon disappeared unexpectedly"). Sized to fit a 7 GB
// CI runner next to Metro and the C++ compilers; the Kotlin compiler's daemon
// gets its own cap, or it would inherit the heap below.
const GRADLE_JVM_PROPERTIES = {
  'org.gradle.jvmargs': '-Xmx3g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8',
  'kotlin.daemon.jvmargs': '-Xmx2g',
};

const withGradleJvmMemory: ConfigPlugin = (config) =>
  withGradleProperties(config, (gradle) => {
    for (const [key, value] of Object.entries(GRADLE_JVM_PROPERTIES)) {
      const entry = gradle.modResults.find((item) => item.type === 'property' && item.key === key);
      if (entry?.type === 'property') entry.value = value;
      else gradle.modResults.push({ type: 'property', key, value });
    }
    return gradle;
  });

export default ({ config }: ConfigContext): ExpoConfig => {
  const variant = variantFromEnv(process.env.APP_VARIANT);
  const { nameSuffix, idSuffix, schemeSuffix } = VARIANTS[variant];

  // A build that ships must have a valid public configuration: fail here, at
  // build time, rather than at the first launch. Development tools (expo
  // doctor, expo config) may run without one.
  if (variant !== 'development' || process.env.EXPO_PUBLIC_API_URL !== undefined) {
    parsePublicEnv(process.env);
  }

  const identifier = `${APP.identifier}${idSuffix}`;
  const scheme = `${APP.scheme}${schemeSuffix}`;
  const sentry =
    process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
      ? { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }
      : undefined;

  return withGradleJvmMemory({
    ...config,
    name: `${APP.name}${nameSuffix}`,
    slug: APP.slug,
    ...(APP.owner !== undefined && { owner: APP.owner }),
    // The user-visible version comes from package.json (release-please bumps
    // it); build numbers are incremented by EAS (eas.json, appVersionSource).
    version: pkg.version,
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    scheme,
    icon: './assets/images/icon.png',
    // OTA updates (docs/releases.md#ota-updates): an update reaches only builds
    // whose native code has the same fingerprint, so a JavaScript update can
    // never run on a binary that lacks the native code it needs.
    runtimeVersion: { policy: 'fingerprint' },
    // Off for the E2E variant: its tests always run the bundle they were built with.
    updates:
      APP.easProjectId && variant !== 'e2e'
        ? {
            url: `https://u.expo.dev/${APP.easProjectId}`,
            checkAutomatically: 'ON_LOAD',
            fallbackToCacheTimeout: 0,
          }
        : { enabled: false },
    ios: {
      bundleIdentifier: identifier,
      supportsTablet: false,
      infoPlist: {
        // HTTPS (exempt encryption) only. Revisit if the app adds its own cryptography.
        ITSAppUsesNonExemptEncryption: false,
      },
      ...(APP.linkDomain ? { associatedDomains: [`applinks:${APP.linkDomain}`] } : {}),
    },
    android: {
      package: identifier,
      adaptiveIcon: {
        foregroundImage: './assets/images/adaptive-icon-foreground.png',
        monochromeImage: './assets/images/adaptive-icon-monochrome.png',
        backgroundColor: APP.colors.adaptiveIconBackground,
      },
      // Push notifications on Android need the Firebase project's
      // google-services.json (REQUIERE CONFIGURACIÓN, docs/mobile-architecture.md#notifications):
      // never committed; on EAS a file-type environment variable whose value
      // is the file's path on the builder.
      ...(process.env.GOOGLE_SERVICES_JSON && {
        googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
      }),
      // No adb or cloud backups of app data: tokens live in the Keystore, the
      // rest is a cache of the server (MASVS-STORAGE).
      allowBackup: false,
      // Only what the app uses; modules add their own (notifications).
      permissions: [],
      blockedPermissions: [
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ],
      ...(APP.linkDomain
        ? {
            intentFilters: [
              {
                action: 'VIEW',
                autoVerify: true,
                // The paths src/lib/links.ts accepts, one per route, all under
                // /app/: the rest of the domain is the website (links.spec.ts).
                data: APP_LINK_PATHS.map((path) => ({
                  scheme: 'https',
                  host: APP.linkDomain,
                  ...path,
                })),
                category: ['BROWSABLE', 'DEFAULT'],
              },
            ],
          }
        : {}),
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 160,
          backgroundColor: APP.colors.splashBackground,
          dark: {
            image: './assets/images/splash-icon.png',
            backgroundColor: APP.colors.splashBackgroundDark,
          },
        },
      ],
      // No Face ID usage text: nothing asks for biometrics. A project that
      // protects the refresh token with requireAuthentication sets the
      // sentence users will read here (SECURITY.md#advanced-device-controls).
      ['expo-secure-store', { faceIDPermission: false }],
      'expo-sqlite',
      [
        'expo-notifications',
        {
          icon: './assets/images/notification-icon.png',
          color: APP.colors.notificationAccent,
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            // R8: smaller release builds, and harder to read once decompiled.
            enableMinifyInReleaseBuilds: true,
            enableShrinkResourcesInReleaseBuilds: true,
            // Plain HTTP to the local mock API, for the E2E build only.
            usesCleartextTraffic: variant === 'e2e',
          },
        },
      ],
      // Source maps and native debug symbols uploaded during EAS builds, when
      // a Sentry project is configured (SENTRY_ORG, SENTRY_PROJECT and the
      // secret SENTRY_AUTH_TOKEN as EAS environment variables).
      ...(sentry ? [['@sentry/react-native/expo', sentry] as [string, typeof sentry]] : []),
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      appVariant: variant,
      ...(APP.easProjectId ? { eas: { projectId: APP.easProjectId } } : {}),
    },
  });
};

import { onlineManager } from '@tanstack/react-query';
import { type ReactNode, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { createStyles, useTheme } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { AlertText } from './AlertText';

const useStyles = createStyles((theme) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
}));

/** True while the device is offline (as TanStack Query sees it, src/lib/query/network.ts). */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
  );
}

/**
 * Tells the user why fresh data is not coming; cached screens keep working.
 * It sits at the top of the window, where apps draw edge to edge (Android
 * 15+, iPhones with a notch or a Dynamic Island): it pads the status bar and
 * the side insets itself, its background filling the area behind them.
 */
export function OfflineBanner() {
  const styles = useStyles();
  const { spacing } = useTheme();
  const insets = useSafeAreaInsets();
  if (useIsOnline()) return null;
  return (
    <View
      testID="offline-banner"
      style={[
        styles.banner,
        {
          paddingTop: insets.top + spacing.sm,
          paddingLeft: insets.left + spacing.lg,
          paddingRight: insets.right + spacing.lg,
        },
      ]}
    >
      <Icon name="cloud-offline-outline" size="sm" color="textMuted" />
      <AlertText variant="caption" tone="muted">
        You are offline. Showing saved data.
      </AlertText>
    </View>
  );
}

/**
 * A navigator under the offline banner. While the banner shows, it covers the
 * top inset, so the screens below must not pad it again: their headers read
 * the insets of this context (React Navigation's and the native stack's
 * alike), with the top one already taken. A native stack also takes
 * useOfflineBannerStackOptions().
 */
export function OfflineBannerLayout({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const below = useIsOnline() ? insets : { ...insets, top: 0 };
  return (
    <>
      <OfflineBanner />
      <SafeAreaInsetsContext.Provider value={below}>{children}</SafeAreaInsetsContext.Provider>
    </>
  );
}

/**
 * The screen options of a native stack under OfflineBannerLayout. iOS places
 * a native header from the stack's own position, below the banner, but on
 * Android it pads the status bar from the window wherever it sits: while the
 * banner shows and has padded it already, the stack's headers are told not to.
 */
export function useOfflineBannerStackOptions() {
  const bannerShown = !useIsOnline();
  return { unstable_nativeProps: { headerConfig: { disableTopInsetApplication: bannerShown } } };
}

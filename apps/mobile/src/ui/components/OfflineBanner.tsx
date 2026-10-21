import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { View } from 'react-native';

import { createStyles } from '../theme/ThemeProvider';
import { Icon } from './Icon';
import { AlertText } from './AlertText';

const useStyles = createStyles((theme) => ({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
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

/** Tells the user why fresh data is not coming; cached screens keep working. */
export function OfflineBanner() {
  const styles = useStyles();
  if (useIsOnline()) return null;
  return (
    <View style={styles.banner}>
      <Icon name="cloud-offline-outline" size="sm" color="textMuted" />
      <AlertText variant="caption" tone="muted">
        You are offline. Showing saved data.
      </AlertText>
    </View>
  );
}

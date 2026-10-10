import { ActivityIndicator, View } from 'react-native';

import { userMessage } from '@/lib/errors';

import { createStyles, useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { AlertText } from './AlertText';
import { Text } from './Text';

// The three states every data screen has besides its content
// (DEFINITION_OF_DONE.md): loading, empty and error. One look everywhere.

const useStyles = createStyles((theme) => ({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
}));

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View
      style={styles.centered}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({
  title,
  description,
  icon = 'albums-outline',
  action,
}: EmptyStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.centered}>
      <Icon name={icon} size="xl" color="textMuted" />
      <Text variant="heading" align="center">
        {title}
      </Text>
      {description !== undefined && (
        <Text tone="muted" align="center">
          {description}
        </Text>
      )}
      {action !== undefined && <Button label={action.label} onPress={action.onPress} />}
    </View>
  );
}

export interface ErrorStateProps {
  error: unknown;
  /** Retries the failed load; omit when retrying cannot help. */
  onRetry?: () => void;
  title?: string;
}

/** A failed load: what happened in the user's words, and a way out. */
export function ErrorState({ error, onRetry, title = 'Could not load this' }: ErrorStateProps) {
  const styles = useStyles();
  return (
    <View style={styles.centered}>
      <Icon name="cloud-offline-outline" size="xl" color="textMuted" />
      <Text variant="heading" align="center">
        {title}
      </Text>
      {/* The message is the alert: a role on the container would hide the button inside it. */}
      <AlertText tone="muted" align="center">
        {userMessage(error)}
      </AlertText>
      {onRetry !== undefined && <Button label="Try again" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

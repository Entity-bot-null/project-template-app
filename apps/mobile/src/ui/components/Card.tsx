import type { ReactNode } from 'react';
import { Pressable, View, type ViewProps } from 'react-native';

import { createStyles, useTheme } from '../theme/ThemeProvider';

export interface CardProps extends ViewProps {
  children: ReactNode;
  /** Makes the whole card one button: give it an accessibilityLabel. */
  onPress?: () => void;
}

const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: theme.scheme === 'dark' ? 1 : 0,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.elevation('low'),
  },
}));

export function Card({ children, onPress, style, ...props }: CardProps) {
  const theme = useTheme();
  const styles = useStyles();
  if (onPress === undefined) {
    return (
      <View style={[styles.card, style]} {...props}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && { backgroundColor: theme.colors.surfaceMuted },
        style,
      ]}
      {...props}
    >
      {children}
    </Pressable>
  );
}

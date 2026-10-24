import { ActivityIndicator, Pressable, type PressableProps, View } from 'react-native';

import { createStyles, useTheme } from '../theme/ThemeProvider';
import type { ColorTokens } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  icon?: IconName;
  /** Shows a spinner and ignores presses (a submission in flight). */
  loading?: boolean;
  fullWidth?: boolean;
}

const VARIANTS: Record<
  ButtonVariant,
  { background: keyof ColorTokens | null; pressed: keyof ColorTokens; text: keyof ColorTokens }
> = {
  primary: { background: 'primary', pressed: 'primaryPressed', text: 'onPrimary' },
  secondary: { background: 'surfaceMuted', pressed: 'border', text: 'text' },
  ghost: { background: null, pressed: 'surfaceMuted', text: 'primary' },
  danger: { background: 'danger', pressed: 'danger', text: 'onDanger' },
};

const useStyles = createStyles((theme) => ({
  base: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  fullWidth: { alignSelf: 'stretch' },
  inactive: { opacity: 0.5 },
}));

/** Every tappable action that is a button: one size, one set of states. */
export function Button({
  label,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  accessibilityLabel,
  ...props
}: ButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  const colors = VARIANTS[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        {
          backgroundColor:
            pressed && !inactive
              ? theme.colors[colors.pressed]
              : colors.background === null
                ? 'transparent'
                : theme.colors[colors.background],
        },
        inactive && styles.inactive,
      ]}
      {...props}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={theme.colors[colors.text]} />
        ) : (
          icon !== undefined && <Icon name={icon} color={colors.text} />
        )}
        <Text variant="label" style={{ color: theme.colors[colors.text] }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

import type { ReactNode } from 'react';
import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';
import type { ColorTokens, TypographyVariant } from '../theme/tokens';

export type TextTone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'onPrimary';

const TONES: Record<TextTone, keyof ColorTokens> = {
  default: 'text',
  muted: 'textMuted',
  primary: 'primary',
  danger: 'danger',
  success: 'success',
  onPrimary: 'onPrimary',
};

export interface TextProps extends Omit<NativeTextProps, 'children'> {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
  children: ReactNode;
}

/**
 * All text in the app. Scales with the user's font size setting (capped per
 * variant), and titles are headers for screen readers.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  align,
  style,
  accessibilityRole,
  ...props
}: TextProps) {
  const theme = useTheme();
  const token = theme.typography[variant];
  const isHeading = variant === 'display' || variant === 'title' || variant === 'heading';
  return (
    <NativeText
      accessibilityRole={accessibilityRole ?? (isHeading ? 'header' : 'text')}
      maxFontSizeMultiplier={token.maxFontSizeMultiplier}
      style={[
        {
          color: theme.colors[TONES[tone]],
          fontSize: token.fontSize,
          lineHeight: token.lineHeight,
          fontWeight: token.fontWeight,
        },
        align !== undefined && { textAlign: align },
        style,
      ]}
      {...props}
    />
  );
}

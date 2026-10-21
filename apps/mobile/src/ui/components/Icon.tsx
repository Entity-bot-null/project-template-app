import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

import { useTheme } from '../theme/ThemeProvider';
import type { ColorTokens } from '../theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  name: IconName;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: keyof ColorTokens;
  /** Give a label only when the icon carries meaning on its own (no text next to it). */
  accessibilityLabel?: string;
}

const SIZES = { sm: 'iconSm', md: 'iconMd', lg: 'iconLg', xl: 'iconXl' } as const;

/** One icon set (Ionicons), sized and colored from the theme. Decorative unless labeled. */
export function Icon({ name, size = 'md', color = 'text', accessibilityLabel }: IconProps) {
  const theme = useTheme();
  const labeled = accessibilityLabel !== undefined;
  return (
    <Ionicons
      name={name}
      size={theme.sizes[SIZES[size]]}
      color={theme.colors[color]}
      accessible={labeled}
      {...(labeled
        ? { accessibilityLabel, accessibilityRole: 'image' as const }
        : { importantForAccessibility: 'no-hide-descendants' as const })}
    />
  );
}

import {
  type ColorTokens,
  darkColors,
  elevation,
  type ElevationLevel,
  lightColors,
  radius,
  sizes,
  spacing,
  typography,
} from './tokens';

export type ColorScheme = 'light' | 'dark';

export interface Theme {
  scheme: ColorScheme;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  sizes: typeof sizes;
  typography: typeof typography;
  elevation: (level: ElevationLevel) => ReturnType<typeof elevation>;
}

function buildTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    colors: scheme === 'dark' ? darkColors : lightColors,
    spacing,
    radius,
    sizes,
    typography,
    elevation: (level) => elevation(level, scheme),
  };
}

/** Two constant themes: styles derived from them are computed once each. */
export const themes: Record<ColorScheme, Theme> = {
  light: buildTheme('light'),
  dark: buildTheme('dark'),
};

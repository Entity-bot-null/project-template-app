import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, type ReactNode, useContext, useEffect, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

import { usePreferences } from '@/store/preferences';

import { type ColorScheme, type Theme, themes } from './theme';

// Light and dark mode from the same tokens (docs/MOBILE_ARCHITECTURE.md#design-system):
// the scheme follows the device unless the user chose one in Settings. The
// navigators, the status bar and the root view (no white flash behind
// screens) follow it too.

const ThemeContext = createContext<Theme>(themes.light);

export function resolveScheme(
  preference: 'system' | ColorScheme,
  system: ReturnType<typeof useColorScheme>,
): ColorScheme {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = usePreferences((state) => state.theme);
  const system = useColorScheme();
  const theme = themes[resolveScheme(preference, system)];

  const navigationTheme = useMemo(() => {
    const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.colors.primary,
        background: theme.colors.background,
        card: theme.colors.background,
        text: theme.colors.text,
        border: theme.colors.border,
        notification: theme.colors.danger,
      },
    };
  }, [theme]);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.background);
  }, [theme]);

  return (
    <ThemeContext.Provider value={theme}>
      <NavigationThemeProvider value={navigationTheme}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Styles that depend on the theme, created once per theme:
 *
 *   const useStyles = createStyles((theme) => ({ card: { padding: theme.spacing.lg } }));
 *   const styles = useStyles();
 */
export function createStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T) {
  const cache = new Map<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (styles === undefined) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}

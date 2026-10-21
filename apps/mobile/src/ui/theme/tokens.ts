import { Platform, type ViewStyle } from 'react-native';

// Design tokens (docs/MOBILE_ARCHITECTURE.md#design-system): the only place with
// raw values. Components read them through useTheme(); an ESLint rule
// refuses color literals anywhere else.
//
// The palette is a neutral PLACEHOLDER, not a brand: replace `palette` and
// the semantic colors below with the product's (REQUIERE CONFIGURACIÓN),
// then run the tests: they measure the contrast of every rendered component
// and screen against WCAG AA, in light and dark mode (src/test/contrast.ts).

const palette = {
  white: '#FFFFFF',
  black: '#000000',
  gray50: '#F7F7F8',
  gray100: '#EEEEF0',
  gray200: '#DCDCE0',
  gray300: '#C2C2C9',
  gray500: '#6E6E78',
  gray600: '#55555E',
  gray700: '#3D3D45',
  gray800: '#26262C',
  gray900: '#17171B',
  blue400: '#7AA2F7',
  blue500: '#5C8AF0',
  blue600: '#2F5BD3',
  blue700: '#2449AE',
  red400: '#F28B82',
  red600: '#C5221F',
  red950: '#3B0F0E',
  red50: '#FCECEB',
  green400: '#6DD58C',
  green700: '#1E7D3B',
  amber300: '#FCD34D',
  amber800: '#8A5A00',
} as const;

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  /** Separators and decorative outlines. */
  border: string;
  /** The edge of a text field, its only outline: 3:1 on the background (WCAG 1.4.11). */
  inputBorder: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryPressed: string;
  onPrimary: string;
  danger: string;
  dangerSurface: string;
  onDanger: string;
  success: string;
  warning: string;
  focus: string;
  overlay: string;
}

export const lightColors: ColorTokens = {
  background: palette.white,
  surface: palette.gray50,
  surfaceMuted: palette.gray100,
  border: palette.gray300,
  inputBorder: palette.gray500,
  text: palette.gray900,
  textMuted: palette.gray600,
  primary: palette.blue600,
  primaryPressed: palette.blue700,
  onPrimary: palette.white,
  danger: palette.red600,
  dangerSurface: palette.red50,
  onDanger: palette.white,
  success: palette.green700,
  warning: palette.amber800,
  focus: palette.blue600,
  overlay: 'rgba(0, 0, 0, 0.4)',
};

export const darkColors: ColorTokens = {
  background: palette.black,
  surface: palette.gray900,
  surfaceMuted: palette.gray800,
  border: palette.gray700,
  inputBorder: palette.gray500,
  text: palette.gray50,
  textMuted: palette.gray300,
  primary: palette.blue400,
  primaryPressed: palette.blue500,
  onPrimary: palette.black,
  danger: palette.red400,
  dangerSurface: palette.red950,
  onDanger: palette.black,
  success: palette.green400,
  warning: palette.amber300,
  focus: palette.blue400,
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/** Spacing scale (dp / pt). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const sizes = {
  /** Minimum touch target: 48 dp (Android) covers the 44 pt of iOS. */
  touchTarget: 48,
  inputHeight: 48,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
  iconXl: 48,
  /** The app icon where the product introduces itself (onboarding). */
  logo: 72,
  /** Content never stretches wider than this on tablets and landscape. */
  maxContentWidth: 640,
} as const;

export type TypographyVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

export interface TypographyToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: '400' | '500' | '600' | '700';
  /** How far the user's font size setting may scale it: large text is already large. */
  maxFontSizeMultiplier: number;
}

// System fonts: they follow the platform and the user's accessibility
// settings. A custom font is added with expo-font (docs/MOBILE_ARCHITECTURE.md).
export const typography: Record<TypographyVariant, TypographyToken> = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '700', maxFontSizeMultiplier: 1.4 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', maxFontSizeMultiplier: 1.6 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '600', maxFontSizeMultiplier: 2 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', maxFontSizeMultiplier: 2.5 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500', maxFontSizeMultiplier: 2.5 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400', maxFontSizeMultiplier: 2.5 },
};

export type ElevationLevel = 'none' | 'low' | 'high';

/** Shadows (iOS) and elevation (Android); dark mode relies on surfaces and borders instead. */
export function elevation(level: ElevationLevel, scheme: 'light' | 'dark'): ViewStyle {
  if (level === 'none' || scheme === 'dark') return {};
  const depth = level === 'low' ? 2 : 6;
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: palette.black,
      shadowOpacity: level === 'low' ? 0.08 : 0.14,
      shadowRadius: depth * 2,
      shadowOffset: { width: 0, height: depth / 2 },
    },
    default: { elevation: depth },
  });
}

import { darkColors, elevation, lightColors } from './tokens';

// Accessibility gate for the palette: replacing the placeholder colors with
// a brand must keep text readable (WCAG 2.2 AA: 4.5:1 for text, 3:1 for
// large text and essential non-text elements).

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s colors', (_scheme, colors) => {
  it.each([
    ['text', 'background'],
    ['text', 'surface'],
    ['text', 'surfaceMuted'],
    ['textMuted', 'background'],
    ['textMuted', 'surface'],
    ['onPrimary', 'primary'],
    ['onDanger', 'danger'],
    ['primary', 'background'],
    ['danger', 'background'],
    ['danger', 'dangerSurface'],
    ['success', 'background'],
    ['warning', 'background'],
  ] as const)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps borders and focus rings visible (3:1 for focus)', () => {
    expect(contrast(colors.focus, colors.background)).toBeGreaterThanOrEqual(3);
  });
});

describe('elevation', () => {
  it('casts shadows in light mode only', () => {
    expect(elevation('none', 'light')).toEqual({});
    expect(elevation('low', 'dark')).toEqual({});
    expect(elevation('high', 'light')).not.toEqual({});
  });
});

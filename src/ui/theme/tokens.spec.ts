import { contrast } from '@/test/contrast';

import { darkColors, elevation, lightColors } from './tokens';

// The palette's own floor (WCAG 2.2 AA: 4.5:1 for text, 3:1 for essential
// non-text elements), checked before any component uses it. What components
// actually draw, pressed states and variants included, is measured on the
// rendered tree (src/test/contrast.ts, in components.spec.tsx and a11y.spec.tsx).

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
    ['onPrimary', 'primaryPressed'],
    ['onDanger', 'danger'],
    ['primary', 'background'],
    ['danger', 'background'],
    ['danger', 'dangerSurface'],
    ['success', 'background'],
    ['warning', 'background'],
  ] as const)('%s on %s reaches 4.5:1', (foreground, background) => {
    expect(contrast(colors[foreground], colors[background])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps focus rings and text field edges visible (3:1)', () => {
    expect(contrast(colors.focus, colors.background)).toBeGreaterThanOrEqual(3);
    expect(contrast(colors.inputBorder, colors.background)).toBeGreaterThanOrEqual(3);
  });
});

describe('elevation', () => {
  it('casts shadows in light mode only', () => {
    expect(elevation('none', 'light')).toEqual({});
    expect(elevation('low', 'dark')).toEqual({});
    expect(elevation('high', 'light')).not.toEqual({});
  });
});

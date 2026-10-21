import { isHiddenFromAccessibility, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle } from 'react-native';

// The contrast gate (docs/ACCESSIBILITY.md#automated-checks), measured on what
// is rendered rather than on a list of token pairs: every text against the
// background it is drawn on (the nearest ancestor with a background color),
// a meaningful icon likewise, and every text field's border against what
// surrounds it. A component that starts drawing a new pair, a pressed state
// or a new variant is measured without anyone updating a list.
//
// WCAG 2.2 AA: 4.5:1 for text (1.4.3), 3:1 for large text (24 px, or 18.66 px
// bold), for icons that carry meaning and for the boundary that identifies a
// text field (1.4.11). Disabled controls are exempt, as WCAG exempts them.

type Instance = NonNullable<typeof screen.root>;

const TEXT = 4.5;
const LARGE_TEXT = 3;
const NON_TEXT = 3;

function channels(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (match === null) throw new Error(`Contrast: cannot read the color "${color}"`);
  return [match[1], match[2], match[3]].map((hex) => parseInt(hex ?? '0', 16) / 255) as [
    number,
    number,
    number,
  ];
}

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio of two opaque colors, from 1 to 21. */
export function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

function isLarge(style: TextStyle): boolean {
  const size = style.fontSize ?? 14;
  const bold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 700;
  return size >= 24 || (bold && size >= 18.66);
}

function textOf(instance: Instance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('')
    .trim();
}

function opaque(color: unknown): string | null {
  return typeof color === 'string' && color !== 'transparent' ? color : null;
}

/**
 * Every pair on the current screen below its WCAG AA minimum, as readable
 * lines; empty when everything is readable. `background` is what the
 * rendered tree is drawn on (the theme's background color).
 */
export function contrastProblems(background: string): string[] {
  const root = screen.root;
  if (root === null) return [];
  const problems: string[] = [];

  function check(what: string, foreground: string, behind: string, minimum: number) {
    const ratio = contrast(foreground, behind);
    if (ratio < minimum) {
      problems.push(
        `${what}: ${foreground} on ${behind} is ${ratio.toFixed(2)}:1 (< ${minimum}:1)`,
      );
    }
  }

  function visit(instance: Instance, behind: string) {
    const props = instance.props as Record<string, unknown>;
    const disabled = (props.accessibilityState as { disabled?: boolean } | undefined)?.disabled;
    if (disabled === true || isHiddenFromAccessibility(instance)) return;
    // flatten() returns undefined for a missing style, whatever its type says.
    const flat = StyleSheet.flatten(props.style as TextStyle) as TextStyle | undefined;
    const style = flat ?? {};

    if (instance.type === 'TextInput') {
      const name = typeof props.accessibilityLabel === 'string' ? props.accessibilityLabel : '';
      if ((style.borderWidth ?? 0) > 0 && typeof style.borderColor === 'string') {
        check(`Border of the "${name}" field`, style.borderColor, behind, NON_TEXT);
      }
      const inside = opaque(style.backgroundColor) ?? behind;
      if (typeof style.color === 'string') check(`Text of "${name}"`, style.color, inside, TEXT);
      if (typeof props.placeholderTextColor === 'string') {
        check(`Placeholder of "${name}"`, props.placeholderTextColor, inside, TEXT);
      }
      return;
    }

    const own = opaque(style.backgroundColor) ?? behind;
    if (instance.type === 'Text' && typeof style.color === 'string') {
      const text = textOf(instance);
      if (props.accessibilityRole === 'image') {
        check(`Icon "${String(props.accessibilityLabel)}"`, style.color, own, NON_TEXT);
      } else if (text !== '') {
        check(`"${text}"`, style.color, own, isLarge(style) ? LARGE_TEXT : TEXT);
      }
    }
    for (const child of instance.children) {
      if (typeof child !== 'string') visit(child, own);
    }
  }

  visit(root, background);
  return problems;
}

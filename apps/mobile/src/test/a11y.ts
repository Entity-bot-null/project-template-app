import { isHiddenFromAccessibility, screen } from '@testing-library/react-native';

// An automated part of the accessibility gate (docs/accessibility.md#automated-checks):
// on the rendered screen, everything that reacts to a press has a role and a
// name, and every text input and switch has a name, so TalkBack and
// VoiceOver can say what it is. It cannot judge whether a name is good, or
// focus order and announcements: those stay in the manual checklist.

type Instance = NonNullable<typeof screen.root>;

function textOf(instance: Instance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textOf(child)))
    .join('')
    .trim();
}

function nameOf(instance: Instance): string {
  const props = instance.props as Record<string, unknown>;
  const label = props.accessibilityLabel ?? props['aria-label'];
  return typeof label === 'string' && label.trim() !== '' ? label.trim() : textOf(instance);
}

function isControl(instance: Instance): boolean {
  const props = instance.props as Record<string, unknown>;
  return (
    typeof instance.type === 'string' &&
    (typeof props.onClick === 'function' ||
      instance.type === 'TextInput' ||
      instance.type === 'RCTSwitch')
  );
}

/** The problems found on the current screen; empty when every control is usable. */
export function inaccessibleControls(): string[] {
  const root = screen.root;
  if (root === null) return [];
  const problems: string[] = [];
  // queryAll searches below the root only: the root can be a control too.
  for (const control of [root, ...root.queryAll(isControl)].filter(isControl)) {
    if (isHiddenFromAccessibility(control)) continue;
    const props = control.props as Record<string, unknown>;
    const declared = props.accessibilityRole ?? props.role;
    const role = typeof declared === 'string' ? declared : 'none';
    const name = nameOf(control);
    if (name === '') problems.push(`${control.type} (role ${role}): no accessible name`);
    if (control.type !== 'TextInput' && role === 'none') {
      problems.push(`${control.type} "${name}": no accessibility role`);
    }
  }
  return problems;
}

import { env } from '@/config/env';

// Feature flags (docs/MOBILE_ARCHITECTURE.md#feature-flags): every flag declared
// here with its default and why it exists, so shipping dark code is a
// reviewed decision. Values come from the defaults, overridden by
// EXPO_PUBLIC_FLAGS in development and preview builds. A remote provider
// (rollouts, experiments) plugs in as another source in resolveFlags();
// none is included: the choice is the project's.

export const FLAGS = {
  newItemForm: {
    default: true,
    description: 'Creating items from the list screen (example flag).',
  },
} as const satisfies Record<string, { default: boolean; description: string }>;

export type FlagName = keyof typeof FLAGS;
export type FlagValues = Record<FlagName, boolean>;

function isFlagName(name: string): name is FlagName {
  return Object.hasOwn(FLAGS, name);
}

/** Parses "name=true,other=false"; unknown names are ignored. */
export function parseFlagOverrides(value: string | undefined): Partial<FlagValues> {
  const overrides: Partial<FlagValues> = {};
  if (value === undefined) return overrides;
  for (const pair of value.split(',')) {
    const [name = '', setting] = pair.split('=');
    if (isFlagName(name) && (setting === 'true' || setting === 'false')) {
      overrides[name] = setting === 'true';
    }
  }
  return overrides;
}

export function resolveFlags(overrides: Partial<FlagValues>): FlagValues {
  const values = {} as FlagValues;
  for (const name of Object.keys(FLAGS) as FlagName[]) {
    values[name] = overrides[name] ?? FLAGS[name].default;
  }
  return values;
}

const values = resolveFlags(parseFlagOverrides(env.EXPO_PUBLIC_FLAGS));

export function isEnabled(name: FlagName): boolean {
  return values[name];
}

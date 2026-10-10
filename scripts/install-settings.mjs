// The supply-chain settings of pnpm-workspace.yaml, judged against
// scripts/dependency-policy.json (installSettings) by `pnpm deps:check`
// (scripts/check-dependencies.mjs; tests in scripts/install-settings.test.mjs).
//
// The file is read with a strict reader of the YAML it is written in rather
// than with line patterns: block mappings and lists, one-line flow lists and
// mappings ([a, b], {a: b}), plain and quoted scalars typed as YAML 1.2 does
// (true, 10080, no-downgrade), and comments. Anything else (anchors, aliases,
// tags, multi-line scalars, nested flow collections, duplicate keys, several
// documents) fails the check: a setting must never pass here while pnpm reads
// it as something else.

/**
 * @typedef {null | boolean | number | string | YamlValue[] | YamlMapping} YamlValue
 * @typedef {{ [key: string]: YamlValue }} YamlMapping
 * @typedef {{ number: number; indent: number; content: string }} Line
 * @typedef {{ reason: string; expires?: string }} SettingException
 * @typedef {{
 *   minimumReleaseAgeAtLeast: number;
 *   trustPolicyIgnoreAfterAtLeast: number;
 *   required: Record<string, YamlValue>;
 *   unsetOrEqual: Record<string, YamlValue>;
 *   exceptions: {
 *     allowBuilds: Record<string, SettingException>;
 *     trustPolicyExclude: Record<string, SettingException>;
 *     minimumReleaseAgeExclude: Record<string, SettingException>;
 *   };
 * }} InstallPolicy
 */

/** pnpm-workspace.yaml is written outside the subset this reader accepts. */
export class WorkspaceYamlError extends Error {}

/**
 * @param {Line | number} where
 * @param {string} message
 * @returns {never}
 */
function fail(where, message) {
  const number = typeof where === 'number' ? where : where.number;
  throw new WorkspaceYamlError(`line ${number}: ${message}`);
}

// Characters that cannot start a plain scalar here: indicators of anchors,
// aliases, tags, block scalars, directives and reserved ones.
const UNSUPPORTED_START = new Set(['&', '*', '!', '|', '>', '%', '@', '`']);

/** A byte order mark an editor may put first in the file. */
const BOM = String.fromCharCode(0xfeff);

/**
 * The text before a comment. A quote opens a quoted scalar only where a value
 * starts, so "don't" in a plain scalar stays plain.
 * @param {string} text
 * @param {number} number
 */
function stripComment(text, number) {
  /** @type {string | null} */
  let quote = null;
  let valueStart = true;
  for (let i = 0; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (quote === "'") {
      if (char === "'" && text.charAt(i + 1) === "'") i += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (char === '\\') i += 1;
      else if (char === '"') quote = null;
      continue;
    }
    if (char === '#' && (i === 0 || /\s/.test(text.charAt(i - 1)))) return text.slice(0, i);
    if (char === ' ') continue;
    if ((char === "'" || char === '"') && valueStart) {
      quote = char;
      valueStart = false;
      continue;
    }
    const next = text.charAt(i + 1);
    valueStart =
      char === '[' ||
      char === '{' ||
      char === ',' ||
      ((char === ':' || char === '-') && (next === '' || next === ' '));
  }
  if (quote !== null) fail(number, 'a quoted value must end on its own line');
  return text;
}

/**
 * The lines that carry content, with their indentation.
 * @param {string} text
 * @returns {Line[]}
 */
function toLines(text) {
  /** @type {Line[]} */
  const lines = [];
  (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/).forEach((source, index) => {
    const number = index + 1;
    const indentation = /^[ \t]*/.exec(source)?.[0] ?? '';
    const content = stripComment(source.slice(indentation.length), number).trimEnd();
    if (content === '') return;
    if (indentation.includes('\t')) fail(number, 'indent with spaces, not tabs');
    if (content === '---') {
      if (lines.length > 0) fail(number, 'one YAML document only');
      return;
    }
    if (content === '...' || content.startsWith('%')) {
      fail(number, 'directives and document markers are not supported');
    }
    lines.push({ number, indent: indentation.length, content });
  });
  return lines;
}

/**
 * A quoted scalar starting at `start`: single quotes ('' is a quote), or
 * double quotes without escape sequences.
 * @param {string} text
 * @param {number} start
 * @param {Line} line
 * @returns {{ value: string; end: number }}
 */
function readQuoted(text, start, line) {
  const quote = text.charAt(start);
  let value = '';
  for (let i = start + 1; i < text.length; i += 1) {
    const char = text.charAt(i);
    if (quote === "'" && char === "'") {
      if (text.charAt(i + 1) !== "'") return { value, end: i + 1 };
      value += "'";
      i += 1;
      continue;
    }
    if (quote === '"' && char === '\\') {
      fail(line, 'escape sequences in double quotes are not supported: use single quotes');
    }
    if (quote === '"' && char === '"') return { value, end: i + 1 };
    value += char;
  }
  return fail(line, 'a quoted value must end on its own line');
}

/**
 * A plain scalar, typed as the YAML 1.2 core schema types it.
 * @param {string} text
 * @returns {YamlValue}
 */
function resolvePlain(text) {
  if (/^(?:null|Null|NULL|~)$/.test(text)) return null;
  if (/^(?:true|True|TRUE)$/.test(text)) return true;
  if (/^(?:false|False|FALSE)$/.test(text)) return false;
  if (/^[-+]?[0-9]+$/.test(text)) return Number(text);
  if (/^0o[0-7]+$/.test(text)) return Number.parseInt(text.slice(2), 8);
  if (/^0x[0-9a-fA-F]+$/.test(text)) return Number.parseInt(text.slice(2), 16);
  if (/^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)(?:[eE][-+]?[0-9]+)?$/.test(text)) return Number(text);
  if (/^[-+]?\.(?:inf|Inf|INF)$/.test(text)) {
    return text.startsWith('-') ? -Infinity : Infinity;
  }
  if (/^\.(?:nan|NaN|NAN)$/.test(text)) return Number.NaN;
  return text;
}

/**
 * A scalar written on one line, outside or inside a flow collection.
 * @param {string} raw
 * @param {Line} line
 * @param {boolean} inFlow
 * @returns {YamlValue}
 */
function parseScalar(raw, line, inFlow) {
  const text = raw.trim();
  const first = text.charAt(0);
  if (first === "'" || first === '"') {
    const { value, end } = readQuoted(text, 0, line);
    if (text.slice(end).trim() !== '') fail(line, `unexpected text after ${text.slice(0, end)}`);
    return value;
  }
  if (UNSUPPORTED_START.has(first)) {
    fail(
      line,
      `a value starting with "${first}" (anchor, alias, tag, block scalar) is not supported`,
    );
  }
  if (/^[-?:](?:\s|$)/.test(text) || ',]}'.includes(first)) fail(line, `unexpected "${first}"`);
  if (/:(?:\s|$)/.test(text)) {
    fail(line, 'a mapping inside a list, or a value containing ": ", is not supported');
  }
  if (inFlow && /[[\]{}]/.test(text)) fail(line, 'nested flow collections are not supported');
  return resolvePlain(text);
}

/**
 * Splits a flow collection's inside at the commas outside quotes.
 * @param {string} inner
 * @param {Line} line
 */
function splitFlow(inner, line) {
  /** @type {string[]} */
  const items = [];
  let current = '';
  for (let i = 0; i < inner.length; i += 1) {
    const char = inner.charAt(i);
    if ((char === "'" || char === '"') && current.trim() === '') {
      const { end } = readQuoted(inner, i, line);
      current += inner.slice(i, end);
      i = end - 1;
    } else if (char === ',') {
      items.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  items.push(current);
  // YAML allows one trailing comma; an empty item anywhere else is an error.
  if (items.length > 1 && (items.at(-1) ?? '').trim() === '') items.pop();
  if (items.length === 1 && (items[0] ?? '').trim() === '') return [];
  if (items.some((item) => item.trim() === '')) fail(line, 'an empty entry in a flow collection');
  return items;
}

/**
 * A flow list or mapping written on one line: [a, 'b'], {a: b}, [], {}.
 * @param {string} text
 * @param {Line} line
 * @returns {YamlValue}
 */
function parseFlow(text, line) {
  const close = text.startsWith('[') ? ']' : '}';
  if (!text.endsWith(close)) {
    fail(line, `a flow collection must close (${close}) on its own line, with nothing after it`);
  }
  const items = splitFlow(text.slice(1, -1), line);
  if (close === ']') return items.map((item) => parseScalar(item, line, true));
  /** @type {YamlMapping} */
  const mapping = Object.create(null);
  for (const item of items) {
    const { key, rest } = splitKey(item.trim(), line);
    if (Object.hasOwn(mapping, key)) fail(line, `"${key}" is set twice`);
    mapping[key] = rest === '' ? null : parseScalar(rest, line, true);
  }
  return mapping;
}

/**
 * A value written after "key:" or "- " on the same line.
 * @param {string} text
 * @param {Line} line
 * @returns {YamlValue}
 */
function parseInline(text, line) {
  if (text.startsWith('[') || text.startsWith('{')) return parseFlow(text, line);
  return parseScalar(text, line, false);
}

/**
 * "key: rest" into its key (plain or quoted) and the text after the colon.
 * @param {string} content
 * @param {Line} line
 */
function splitKey(content, line) {
  const first = content.charAt(0);
  if (first === "'" || first === '"') {
    const { value, end } = readQuoted(content, 0, line);
    const after = content.slice(end);
    if (!/^\s*:(?:\s|$)/.test(after)) fail(line, 'expected "key: value"');
    return { key: value, rest: after.replace(/^\s*:/, '').trim() };
  }
  const colon = content.search(/:(?:\s|$)/);
  if (colon <= 0) fail(line, 'expected "key: value"');
  const key = content.slice(0, colon).trimEnd();
  if (UNSUPPORTED_START.has(first) || '?-:,[]{}'.includes(first)) {
    fail(line, `a key starting with "${first}" must be quoted`);
  }
  return { key, rest: content.slice(colon + 1).trim() };
}

/** @param {string} content */
const isListItem = (content) => content === '-' || content.startsWith('- ');

/**
 * @param {Line[]} lines
 * @param {number} start
 * @param {number} indent
 * @returns {{ value: YamlValue; next: number }}
 */
function parseBlock(lines, start, indent) {
  const first = lines[start];
  if (first !== undefined && isListItem(first.content)) return parseList(lines, start, indent);
  return parseMapping(lines, start, indent);
}

/**
 * The value of "key:" or "-" with nothing after it: a block below, a list at
 * the same indentation (after a key only), or null.
 * @param {Line[]} lines
 * @param {number} next
 * @param {number} indent
 * @param {boolean} afterKey
 * @returns {{ value: YamlValue; next: number }}
 */
function parseNested(lines, next, indent, afterKey) {
  const line = lines[next];
  if (line !== undefined && line.indent > indent) return parseBlock(lines, next, line.indent);
  if (afterKey && line !== undefined && line.indent === indent && isListItem(line.content)) {
    return parseList(lines, next, indent);
  }
  return { value: null, next };
}

/**
 * @param {Line[]} lines
 * @param {number} start
 * @param {number} indent
 * @returns {{ value: YamlMapping; next: number }}
 */
function parseMapping(lines, start, indent) {
  /** @type {YamlMapping} */
  const mapping = Object.create(null);
  let i = start;
  while (i < lines.length) {
    const line = /** @type {Line} */ (lines[i]);
    if (line.indent < indent) break;
    if (line.indent > indent) fail(line, 'unexpected indentation (a value over several lines?)');
    if (isListItem(line.content)) fail(line, 'a list item where a key was expected');
    const { key, rest } = splitKey(line.content, line);
    if (Object.hasOwn(mapping, key)) fail(line, `"${key}" is set twice`);
    i += 1;
    if (rest !== '') {
      mapping[key] = parseInline(rest, line);
      continue;
    }
    const nested = parseNested(lines, i, indent, true);
    mapping[key] = nested.value;
    i = nested.next;
  }
  return { value: mapping, next: i };
}

/**
 * @param {Line[]} lines
 * @param {number} start
 * @param {number} indent
 * @returns {{ value: YamlValue[]; next: number }}
 */
function parseList(lines, start, indent) {
  /** @type {YamlValue[]} */
  const list = [];
  let i = start;
  while (i < lines.length) {
    const line = /** @type {Line} */ (lines[i]);
    if (line.indent !== indent || !isListItem(line.content)) break;
    const rest = line.content.slice(1).trim();
    i += 1;
    if (rest === '') {
      const nested = parseNested(lines, i, indent, false);
      list.push(nested.value);
      i = nested.next;
    } else if (isListItem(rest)) {
      fail(line, 'a list inside a list item is not supported');
    } else {
      list.push(parseInline(rest, line));
    }
  }
  const after = lines[i];
  if (after !== undefined && after.indent > indent) {
    fail(after, 'unexpected indentation (a value over several lines?)');
  }
  return { value: list, next: i };
}

/**
 * Reads pnpm-workspace.yaml. Throws WorkspaceYamlError, with the line, on
 * anything outside the subset described at the top of this file.
 * @param {string} text
 * @returns {YamlMapping}
 */
export function parseWorkspaceYaml(text) {
  const lines = toLines(text);
  const first = lines[0];
  if (first === undefined) return Object.create(null);
  if (first.indent !== 0) fail(first, 'the first setting must not be indented');
  if (isListItem(first.content)) fail(first, 'the file must be a mapping of settings');
  const { value, next } = parseMapping(lines, 0, 0);
  const rest = lines[next];
  if (rest !== undefined) fail(rest, 'unexpected indentation');
  return value;
}

// --- The policy ------------------------------------------------------------

/** @param {YamlValue | undefined} value */
const show = (value) => (value === undefined ? 'not set' : JSON.stringify(value));

/** @param {YamlValue | undefined} value */
const isMapping = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {YamlValue | undefined} value */
const isMinutes = (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0;

// A package name, optionally scoped, as npm accepts it.
const NAME = String.raw`(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*`;
// An exact version: no range, no wildcard.
const VERSION = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`;
// "name@1.2.3", or several exact versions of one package: "name@1.2.3 || 1.2.4".
const EXACT_VERSIONS = new RegExp(`^${NAME}@${VERSION}(?:\\s*\\|\\|\\s*${VERSION})*$`);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** The settings whose entries the policy can except. */
const EXCEPTION_SETTINGS = /** @type {const} */ ([
  'allowBuilds',
  'trustPolicyExclude',
  'minimumReleaseAgeExclude',
]);
const DAY = 24 * 60 * 60 * 1000;

/** @param {string} date YYYY-MM-DD */
function isRealDate(date) {
  return DATE.test(date) && new Date(`${date}T00:00:00Z`).toISOString().startsWith(date);
}

/**
 * A policy record as written, whatever its shape: a malformed one reads as
 * empty and fails its checks instead of crashing the gate.
 * @param {unknown} value
 * @returns {{ reason?: unknown; expires?: unknown }}
 */
function recorded(value) {
  return typeof value === 'object' && value !== null ? value : {};
}

/**
 * The list a setting holds (a missing or empty setting holds none), or null
 * when it is something else.
 * @param {YamlValue | undefined} value
 * @returns {string[] | null}
 */
function stringList(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  return value.every((entry) => typeof entry === 'string') ? /** @type {string[]} */ (value) : null;
}

/**
 * Judges the settings read from pnpm-workspace.yaml.
 * @param {YamlMapping} settings
 * @param {InstallPolicy} policy
 * @param {string} today the current date, YYYY-MM-DD (UTC)
 * @returns {{ problems: string[]; advisories: string[] }}
 */
export function checkInstallSettings(settings, policy, today) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const advisories = [];
  /** @param {string} key */
  const setting = (key) => (Object.hasOwn(settings, key) ? settings[key] : undefined);
  const policyFile = 'scripts/dependency-policy.json';

  // The release delay.
  const releaseAge = setting('minimumReleaseAge');
  if (!isMinutes(releaseAge) || Number(releaseAge) < policy.minimumReleaseAgeAtLeast) {
    problems.push(
      `pnpm-workspace.yaml: minimumReleaseAge is ${show(releaseAge)}, the policy requires at least ${policy.minimumReleaseAgeAtLeast} minutes. For an urgent fix, exempt the one version with minimumReleaseAgeExclude instead.`,
    );
  }

  // Settings with one accepted value, and settings left at pnpm's default
  // or set to that same value.
  for (const [key, value] of Object.entries(policy.required)) {
    if (setting(key) !== value) {
      problems.push(
        `pnpm-workspace.yaml: ${key} is ${show(setting(key))}, the policy requires ${show(value)}.`,
      );
    }
  }
  for (const [key, value] of Object.entries(policy.unsetOrEqual)) {
    if (setting(key) !== undefined && setting(key) !== value) {
      problems.push(
        `pnpm-workspace.yaml: ${key} is ${show(setting(key))}; the policy requires pnpm's default, ${show(value)} (or the setting left out).`,
      );
    }
  }

  // The trust policy's window: versions published longer ago than this are
  // not compared. Unset, every version is compared.
  const ignoreAfter = setting('trustPolicyIgnoreAfter');
  if (
    ignoreAfter !== undefined &&
    (!isMinutes(ignoreAfter) || Number(ignoreAfter) < policy.trustPolicyIgnoreAfterAtLeast)
  ) {
    problems.push(
      `pnpm-workspace.yaml: trustPolicyIgnoreAfter is ${show(ignoreAfter)}: versions published more than that many minutes ago skip the trust policy. The policy requires at least ${policy.trustPolicyIgnoreAfterAtLeast} (or the setting left out: every version is compared).`,
    );
  }

  // Install scripts: every entry false, unless the policy records why not.
  const builds = setting('allowBuilds');
  const buildExceptions = policy.exceptions.allowBuilds;
  if (builds !== undefined && builds !== null && !isMapping(builds)) {
    problems.push(`pnpm-workspace.yaml: allowBuilds must map package names to false.`);
  }
  const buildEntries = isMapping(builds) ? /** @type {YamlMapping} */ (builds) : {};
  for (const [name, value] of Object.entries(buildEntries)) {
    if (value !== false && !Object.hasOwn(buildExceptions, name)) {
      problems.push(
        `pnpm-workspace.yaml: allowBuilds sets "${name}" to ${show(value)}, so its install scripts run. Set it to false, or record the reviewed exception with its reason in ${policyFile} (installSettings.exceptions.allowBuilds).`,
      );
    }
  }
  for (const name of Object.keys(buildExceptions)) {
    if (!Object.hasOwn(buildEntries, name) || buildEntries[name] === false) {
      problems.push(
        `${policyFile}: the allowBuilds exception for "${name}" matches no entry of pnpm-workspace.yaml that runs scripts. Remove it.`,
      );
    }
  }

  // Packages the trust policy skips: each one recorded with its reason.
  const trustExcluded = stringList(setting('trustPolicyExclude'));
  const trustExceptions = policy.exceptions.trustPolicyExclude;
  if (trustExcluded === null) {
    problems.push(`pnpm-workspace.yaml: trustPolicyExclude must be a list of packages.`);
  }
  for (const entry of trustExcluded ?? []) {
    if (!Object.hasOwn(trustExceptions, entry)) {
      problems.push(
        `pnpm-workspace.yaml: trustPolicyExclude skips the trust policy for "${entry}", which ${policyFile} does not list (installSettings.exceptions.trustPolicyExclude). Remove it, or record the reviewed exception with its reason.`,
      );
    }
  }
  for (const entry of Object.keys(trustExceptions)) {
    if (!(trustExcluded ?? []).includes(entry)) {
      problems.push(
        `${policyFile}: the trustPolicyExclude exception for "${entry}" is not in pnpm-workspace.yaml. Remove it.`,
      );
    }
  }

  // Versions that skip the release delay: exact versions only, each recorded
  // with its reason and the date it expires. An exemption only bridges the
  // delay, so it may not expire later than the delay (rounded up to whole
  // days) plus one day from now.
  const ageExcluded = stringList(setting('minimumReleaseAgeExclude'));
  const ageExceptions = policy.exceptions.minimumReleaseAgeExclude;
  const delayDays = Math.ceil(
    Math.max(policy.minimumReleaseAgeAtLeast, isMinutes(releaseAge) ? Number(releaseAge) : 0) /
      (24 * 60),
  );
  const latestExpiry = new Date(Date.parse(`${today}T00:00:00Z`) + (delayDays + 1) * DAY)
    .toISOString()
    .slice(0, 10);
  if (ageExcluded === null) {
    problems.push(`pnpm-workspace.yaml: minimumReleaseAgeExclude must be a list of versions.`);
  }
  for (const entry of ageExcluded ?? []) {
    if (entry.includes('*')) {
      problems.push(
        `pnpm-workspace.yaml: minimumReleaseAgeExclude "${entry}" is a pattern: every matching version, published or still to come, would skip the release delay. Exempt exact versions only (name@1.2.3).`,
      );
      continue;
    }
    if (!EXACT_VERSIONS.test(entry)) {
      problems.push(
        `pnpm-workspace.yaml: minimumReleaseAgeExclude "${entry}" does not name exact versions: write name@1.2.3 (or name@1.2.3 || 1.2.4), so other versions still wait.`,
      );
      continue;
    }
    if (!Object.hasOwn(ageExceptions, entry)) {
      problems.push(
        `pnpm-workspace.yaml: minimumReleaseAgeExclude "${entry}" is not recorded in ${policyFile} (installSettings.exceptions.minimumReleaseAgeExclude): add it with its reason and the date it expires (YYYY-MM-DD, at most ${latestExpiry}).`,
      );
      continue;
    }
    const { expires } = recorded(ageExceptions[entry]);
    if (typeof expires !== 'string' || !isRealDate(expires)) {
      problems.push(
        `${policyFile}: the release-age exemption "${entry}" needs "expires", a date (YYYY-MM-DD).`,
      );
    } else if (expires <= today) {
      problems.push(
        `pnpm-workspace.yaml: the release-age exemption "${entry}" expired on ${expires}: the version is old enough now. Delete it here and in ${policyFile}, then run pnpm install --frozen-lockfile.`,
      );
    } else if (expires > latestExpiry) {
      problems.push(
        `${policyFile}: the release-age exemption "${entry}" expires on ${expires}, later than the release delay needs (at most ${latestExpiry}).`,
      );
    } else {
      advisories.push(
        `Advisory: ${entry} skips the minimumReleaseAge delay until ${expires} (minimumReleaseAgeExclude in pnpm-workspace.yaml); delete the exemption on that date.`,
      );
    }
  }
  for (const entry of Object.keys(ageExceptions)) {
    if (!(ageExcluded ?? []).includes(entry)) {
      problems.push(
        `${policyFile}: the release-age exemption "${entry}" is not in pnpm-workspace.yaml. Remove it.`,
      );
    }
  }

  // Every recorded exception says why.
  for (const settingName of EXCEPTION_SETTINGS) {
    for (const [entry, exception] of Object.entries(policy.exceptions[settingName])) {
      const { reason } = recorded(exception);
      if (typeof reason !== 'string' || reason.trim() === '') {
        problems.push(`${policyFile}: the ${settingName} exception "${entry}" needs a reason.`);
      }
    }
  }

  // Advisories pnpm audit skips (advisory: reviewed in pnpm-workspace.yaml).
  const audit = setting('audit');
  const ignored = isMapping(audit) ? stringList(/** @type {YamlMapping} */ (audit).ignore) : [];
  if (ignored?.length) {
    advisories.push(
      `Advisory: pnpm audit skips ${ignored.join(', ')} (audit.ignore in pnpm-workspace.yaml). Remove each one as soon as a fixed version exists (SECURITY.md#known-advisories).`,
    );
  }

  return { problems, advisories };
}

// Redaction for everything that leaves the app as text: log lines, error
// reports and breadcrumbs pass through here (SECURITY.md#logging-and-reports).
// Two layers:
//   - a value under a sensitive key ("password", "authorization", "token",
//     "apiKey", "secret"...) is replaced whole;
//   - every string is scanned for credentials and personal data that appear
//     inline: a bearer token or a JWT in a message, "token=..." in a URL, an
//     email address typed into a form.
// Over-redaction is the safe failure: a masked value costs a lookup, a leaked
// one costs a rotation and an incident.

export const REDACTED = '[REDACTED]';
export const REDACTED_EMAIL = '[EMAIL]';

/** Strings longer than this are cut before scanning. */
const MAX_TEXT_LENGTH = 16 * 1024;
/** Nesting kept in objects; deeper values are summarized. */
const MAX_DEPTH = 6;

const SENSITIVE_KEY =
  /passw(?:or)?d|passphrase|secret|token|authori[sz]ation|cookie|api[-_]?key|private[-_]?key|access[-_]?key|credential|signature|session[-_]?id|otp|pin$|^dsn$/i;

/** True when a value stored under this key must never be logged or reported. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

type Replacement = string | ((match: string, ...groups: string[]) => string);

// Ordered: the specific shapes first, the generic key=value rule last. Every
// pattern is linear (bounded repetition before any backtracking point), so a
// long string cannot stall the app.
const TEXT_RULES: readonly (readonly [RegExp, Replacement])[] = [
  // Credentials in URLs: scheme://user:password@host keeps the user.
  [/\b([a-z][a-z0-9+.-]{0,30}:\/\/)([^\s:/?#@]{0,256}):([^\s/?#@]{1,512})@/gi, `$1$2:${REDACTED}@`],
  // Authorization header values.
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${REDACTED}`],
  // JWTs (header and payload are base64url JSON, so both start with eyJ).
  [/\beyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{8,}/g, REDACTED],
  // Email addresses: personal data.
  [
    /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}\b/g,
    REDACTED_EMAIL,
  ],
  // key=value, key: value, "key": "value" with a sensitive key: query
  // strings, JSON, pretty-printed objects.
  [
    /(["']?)([A-Za-z_][\w.-]{0,63})\1(\s{0,4}[:=]\s{0,4})("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;&})\]"']+)/g,
    (match, quote = '', key = '', separator = '', value = '') =>
      isSensitiveKey(key) && !value.includes(REDACTED)
        ? `${quote}${key}${quote}${separator}${quoted(value)}`
        : match,
  ],
];

function quoted(value: string): string {
  const first = value[0];
  return first === '"' || first === "'" ? `${first}${REDACTED}${first}` : REDACTED;
}

/** Masks the credentials and email addresses a string carries inline. */
export function redactText(text: string): string {
  let output =
    text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}…[truncated]` : text;
  for (const [pattern, replacement] of TEXT_RULES) {
    output =
      typeof replacement === 'string'
        ? output.replace(pattern, replacement)
        : output.replace(pattern, replacement);
  }
  return output;
}

/**
 * A copy of `value` safe to log or report: sensitive keys masked at any depth,
 * strings scanned, errors rebuilt with redacted messages and stacks. Cycles
 * and excessive depth are summarized. The input is never mutated.
 */
export function redact<T>(value: T): T {
  return redactValue(value, 0, new WeakSet()) as T;
}

function redactValue(value: unknown, depth: number, ancestors: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (value instanceof Date) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[Binary]';

  ancestors.add(value);
  try {
    if (value instanceof Error) return redactError(value, depth, ancestors);
    if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1, ancestors));
    return redactEntries(value, depth, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function redactEntries(
  value: object,
  depth: number,
  ancestors: WeakSet<object>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    output[key] =
      isSensitiveKey(key) && item !== null && item !== undefined
        ? REDACTED
        : redactValue(item, depth + 1, ancestors);
  }
  return output;
}

function redactError(error: Error, depth: number, ancestors: WeakSet<object>): Error {
  const copy = new Error(
    redactText(error.message),
    error.cause === undefined
      ? undefined
      : { cause: redactValue(error.cause, depth + 1, ancestors) },
  );
  copy.name = error.name;
  if (error.stack !== undefined) copy.stack = redactText(error.stack);
  // Own fields (a kind, a status, details) travel with the error, redacted.
  Object.assign(copy, redactEntries(error, depth, ancestors));
  return copy;
}

/**
 * A URL as it may be recorded: scheme, host and path only. No credentials, no
 * query string (tokens and personal data travel there), no fragment.
 */
export function redactUrl(url: string): string {
  const withoutQuery = url.split(/[?#]/, 1)[0] ?? '';
  return redactText(withoutQuery.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1'));
}

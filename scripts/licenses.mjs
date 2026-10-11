// License expressions of the dependency policy (scripts/check-dependencies.mjs).

/**
 * Whether an SPDX expression, as pnpm reports it ("MIT", "(MIT OR CC0-1.0)",
 * "MIT and ISC"), can be met with allowed licenses only. AND binds tighter
 * than OR and parentheses group, as in SPDX: "(MIT OR Apache-2.0) AND
 * GPL-3.0" needs GPL-3.0 whichever alternative is chosen. An exception
 * ("Apache-2.0 WITH LLVM-exception") is judged by its license. An expression
 * that does not parse is not allowed.
 * @param {string} expression
 * @param {Set<string>} allowed
 */
export function isAllowed(expression, allowed) {
  const tokens = expression.match(/[()]|[^\s()]+/g) ?? [];
  let position = 0;
  const peek = () => tokens[position]?.toUpperCase();

  /** @returns {boolean} */
  function anyOf() {
    let result = allOf();
    while (peek() === 'OR') {
      position += 1;
      result = allOf() || result;
    }
    return result;
  }

  /** @returns {boolean} */
  function allOf() {
    let result = license();
    while (peek() === 'AND') {
      position += 1;
      result = license() && result;
    }
    return result;
  }

  /** @returns {boolean} */
  function license() {
    const token = tokens[position];
    position += 1;
    if (token === '(') {
      const result = anyOf();
      if (tokens[position] !== ')') throw new SyntaxError('unclosed parenthesis');
      position += 1;
      return result;
    }
    if (
      token === undefined ||
      token === ')' ||
      ['AND', 'OR', 'WITH'].includes(token.toUpperCase())
    ) {
      throw new SyntaxError(`license expected, found ${token ?? 'the end'}`);
    }
    if (peek() === 'WITH') position += 2;
    return allowed.has(token);
  }

  try {
    const result = anyOf();
    return position === tokens.length && result;
  } catch {
    return false;
  }
}

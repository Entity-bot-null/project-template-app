import { describe, expect, it } from 'vitest';
import { freeText, NUL_REFUSED } from './free-text.js';

describe('freeText', () => {
  const title = freeText().min(1).max(10);

  it('trims, and keeps every character but NUL as typed', () => {
    expect(title.parse('  Café 🍵 ')).toBe('Café 🍵');
    expect(title.parse('a\tb')).toBe('a\tb');
  });

  it('refuses a NUL anywhere, naming why, before the database sees it', () => {
    for (const value of ['\u0000', 'a\u0000b', 'ab\u0000']) {
      const result = title.safeParse(value);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.message)).toContain(NUL_REFUSED);
    }
  });

  it('keeps the bounds the caller adds', () => {
    expect(title.safeParse('').success).toBe(false);
    expect(title.safeParse('x'.repeat(11)).success).toBe(false);
  });
});

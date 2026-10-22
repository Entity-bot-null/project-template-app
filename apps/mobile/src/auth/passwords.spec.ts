import { z } from 'zod';

import { currentPassword, newPassword, withRepeatedPassword } from './passwords';

function messages(result: { success: boolean; error?: z.ZodError }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('newPassword', () => {
  it('accepts 15 to 200 characters, counted as the API counts them', () => {
    expect(newPassword.safeParse('a'.repeat(15)).success).toBe(true);
    expect(newPassword.safeParse('😀'.repeat(15)).success).toBe(true); // 30 UTF-16 units
    expect(newPassword.safeParse('a'.repeat(200)).success).toBe(true);
  });

  it('says what is missing', () => {
    expect(messages(newPassword.safeParse(''))).toEqual(['Choose a password']);
    expect(messages(newPassword.safeParse('a'.repeat(14)))).toEqual([
      'Use at least 15 characters.',
    ]);
    expect(messages(newPassword.safeParse('a'.repeat(201)))).toEqual([
      'Use at most 200 characters.',
    ]);
    expect(messages(newPassword.safeParse('a'.repeat(401)))).toEqual([
      'Use at most 200 characters.',
    ]);
  });
});

describe('currentPassword', () => {
  it('only needs to be there: the rules apply when a password is chosen', () => {
    expect(currentPassword.safeParse('short').success).toBe(true);
    expect(messages(currentPassword.safeParse(''))).toEqual(['Enter your password']);
  });
});

describe('withRepeatedPassword', () => {
  const schema = withRepeatedPassword(
    z.object({ password: newPassword, repeatPassword: z.string() }),
    'password',
  );

  it('refuses two different passwords, under the repeated one', () => {
    const result = schema.safeParse({
      password: 'a long enough password',
      repeatPassword: 'a long enough passw0rd',
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ['repeatPassword'], message: 'The passwords do not match' }),
    ]);
    expect(
      schema.safeParse({
        password: 'a long enough password',
        repeatPassword: 'a long enough password',
      }).success,
    ).toBe(true);
  });
});

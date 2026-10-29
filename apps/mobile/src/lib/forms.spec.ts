import { AppError } from './errors';
import { freeText, NUL_REFUSED, showFieldErrors } from './forms';

type Values = { email: string; password: string };

describe('freeText', () => {
  const name = freeText().min(1).max(10);

  it('trims, and keeps every character but NUL as typed', () => {
    expect(name.parse('  Zoë 🌱 ')).toBe('Zoë 🌱');
  });

  it('refuses a NUL, the way the API does, before anything is sent', () => {
    const result = name.safeParse('Zo\u0000ë');
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([NUL_REFUSED]);
  });
});

describe('showFieldErrors', () => {
  it('puts each message of a validation error under its field', () => {
    const setError = jest.fn();
    const error = new AppError('validation', 'HTTP 400', {
      fieldErrors: [
        { path: 'password', message: 'Use at least 15 characters.' },
        { path: 'email', message: 'Invalid email' },
      ],
    });
    expect(showFieldErrors<Values>(error, ['email', 'password'], setError)).toBe(true);
    expect(setError).toHaveBeenCalledWith('password', { message: 'Use at least 15 characters.' });
    expect(setError).toHaveBeenCalledWith('email', { message: 'Invalid email' });
  });

  it('leaves the form-wide message to the caller when no field is the form’s', () => {
    const setError = jest.fn();
    const error = new AppError('validation', 'HTTP 400', {
      fieldErrors: [{ path: 'token', message: 'Invalid' }],
    });
    expect(showFieldErrors<Values>(error, ['email', 'password'], setError)).toBe(false);
    expect(
      showFieldErrors<Values>(new AppError('validation', 'HTTP 400'), ['email'], setError),
    ).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it('ignores errors of any other kind', () => {
    const setError = jest.fn();
    const error = new AppError('conflict', 'HTTP 409', {
      fieldErrors: [{ path: 'email', message: 'Taken' }],
    });
    expect(showFieldErrors<Values>(error, ['email'], setError)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

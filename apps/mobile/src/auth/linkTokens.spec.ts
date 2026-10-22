import { createLinkTokens } from './linkTokens';

let clock = 0;
const tokens = () => createLinkTokens(() => clock);
const TOKEN = 'a'.repeat(43);

beforeEach(() => {
  clock = 0;
});

describe('link tokens', () => {
  it('hands a token to its screen once', () => {
    const store = tokens();
    store.keep('reset-password', TOKEN);
    expect(store.take('reset-password')).toBe(TOKEN);
    expect(store.take('reset-password')).toBeNull();
  });

  it('keeps one token per screen, the newest link winning', () => {
    const store = tokens();
    store.keep('reset-password', TOKEN);
    store.keep('reset-password', 'b'.repeat(43));
    store.keep('accept-invitation', 'c'.repeat(43));
    expect(store.take('confirm-sign-up')).toBeNull();
    expect(store.take('reset-password')).toBe('b'.repeat(43));
    expect(store.take('accept-invitation')).toBe('c'.repeat(43));
  });

  it('forgets a token nobody took within 30 minutes', () => {
    const store = tokens();
    store.keep('confirm-email-change', TOKEN);
    clock = 30 * 60_000 - 1;
    expect(store.take('confirm-email-change')).toBe(TOKEN);

    store.keep('revert-email-change', TOKEN);
    clock += 30 * 60_000;
    expect(store.take('revert-email-change')).toBeNull();
  });
});

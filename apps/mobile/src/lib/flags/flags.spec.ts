import { FLAGS, isEnabled, parseFlagOverrides, resolveFlags } from './index';

describe('feature flags', () => {
  it('parses overrides, ignoring unknown names and bad values', () => {
    expect(parseFlagOverrides('newItemForm=false,unknown=true,newItemForm=maybe')).toEqual({
      newItemForm: false,
    });
    expect(parseFlagOverrides(undefined)).toEqual({});
  });

  it('resolves every flag from its default unless overridden', () => {
    expect(resolveFlags({})).toEqual({ newItemForm: FLAGS.newItemForm.default });
    expect(resolveFlags({ newItemForm: false })).toEqual({ newItemForm: false });
  });

  it('answers for the current build', () => {
    expect(isEnabled('newItemForm')).toBe(true);
  });
});

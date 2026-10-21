import { act, renderHook } from '@testing-library/react-native';

import { routePattern } from './useScreenTracking';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  it('waits for a pause before passing the value on', async () => {
    jest.useFakeTimers();
    const { result, rerender } = await renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, 300),
      {
        initialProps: { value: 'a' },
      },
    );
    await rerender({ value: 'ab' });
    await rerender({ value: 'abc' });
    expect(result.current).toBe('a');
    await act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('abc');
    jest.useRealTimers();
  });
});

describe('routePattern', () => {
  it('keeps the route pattern and drops groups: no ids, no personal data', () => {
    expect(routePattern(['(app)', 'items', '[id]'])).toBe('/items/[id]');
    expect(routePattern(['(app)', '(tabs)'])).toBe('/');
    expect(routePattern([])).toBe('/');
  });
});

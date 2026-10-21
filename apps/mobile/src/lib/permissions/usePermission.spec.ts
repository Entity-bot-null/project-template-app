import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, Linking } from 'react-native';

import { type PermissionSource, toPermissionState, usePermission } from './usePermission';

const response = (granted: boolean, status: string, canAskAgain = true) => ({
  granted,
  status,
  canAskAgain,
});

describe('toPermissionState', () => {
  it('tells undetermined, granted, denied and blocked apart', () => {
    expect(toPermissionState(response(true, 'granted'))).toBe('granted');
    expect(toPermissionState(response(false, 'undetermined'))).toBe('undetermined');
    expect(toPermissionState(response(false, 'denied', true))).toBe('denied');
    expect(toPermissionState(response(false, 'denied', false))).toBe('blocked');
  });
});

describe('usePermission', () => {
  it('checks without asking, asks only when told to, and opens settings', async () => {
    const source: PermissionSource = {
      get: jest.fn(() => Promise.resolve(response(false, 'undetermined'))),
      request: jest.fn(() => Promise.resolve(response(false, 'denied', false))),
    };
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const { result } = await renderHook(() => usePermission(source));
    await waitFor(() => {
      expect(result.current.state).toBe('undetermined');
    });
    expect(source.request).not.toHaveBeenCalled();

    await act(async () => {
      await expect(result.current.request()).resolves.toBe('blocked');
    });
    expect(result.current.state).toBe('blocked');
    await result.current.openSettings();
    expect(openSettings).toHaveBeenCalled();
  });

  it('checks again when the app returns to the foreground', async () => {
    let listener: ((status: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listener = handler as (status: string) => void;
      return { remove: jest.fn() };
    });
    let current = response(false, 'denied', false);
    const get = jest.fn(() => Promise.resolve(current));
    const { result } = await renderHook(() => usePermission({ get, request: jest.fn() }));
    await waitFor(() => {
      expect(result.current.state).toBe('blocked');
    });
    current = response(true, 'granted');
    await act(() => {
      listener?.('active');
    });
    await waitFor(() => {
      expect(result.current.state).toBe('granted');
    });
  });
});

import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { AppError } from '@/lib/errors';
import {
  disabledReporter,
  type ErrorReporter,
  setErrorReporter,
} from '@/lib/observability/errorReporter';

import { connectQueryToDevice, isOnline } from './network';
import { createQueryClient } from './queryClient';

describe('createQueryClient', () => {
  it('retries transient failures twice, never answers like a 404', () => {
    const retry = createQueryClient().getDefaultOptions().queries?.retry as (
      count: number,
      error: unknown,
    ) => boolean;
    expect(retry(0, new AppError('network', ''))).toBe(true);
    expect(retry(1, new AppError('server', '', { status: 503 }))).toBe(true);
    expect(retry(2, new AppError('network', ''))).toBe(false);
    expect(retry(0, new AppError('notFound', ''))).toBe(false);
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('reports unexpected query and mutation failures, not expected ones', async () => {
    const reporter: jest.Mocked<ErrorReporter> = {
      enabled: true,
      capture: jest.fn(),
      addBreadcrumb: jest.fn(),
      setUser: jest.fn(),
    };
    setErrorReporter(reporter);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    await client
      .query({
        queryKey: ['items'],
        queryFn: () => Promise.reject(new AppError('server', 'boom')),
      })
      .catch(() => undefined);
    await client
      .query({
        queryKey: ['me'],
        queryFn: () => Promise.reject(new AppError('network', 'offline')),
      })
      .catch(() => undefined);
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: ['items', 'create'],
        mutationFn: () => Promise.reject(new AppError('unknown', 'bug')),
      })
      .execute(undefined)
      .catch(() => undefined);
    expect(reporter.capture).toHaveBeenCalledTimes(2);
    expect(reporter.capture).toHaveBeenCalledWith(expect.any(AppError), {
      tags: { 'error.kind': 'server', 'query.key': 'items' },
    });
    setErrorReporter(disabledReporter);
  });
});

describe('connectQueryToDevice', () => {
  it('follows the network and the app state', async () => {
    let onNetwork: ((state: Network.NetworkState) => void) | undefined;
    jest.mocked(Network.addNetworkStateListener).mockImplementation((listener) => {
      onNetwork = listener;
      return { remove: jest.fn() };
    });
    let onAppState: ((status: string) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      onAppState = listener as (status: string) => void;
      return { remove };
    });
    const disconnect = connectQueryToDevice();
    const unsubscribe = onlineManager.subscribe(() => undefined);

    onNetwork?.({ isConnected: false, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
    onNetwork?.({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);

    onAppState?.('background');
    expect(focusManager.isFocused()).toBe(false);
    onAppState?.('active');
    expect(focusManager.isFocused()).toBe(true);

    unsubscribe();
    disconnect();
    expect(remove).toHaveBeenCalled();
    await Promise.resolve();
  });

  it('counts a connection without internet as offline', () => {
    expect(isOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
    expect(isOnline({ isConnected: true })).toBe(true);
  });
});

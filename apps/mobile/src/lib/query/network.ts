import { focusManager, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, type AppStateStatus } from 'react-native';

// TanStack Query knows nothing about phones: tell it when the device is
// online and when the app is in the foreground. Queries then pause offline,
// refetch when the connection returns, and refresh stale data when the user
// comes back to the app. Called once at startup (src/app/_layout.tsx).

export function isOnline(state: Network.NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function connectQueryToDevice(): () => void {
  onlineManager.setEventListener((setOnline) => {
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(isOnline(state));
    });
    Network.getNetworkStateAsync()
      .then((state) => {
        setOnline(isOnline(state));
      })
      .catch(() => undefined);
    return () => {
      subscription.remove();
    };
  });

  const onAppStateChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };
  const appState = AppState.addEventListener('change', onAppStateChange);
  return () => {
    appState.remove();
  };
}

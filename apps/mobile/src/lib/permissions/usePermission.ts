import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';

// One way to handle every runtime permission (docs/MOBILE_ARCHITECTURE.md#permissions):
// camera, location, notifications, photos, microphone, contacts. Each Expo
// module exposes get/request functions with the same shape; this hook turns
// them into a state the UI can explain:
//
//   undetermined → show why the app needs it, ask only when the user acts
//   granted      → use the feature
//   denied       → the user said no: ask again only on a new, explicit action
//   blocked      → the system will not ask again: offer the device settings
//
// Never request on launch or without context: the system prompt appears
// once, and a refusal without an explanation is usually permanent.

export type PermissionState = 'checking' | 'undetermined' | 'granted' | 'denied' | 'blocked';

/** The shape shared by expo-notifications, expo-camera, expo-location, expo-image-picker... */
export interface PermissionResponseLike {
  granted: boolean;
  canAskAgain: boolean;
  status: string;
}

export interface PermissionSource {
  get(): Promise<PermissionResponseLike>;
  request(): Promise<PermissionResponseLike>;
}

export function toPermissionState(response: PermissionResponseLike): PermissionState {
  if (response.granted) return 'granted';
  if (response.status === 'undetermined') return 'undetermined';
  return response.canAskAgain ? 'denied' : 'blocked';
}

export function usePermission(source: PermissionSource) {
  const [state, setState] = useState<PermissionState>('checking');

  useEffect(() => {
    let active = true;
    const check = () => {
      source
        .get()
        .then((response) => {
          if (active) setState(toPermissionState(response));
        })
        .catch(() => undefined);
    };
    check();
    // The user may have changed it in the device settings meanwhile.
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [source]);

  const request = useCallback(async () => {
    const next = toPermissionState(await source.request());
    setState(next);
    return next;
  }, [source]);

  const openSettings = useCallback(() => Linking.openSettings(), []);

  return { state, request, openSettings };
}

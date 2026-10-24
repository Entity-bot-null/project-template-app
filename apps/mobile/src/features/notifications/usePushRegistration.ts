import { useEffect } from 'react';

import { session } from '@/auth/session';
import { onPushTokenChange } from '@/lib/notifications';

import { registerForPush, unregisterFromPush } from './api';

/**
 * Keeps this installation registered for push notifications while signed in
 * (mounted in src/app/(app)/_layout.tsx): registers at once (a start or a
 * sign-in), again when another account is adopted here and when the push
 * service replaces the token, and leaves at sign-out before the session ends.
 * Registering needs the permission already granted: it never asks.
 */
export function usePushRegistration(): void {
  useEffect(() => {
    void registerForPush();
    const unsubscribers = [
      session.onSignIn(() => void registerForPush()),
      onPushTokenChange(() => void registerForPush()),
      session.onBeforeSignOut(() => unregisterFromPush()),
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, []);
}

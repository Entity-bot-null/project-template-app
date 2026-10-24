import { z } from 'zod';

// A device's registration for push notifications
// (docs/architecture.md#push-notifications): named in the contract, the app's
// generated types call it DeviceRegistration.

/** An Expo push token: ExponentPushToken[...] (or the newer ExpoPushToken[...]). */
export const EXPO_PUSH_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]$/;

export const DeviceRegistrationSchema = z
  .object({
    /** The push token this installation got from Expo (getExpoPushTokenAsync). */
    pushToken: z.string().regex(EXPO_PUSH_TOKEN, 'Not an Expo push token'),
    platform: z.enum(['ios', 'android']),
    /** The push service the token belongs to: Expo's, the only one the API sends through. */
    kind: z.literal('expo').default('expo'),
  })
  .meta({ id: 'DeviceRegistration' });
export type DeviceRegistrationDto = z.infer<typeof DeviceRegistrationSchema>;

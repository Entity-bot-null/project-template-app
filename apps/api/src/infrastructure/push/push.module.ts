import { Global, Module } from '@nestjs/common';
import { env } from '../../env/env.js';
import { createExpoPushClient } from './expo-push.client.js';
import {
  EXPO_PUSH_URL,
  PUSH_CLIENT,
  PUSH_MAX_ATTEMPTS,
  PUSH_OPTIONS,
  PUSH_TEMPLATES,
} from './push.constants.js';
import { PushOutboxService } from './push-outbox.service.js';
import { PushStore } from './push.store.js';
import { PUSH_TEMPLATE_REGISTRY } from './push.templates.js';
import type { PushOptions } from './push.types.js';
import { PushWorker } from './push-worker.service.js';

/** The settings from the environment. */
export function pushOptionsFromEnv(): PushOptions {
  return {
    enabled: env.PUSH_ENABLED,
    accessToken: env.EXPO_ACCESS_TOKEN,
    baseUrl: EXPO_PUSH_URL,
    maxAttempts: PUSH_MAX_ATTEMPTS,
  };
}

// Always imported: without PUSH_ENABLED the outbox queues nothing, the worker
// never starts and readiness reports push "disabled". Global, so a feature
// module queues notifications without importing anything.
@Global()
@Module({
  providers: [
    { provide: PUSH_OPTIONS, useFactory: pushOptionsFromEnv },
    {
      provide: PUSH_CLIENT,
      inject: [PUSH_OPTIONS],
      useFactory: (options: PushOptions) => createExpoPushClient(options),
    },
    { provide: PUSH_TEMPLATES, useValue: PUSH_TEMPLATE_REGISTRY },
    PushStore,
    PushOutboxService,
    PushWorker,
  ],
  exports: [PushOutboxService, PushWorker],
})
export class PushModule {}

import type { PermissionState } from '@/lib/permissions/usePermission';

import { Button } from './Button';
import { Card } from './Card';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface PermissionPromptProps {
  icon: IconName;
  title: string;
  /** Why the app needs it, in the user's terms: what they get, not what the API needs. */
  rationale: string;
  state: PermissionState;
  onRequest: () => void;
  onOpenSettings: () => void;
}

/**
 * Explains a permission before the system prompt, and offers the device
 * settings once the system will no longer ask (docs/MOBILE_ARCHITECTURE.md#permissions).
 */
export function PermissionPrompt({
  icon,
  title,
  rationale,
  state,
  onRequest,
  onOpenSettings,
}: PermissionPromptProps) {
  if (state === 'checking') return null;
  return (
    <Card>
      <Icon name={icon} size="lg" color="primary" />
      <Text variant="heading">{title}</Text>
      <Text tone="muted">{rationale}</Text>
      {state === 'granted' ? (
        <Text tone="success">Allowed</Text>
      ) : state === 'blocked' ? (
        <Button label="Open settings" variant="secondary" onPress={onOpenSettings} />
      ) : (
        <Button label="Allow" onPress={onRequest} />
      )}
    </Card>
  );
}

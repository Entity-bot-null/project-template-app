import { useState } from 'react';

import { useLinkToken } from '@/auth/linkTokens';
import { useConfirmEmailChange } from '@/features/auth/api';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { AlertText, Button, Screen, Text } from '@/ui';

import { InvalidLink, LinkDone } from './LinkStates';

/**
 * From the link sent to a new address: the user confirms the change (a link
 * never acts by itself). Every session of the account ends.
 */
export function ConfirmEmailChangeScreen() {
  const token = useLinkToken('confirm-email-change');
  const confirm = useConfirmEmailChange();
  const [outcome, setOutcome] = useState<'done' | 'invalid' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(value: string) {
    setFormError(null);
    try {
      await confirm.mutateAsync({ token: value });
      analytics.track('email_change_confirmed', {});
      setOutcome('done');
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'notFound') setOutcome('invalid');
      else if (appError.kind === 'conflict') {
        setFormError('Another account uses this address now: the change cannot be made.');
      } else setFormError(userMessage(appError));
    }
  }

  if (token === null || outcome === 'invalid') return <InvalidLink />;
  if (outcome === 'done') {
    return (
      <LinkDone
        testID="confirm-email-change-done"
        title="Email address changed"
        description="Sign in again with your new address: every device that was signed in to your account has been signed out."
      />
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="confirm-email-change-screen">
      <Text tone="muted">
        Confirm this address as the new one of your account. Your previous address gets a notice
        with a way to undo the change.
      </Text>
      {formError !== null && <AlertText tone="danger">{formError}</AlertText>}
      <Button
        label="Confirm the new address"
        testID="confirm-email-change-submit"
        loading={confirm.isPending}
        onPress={() => void submit(token)}
      />
    </Screen>
  );
}

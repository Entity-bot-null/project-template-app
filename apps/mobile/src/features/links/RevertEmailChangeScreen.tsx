import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useLinkToken } from '@/auth/linkTokens';
import { newPassword, PASSWORD_HINT, withRepeatedPassword } from '@/auth/passwords';
import { useRevertEmailChange } from '@/features/auth/api';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, Screen, Text, TextField } from '@/ui';

import { InvalidLink, LinkDone } from './LinkStates';

export const RevertEmailChangeSchema = withRepeatedPassword(
  z.object({ password: newPassword, repeatPassword: z.string() }),
  'password',
);

type RevertEmailChangeValues = z.input<typeof RevertEmailChangeSchema>;

/**
 * From the notice sent to the previous address: undoes a change of email the
 * owner did not make, with a new password (whoever changed it may know the
 * current one). Every session of the account ends.
 */
export function RevertEmailChangeScreen() {
  const token = useLinkToken('revert-email-change');
  const revert = useRevertEmailChange();
  const [outcome, setOutcome] = useState<'done' | 'invalid' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<RevertEmailChangeValues, unknown, z.output<typeof RevertEmailChangeSchema>>({
    resolver: zodResolver(RevertEmailChangeSchema),
    defaultValues: { password: '', repeatPassword: '' },
  });

  const submit = handleSubmit(async ({ password }) => {
    if (token === null) return;
    setFormError(null);
    try {
      await revert.mutateAsync({ token, password });
      analytics.track('email_change_reverted', {});
      setOutcome('done');
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'notFound') setOutcome('invalid');
      else if (appError.kind === 'conflict') {
        setFormError(
          'Another account uses your previous address now: the change cannot be undone.',
        );
      } else if (!showFieldErrors(appError, ['password'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  if (token === null || outcome === 'invalid') return <InvalidLink />;
  if (outcome === 'done') {
    return (
      <LinkDone
        testID="revert-email-change-done"
        title="Your previous address is back"
        description="Sign in with it and your new password: every device that was signed in to your account has been signed out."
      />
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="revert-email-change-screen">
      <Text tone="muted">
        This brings back the previous address of your account. Choose a new password too: whoever
        changed the address may know the current one.
      </Text>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="New password"
            hint={PASSWORD_HINT}
            testID="revert-email-change-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              setFocus('repeatPassword');
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="repeatPassword"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Repeat the new password"
            testID="revert-email-change-repeat"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.repeatPassword?.message}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      {formError !== null && <AlertText tone="danger">{formError}</AlertText>}
      <Button
        label="Undo the change"
        testID="revert-email-change-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

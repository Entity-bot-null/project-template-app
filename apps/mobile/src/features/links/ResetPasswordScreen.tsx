import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useLinkToken } from '@/auth/linkTokens';
import { newPassword, PASSWORD_HINT, withRepeatedPassword } from '@/auth/passwords';
import { useResetPassword } from '@/features/auth/api';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, Screen, Text, TextField } from '@/ui';

import { InvalidLink, LinkDone } from './LinkStates';

export const ResetPasswordSchema = withRepeatedPassword(
  z.object({ password: newPassword, repeatPassword: z.string() }),
  'password',
);

type ResetPasswordValues = z.input<typeof ResetPasswordSchema>;

/** From a password reset link: a new password; every session of the account ends. */
export function ResetPasswordScreen() {
  const token = useLinkToken('reset-password');
  const reset = useResetPassword();
  const [outcome, setOutcome] = useState<'done' | 'invalid' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues, unknown, z.output<typeof ResetPasswordSchema>>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { password: '', repeatPassword: '' },
  });

  const submit = handleSubmit(async ({ password }) => {
    if (token === null) return;
    setFormError(null);
    try {
      await reset.mutateAsync({ token, password });
      analytics.track('password_reset', {});
      setOutcome('done');
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'notFound') setOutcome('invalid');
      // A refused password leaves the link usable: the user tries another.
      else if (!showFieldErrors(appError, ['password'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  if (token === null || outcome === 'invalid') return <InvalidLink requestNew />;
  if (outcome === 'done') {
    return (
      <LinkDone
        testID="reset-password-done"
        title="Password changed"
        description="Sign in with your new password. Every device that was signed in to your account has been signed out."
      />
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="reset-password-screen">
      <Text tone="muted">Choose a new password for your account.</Text>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="New password"
            hint={PASSWORD_HINT}
            testID="reset-password-password"
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
            testID="reset-password-repeat"
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
        label="Change password"
        testID="reset-password-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

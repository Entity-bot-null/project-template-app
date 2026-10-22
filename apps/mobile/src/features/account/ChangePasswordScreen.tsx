import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  currentPassword,
  newPassword,
  PASSWORD_HINT,
  withRepeatedPassword,
} from '@/auth/passwords';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, EmptyState, Screen, TextField } from '@/ui';

import { useChangePassword } from './api';

export const ChangePasswordSchema = withRepeatedPassword(
  z.object({
    currentPassword,
    newPassword,
    repeatPassword: z.string(),
  }),
  'newPassword',
);

type ChangePasswordValues = z.input<typeof ChangePasswordSchema>;

/**
 * Changes the password. Every session of the account ends; this phone
 * carries on with the session the API answers (src/auth/session.ts adopt()).
 * Its route passes `onDone`, which leaves the screen.
 */
export function ChangePasswordScreen({ onDone }: { onDone: () => void }) {
  const changePassword = useChangePassword();
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordValues, unknown, z.output<typeof ChangePasswordSchema>>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', repeatPassword: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await changePassword.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      analytics.track('password_changed', {});
      setDone(true);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'forbidden') {
        setError('currentPassword', { message: 'The current password is wrong.' });
      } else if (!showFieldErrors(appError, ['currentPassword', 'newPassword'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  if (done) {
    return (
      <Screen edges={['bottom', 'left', 'right']} testID="change-password-done">
        <EmptyState
          title="Password changed"
          icon="checkmark-circle-outline"
          description="Every other device that was signed in to your account has been signed out."
          announce
          action={{ label: 'Done', onPress: onDone }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="change-password-screen">
      <Controller
        control={control}
        name="currentPassword"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Current password"
            testID="change-password-current"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.currentPassword?.message}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              setFocus('newPassword');
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="newPassword"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="New password"
            hint={PASSWORD_HINT}
            testID="change-password-new"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.newPassword?.message}
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
            testID="change-password-repeat"
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
        testID="change-password-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

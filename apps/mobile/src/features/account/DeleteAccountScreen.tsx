import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert } from 'react-native';
import { z } from 'zod';

import { currentPassword } from '@/auth/passwords';
import { useSessionUser } from '@/auth/session';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, Card, Screen, Text, TextField } from '@/ui';

import { useDeleteAccount } from './api';

// Account deletion from inside the app, as both stores require
// (docs/store-compliance.md): what it means, the password, and a destructive
// confirmation. The API deletes the account and everything it owns at once;
// this phone then ends its session as a sign-out does, and the navigation
// leaves for sign-in (src/app/_layout.tsx).

export const DeleteAccountSchema = z.object({ password: currentPassword });

type DeleteAccountValues = z.input<typeof DeleteAccountSchema>;

function confirmDeletion(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Delete your account?',
      'Your account and everything in it are deleted for good. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            resolve(false);
          },
        },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: () => {
            resolve(true);
          },
        },
      ],
      {
        cancelable: true,
        onDismiss: () => {
          resolve(false);
        },
      },
    );
  });
}

export function DeleteAccountScreen() {
  const deleteAccount = useDeleteAccount();
  const isAdmin = useSessionUser()?.role === 'admin';
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DeleteAccountValues, unknown, z.output<typeof DeleteAccountSchema>>({
    resolver: zodResolver(DeleteAccountSchema),
    defaultValues: { password: '' },
  });

  const submit = handleSubmit(async ({ password }) => {
    setFormError(null);
    if (!(await confirmDeletion())) return;
    try {
      await deleteAccount.mutateAsync({ password });
      // Anonymous by now: the sign-out reset the analytics identity.
      analytics.track('account_deleted', {});
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'forbidden') {
        setError('password', { message: 'The password is wrong.' });
      } else if (appError.kind === 'conflict' && isAdmin) {
        setFormError(
          'You are the only administrator. Make another account an administrator before deleting yours.',
        );
      } else if (!showFieldErrors(appError, ['password'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="delete-account-screen">
      <Card>
        <Text variant="heading">This deletes your account for good</Text>
        <Text tone="muted">
          Your profile and everything you created are deleted at once and cannot be recovered. Every
          device signed in to your account is signed out, and we send a notice to your email
          address.
        </Text>
      </Card>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Password"
            hint="Your password confirms that it is you."
            testID="delete-account-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
          />
        )}
      />
      {formError !== null && <AlertText tone="danger">{formError}</AlertText>}
      <Button
        label="Delete account"
        variant="danger"
        testID="delete-account-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

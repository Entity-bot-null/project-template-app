import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { currentPassword } from '@/auth/passwords';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, EmptyState, Screen, Text, TextField } from '@/ui';

import { useChangeEmail } from './api';

export const ChangeEmailSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .min(1, 'Enter the new address')
    .max(254, 'At most 254 characters')
    .pipe(z.email('Enter a valid email address')),
  currentPassword,
});

type ChangeEmailValues = z.input<typeof ChangeEmailSchema>;

/**
 * Asks to change the email address: a link goes to the new one, and the
 * address changes once it is opened (src/features/links/ConfirmEmailChangeScreen.tsx).
 */
export function ChangeEmailScreen({ onDone }: { onDone: () => void }) {
  const changeEmail = useChangeEmail();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<ChangeEmailValues, unknown, z.output<typeof ChangeEmailSchema>>({
    resolver: zodResolver(ChangeEmailSchema),
    defaultValues: { newEmail: '', currentPassword: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    const newEmail = values.newEmail.toLowerCase();
    try {
      await changeEmail.mutateAsync({ newEmail, currentPassword: values.currentPassword });
      analytics.track('email_change_requested', {});
      setSentTo(newEmail);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'forbidden') {
        setError('currentPassword', { message: 'The current password is wrong.' });
      } else if (!showFieldErrors(appError, ['newEmail', 'currentPassword'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  if (sentTo !== null) {
    return (
      <Screen edges={['bottom', 'left', 'right']} testID="change-email-sent">
        <EmptyState
          title="Check your new address"
          icon="mail-unread-outline"
          description={`We sent a link to ${sentTo}. Your address changes once you open it, within 24 hours; until then, keep signing in with the current one.`}
          announce
          action={{ label: 'Done', onPress: onDone }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="change-email-screen">
      <Text tone="muted">
        We will send a link to the new address to confirm it. Your current password confirms that it
        is you.
      </Text>
      <Controller
        control={control}
        name="newEmail"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="New email"
            testID="change-email-new"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.newEmail?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              setFocus('currentPassword');
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="currentPassword"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Current password"
            testID="change-email-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.currentPassword?.message}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      {formError !== null && <AlertText tone="danger">{formError}</AlertText>}
      <Button
        label="Send the link"
        testID="change-email-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

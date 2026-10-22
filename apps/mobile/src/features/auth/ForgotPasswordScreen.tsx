import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, EmptyState, Screen, Text, TextField } from '@/ui';

import { useRequestPasswordReset } from './api';

// Password recovery asks for a link (valid 30 minutes) that opens
// src/features/links/ResetPasswordScreen.tsx. The answer is the same whether
// the address has an account, so this screen never tells who is registered.

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .max(254, 'At most 254 characters')
    .pipe(z.email('Enter a valid email address')),
});

type ForgotPasswordValues = z.input<typeof ForgotPasswordSchema>;

export function ForgotPasswordScreen() {
  const requestReset = useRequestPasswordReset();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues, unknown, z.output<typeof ForgotPasswordSchema>>({
    resolver: zodResolver(ForgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async ({ email }) => {
    setFormError(null);
    const address = email.toLowerCase();
    try {
      await requestReset.mutateAsync({ email: address });
      analytics.track('password_reset_requested', {});
      setSentTo(address);
    } catch (error) {
      const appError = toAppError(error);
      if (!showFieldErrors(appError, ['email'], setError)) setFormError(userMessage(appError));
    }
  });

  if (sentTo !== null) {
    return (
      <Screen edges={['bottom', 'left', 'right']} testID="forgot-password-sent">
        <EmptyState
          title="Check your email"
          icon="mail-unread-outline"
          description={`If ${sentTo} has an account, it got a link to choose a new password. Open it on this phone within 30 minutes.`}
          announce
          action={{
            label: 'Back to sign in',
            onPress: () => {
              router.back();
            },
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="forgot-password-screen">
      <Text tone="muted">
        Enter the address of your account: we will email it a link to choose a new password.
      </Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Email"
            testID="forgot-password-email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      {formError !== null && <AlertText tone="danger">{formError}</AlertText>}
      <Button
        label="Send the link"
        testID="forgot-password-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

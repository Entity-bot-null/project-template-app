import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useLinkToken } from '@/auth/linkTokens';
import { currentPassword } from '@/auth/passwords';
import type { User } from '@/auth/schemas';
import { useConfirmSignUp } from '@/features/auth/api';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, Screen, Text, TextField } from '@/ui';

import { InvalidLink, LinkDone, SignedInNotice } from './LinkStates';

export const ConfirmSignUpSchema = z.object({ password: currentPassword });

type ConfirmSignUpValues = z.input<typeof ConfirmSignUpSchema>;

/**
 * From a sign-up link: the password chosen at sign-up proves the link was
 * opened by whoever signed up. The account is created and signed in.
 */
export function ConfirmSignUpScreen() {
  const token = useLinkToken('confirm-sign-up');
  const confirm = useConfirmSignUp();
  const [created, setCreated] = useState<User | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ConfirmSignUpValues, unknown, z.output<typeof ConfirmSignUpSchema>>({
    resolver: zodResolver(ConfirmSignUpSchema),
    defaultValues: { password: '' },
  });

  const submit = handleSubmit(async ({ password }) => {
    if (token === null) return;
    setFormError(null);
    try {
      const user = await confirm.mutateAsync({ token, password });
      analytics.track('sign_up_confirmed', {});
      setCreated(user);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'notFound') {
        setInvalid(true);
      } else if (appError.kind === 'unauthenticated') {
        // A few wrong ones drop the sign-up: the link then answers 404.
        setError('password', { message: 'This is not the password you chose when signing up.' });
      } else if (appError.kind === 'conflict') {
        setFormError('This address has an account already: sign in with it.');
      } else if (appError.kind === 'forbidden') {
        setFormError('This server does not take new accounts any more.');
      } else if (!showFieldErrors(appError, ['password'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  if (token === null || invalid) return <InvalidLink />;
  if (created !== null) {
    return (
      <LinkDone
        testID="confirm-sign-up-done"
        title="Your account is ready"
        description={`Welcome, ${created.name}. You are signed in.`}
      />
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="confirm-sign-up-screen">
      <SignedInNotice />
      <Text tone="muted">Enter the password you chose when signing up to create your account.</Text>
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Password"
            testID="confirm-sign-up-password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      {formError !== null && <AlertText tone="danger">{formError}</AlertText>}
      <Button
        label="Create account"
        testID="confirm-sign-up-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

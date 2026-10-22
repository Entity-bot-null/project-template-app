import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { session, useSessionStore } from '@/auth/session';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, Card, Screen, Text, TextField } from '@/ui';

import { useCapabilities } from './api';

// A form the template's way (docs/mobile-architecture.md#forms): React Hook Form
// with a Zod schema, errors under each field and announced, the keyboard
// moving from field to field, one submission at a time, and server errors
// mapped to the field or to a message the user understands.

export const SignInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter your email address')
    .pipe(z.email('Enter a valid email address')),
  password: z.string().min(1, 'Enter your password').max(256, 'At most 256 characters'),
});

type SignInValues = z.input<typeof SignInSchema>;

export function SignInScreen() {
  const endedBy = useSessionStore((state) => state.endedBy);
  // Offered only once the server says it offers them (not while unknown).
  const capabilities = useCapabilities().data;
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues, unknown, z.output<typeof SignInSchema>>({
    resolver: zodResolver(SignInSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      await session.signIn({ email: email.toLowerCase(), password });
      analytics.track('sign_in', { method: 'password' });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'unauthenticated') {
        // One message for an unknown email and a wrong password.
        setFormError('Wrong email or password.');
      } else if (!showFieldErrors(appError, ['email', 'password'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  return (
    <Screen scroll testID="sign-in-screen">
      <Text variant="title">Sign in</Text>
      {endedBy === 'expired' && (
        <Card>
          <AlertText>Your session has ended. Sign in again to continue.</AlertText>
        </Card>
      )}
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Email"
            testID="sign-in-email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              setFocus('password');
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Password"
            testID="sign-in-password"
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
        label="Sign in"
        testID="sign-in-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
      {capabilities?.passwordReset === true && (
        <Button
          label="Forgot your password?"
          variant="ghost"
          testID="sign-in-forgot-password"
          onPress={() => {
            router.push('/forgot-password');
          }}
        />
      )}
      {capabilities?.signUp === true && (
        <Button
          label="Create an account"
          variant="secondary"
          testID="sign-in-sign-up"
          onPress={() => {
            router.push('/sign-up');
          }}
        />
      )}
    </Screen>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { newPassword, PASSWORD_HINT, withRepeatedPassword } from '@/auth/passwords';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, EmptyState, Screen, TextField } from '@/ui';

import { useSignUp } from './api';

// Signing up asks for a link: the account exists once the link is opened on
// this phone (src/features/links/ConfirmSignUpScreen.tsx). The answer is the
// same whether the address already has an account (its owner gets a notice
// instead), so this screen never tells who is registered.

export const SignUpSchema = withRepeatedPassword(
  z.object({
    name: z.string().trim().min(1, 'Enter your name').max(100, 'At most 100 characters'),
    email: z
      .string()
      .trim()
      .min(1, 'Enter your email address')
      .max(254, 'At most 254 characters')
      .pipe(z.email('Enter a valid email address')),
    password: newPassword,
    repeatPassword: z.string(),
  }),
  'password',
);

type SignUpValues = z.input<typeof SignUpSchema>;

export function SignUpScreen() {
  const signUp = useSignUp();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues, unknown, z.output<typeof SignUpSchema>>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: { name: '', email: '', password: '', repeatPassword: '' },
  });

  const submit = handleSubmit(async ({ name, email, password }) => {
    setFormError(null);
    const address = email.toLowerCase();
    try {
      await signUp.mutateAsync({ name, email: address, password });
      analytics.track('sign_up_requested', {});
      setSentTo(address);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'forbidden') {
        setFormError(
          'This server does not take new accounts. Ask its administrator for an invitation.',
        );
      } else if (!showFieldErrors(appError, ['name', 'email', 'password'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  if (sentTo !== null) {
    return (
      <Screen edges={['bottom', 'left', 'right']} testID="sign-up-sent">
        <EmptyState
          title="Check your email"
          icon="mail-unread-outline"
          description={`If ${sentTo} can be used, it got a link to confirm your account. Open it on this phone within 24 hours.`}
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
    <Screen scroll edges={['bottom', 'left', 'right']} testID="sign-up-screen">
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Name"
            testID="sign-up-name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.name?.message}
            maxLength={100}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              setFocus('email');
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Email"
            testID="sign-up-email"
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
            hint={PASSWORD_HINT}
            testID="sign-up-password"
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
            label="Repeat the password"
            testID="sign-up-repeat-password"
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
        label="Create account"
        testID="sign-up-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { useLinkToken } from '@/auth/linkTokens';
import { newPassword, PASSWORD_HINT, withRepeatedPassword } from '@/auth/passwords';
import type { User } from '@/auth/schemas';
import { useAcceptInvitation } from '@/features/auth/api';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { freeText, showFieldErrors } from '@/lib/forms';
import { AlertText, Button, Screen, Text, TextField } from '@/ui';

import { InvalidLink, LinkDone, SignedInNotice } from './LinkStates';

export const AcceptInvitationSchema = withRepeatedPassword(
  z.object({
    name: freeText().min(1, 'Enter your name').max(100, 'At most 100 characters'),
    password: newPassword,
    repeatPassword: z.string(),
  }),
  'password',
);

type AcceptInvitationValues = z.input<typeof AcceptInvitationSchema>;

/**
 * From an invitation link: a name and a password create the account, with
 * the role it was invited with, and sign it in.
 */
export function AcceptInvitationScreen() {
  const token = useLinkToken('accept-invitation');
  const accept = useAcceptInvitation();
  const [created, setCreated] = useState<User | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvitationValues, unknown, z.output<typeof AcceptInvitationSchema>>({
    resolver: zodResolver(AcceptInvitationSchema),
    defaultValues: { name: '', password: '', repeatPassword: '' },
  });

  const submit = handleSubmit(async ({ name, password }) => {
    if (token === null) return;
    setFormError(null);
    try {
      const user = await accept.mutateAsync({ token, name, password });
      analytics.track('invitation_accepted', {});
      setCreated(user);
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'notFound') {
        setInvalid(true);
      } else if (appError.kind === 'conflict') {
        setFormError('This address has an account already: sign in with it.');
      } else if (!showFieldErrors(appError, ['name', 'password'], setError)) {
        setFormError(userMessage(appError));
      }
    }
  });

  if (token === null || invalid) return <InvalidLink />;
  if (created !== null) {
    return (
      <LinkDone
        testID="accept-invitation-done"
        title="Your account is ready"
        description={`Welcome, ${created.name}. You are signed in.`}
      />
    );
  }

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="accept-invitation-screen">
      <SignedInNotice />
      <Text tone="muted">
        You were invited to create an account. Choose your name and a password.
      </Text>
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Name"
            testID="accept-invitation-name"
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
            testID="accept-invitation-password"
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
            testID="accept-invitation-repeat"
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
        testID="accept-invitation-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

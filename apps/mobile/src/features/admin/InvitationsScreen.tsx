import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, View } from 'react-native';
import { z } from 'zod';

import { useCapabilities } from '@/features/auth/api';
import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { showFieldErrors } from '@/lib/forms';
import { AlertText, Button, Card, createStyles, Text, TextField, useTheme } from '@/ui';

import { type Invitation, useInvitations, useInvite, useRevokeInvitation } from './api';
import { PagedList } from './PagedList';
import { type Role, ROLE_LABELS, ROLES } from './roles';

// Invitations (admins only): an address and a role get a one-time link
// (valid 7 days) to create an account (src/features/links/AcceptInvitationScreen.tsx).
// Inviting an address again replaces its invitation; revoking one stops its
// link at once. A server that sends no email offers no invitations.

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const useStyles = createStyles((theme) => ({
  form: { gap: theme.spacing.md, marginBottom: theme.spacing.lg },
  segments: { flexDirection: 'row', gap: theme.spacing.sm },
  segment: {
    flex: 1,
    minHeight: theme.sizes.touchTarget,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export const InviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Enter an email address')
    .max(254, 'At most 254 characters')
    .pipe(z.email('Enter a valid email address')),
  role: z.enum(['member', 'admin']),
});

type InviteValues = z.input<typeof InviteSchema>;

export function InvitationsScreen() {
  const query = useInvitations();
  const capabilities = useCapabilities();
  return (
    <PagedList
      testID="invitations-list"
      query={query}
      noun="invitations"
      empty={{
        title: 'No pending invitations',
        description: 'Invitations wait here until they are accepted, revoked or expire.',
      }}
      header={
        capabilities.data?.invitations === false ? (
          <Card>
            <AlertText tone="muted">
              This server sends no email, so it cannot send invitations.
            </AlertText>
          </Card>
        ) : (
          <InviteForm />
        )
      }
      renderRow={(invitation) => <InvitationRow invitation={invitation} />}
    />
  );
}

function InviteForm() {
  const styles = useStyles();
  const invite = useInvite();
  const [outcome, setOutcome] = useState<{ tone: 'success' | 'danger'; message: string } | null>(
    null,
  );
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteValues, unknown, z.output<typeof InviteSchema>>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: '', role: 'member' },
  });

  const submit = handleSubmit(async ({ email, role }) => {
    setOutcome(null);
    const address = email.toLowerCase();
    try {
      await invite.mutateAsync({ email: address, role });
      analytics.track('invitation_sent', { role });
      reset();
      setOutcome({ tone: 'success', message: `Invitation sent to ${address}.` });
    } catch (error) {
      const appError = toAppError(error);
      if (appError.kind === 'conflict') {
        setError('email', { message: 'This address has an account already.' });
      } else if (appError.kind === 'rateLimited') {
        setOutcome({
          tone: 'danger',
          message: 'This address got a message moments ago. Invite it again later.',
        });
      } else if (!showFieldErrors(appError, ['email', 'role'], setError)) {
        setOutcome({ tone: 'danger', message: userMessage(appError) });
      }
    }
  });

  return (
    <Card style={styles.form}>
      <Text variant="heading">Invite someone</Text>
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Email"
            testID="invite-email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="done"
          />
        )}
      />
      <Controller
        control={control}
        name="role"
        render={({ field }) => <RoleChoice value={field.value} onChange={field.onChange} />}
      />
      {outcome !== null && <AlertText tone={outcome.tone}>{outcome.message}</AlertText>}
      <Button
        label="Send invitation"
        testID="invite-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Card>
  );
}

function RoleChoice({ value, onChange }: { value: Role; onChange: (role: Role) => void }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.segments} accessibilityRole="radiogroup" accessibilityLabel="Role">
      {ROLES.map((role) => {
        const selected = role === value;
        return (
          <Pressable
            key={role}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={ROLE_LABELS[role]}
            testID={`invite-role-${role}`}
            onPress={() => {
              onChange(role);
            }}
            style={[
              styles.segment,
              {
                borderColor: selected ? theme.colors.primary : theme.colors.border,
                backgroundColor: selected ? theme.colors.surfaceMuted : 'transparent',
              },
            ]}
          >
            <Text variant="label" tone={selected ? 'primary' : 'default'}>
              {ROLE_LABELS[role]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const revoke = useRevokeInvitation();
  const [failure, setFailure] = useState<string | null>(null);
  const expires =
    invitation.expiresAt === null ? null : dateFormat.format(new Date(invitation.expiresAt));
  const details = [
    ROLE_LABELS[invitation.role],
    invitation.invitedBy && `invited by ${invitation.invitedBy.name}`,
    expires && `expires ${expires}`,
  ]
    .filter((part): part is string => typeof part === 'string')
    .join(' · ');

  return (
    <Card testID={`invitation-${invitation.id}`}>
      <Text variant="heading">{invitation.email}</Text>
      <Text variant="caption" tone="muted">
        {details}
      </Text>
      {failure !== null && <AlertText tone="danger">{failure}</AlertText>}
      <Button
        label="Revoke"
        variant="secondary"
        accessibilityLabel={`Revoke the invitation of ${invitation.email}`}
        loading={revoke.isPending}
        onPress={() => {
          Alert.alert('Revoke this invitation?', `Its link to ${invitation.email} stops working.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Revoke',
              style: 'destructive',
              onPress: () => {
                setFailure(null);
                revoke.mutate(invitation.id, {
                  onSuccess: () => {
                    analytics.track('invitation_revoked', {});
                  },
                  onError: (error) => {
                    // Already gone (accepted, revoked elsewhere): the refetch removes it.
                    if (toAppError(error).kind !== 'notFound') setFailure(userMessage(error));
                  },
                });
              },
            },
          ]);
        }}
      />
    </Card>
  );
}

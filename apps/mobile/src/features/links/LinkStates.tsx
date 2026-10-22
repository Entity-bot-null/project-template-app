import { router } from 'expo-router';

import { useSessionStore, useSessionUser } from '@/auth/session';
import { AlertText, Card, EmptyState, Screen } from '@/ui';

// What the screens of emailed links share (src/lib/links.ts): they open with
// or without a session, take the link's token once (src/auth/linkTokens.ts),
// ask the user to confirm or to choose a password (a link never acts by
// itself), and then lead on with a button: to the app when signed in, to
// sign-in otherwise.

/** Leaves a link's screen for the app, or for sign-in when signed out. */
export function continueFromLink(): void {
  router.replace(useSessionStore.getState().status === 'signedIn' ? '/' : '/sign-in');
}

/**
 * A link that cannot be used: opened without its token, kept too long, or
 * refused by the server (used, replaced or expired).
 */
export function InvalidLink({ requestNew }: { requestNew?: boolean }) {
  return (
    <Screen edges={['bottom', 'left', 'right']} testID="link-invalid">
      <EmptyState
        title="This link cannot be used"
        icon="unlink-outline"
        description={
          requestNew
            ? 'It has expired, was already used, or a newer one replaced it. Ask for a new link.'
            : 'It has expired, was already used, or a newer one replaced it.'
        }
        announce
        action={
          requestNew
            ? {
                label: 'Ask for a new link',
                onPress: () => {
                  router.replace('/forgot-password');
                },
              }
            : { label: 'Continue', onPress: continueFromLink }
        }
      />
    </Screen>
  );
}

/** What a link did, said once it is done, and the way on. */
export function LinkDone({
  title,
  description,
  testID,
}: {
  title: string;
  description: string;
  testID: string;
}) {
  return (
    <Screen edges={['bottom', 'left', 'right']} testID={testID}>
      <EmptyState
        title={title}
        icon="checkmark-circle-outline"
        description={description}
        announce
        action={{ label: 'Continue', onPress: continueFromLink }}
      />
    </Screen>
  );
}

/**
 * On a link that signs into a new account (a sign-up, an invitation) while
 * another account is signed in here: continuing signs that one out.
 */
export function SignedInNotice() {
  const user = useSessionUser();
  const signedIn = useSessionStore((state) => state.status === 'signedIn');
  if (!signedIn) return null;
  return (
    <Card>
      <AlertText>
        {user === null
          ? 'Another account is signed in on this phone: continuing signs it out.'
          : `You are signed in as ${user.email}: continuing signs that account out.`}
      </AlertText>
    </Card>
  );
}

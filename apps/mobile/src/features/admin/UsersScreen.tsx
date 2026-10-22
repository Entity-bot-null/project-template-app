import { Card, Text } from '@/ui';

import { type AccountUser, useUsers } from './api';
import { PagedList } from './PagedList';
import { ROLE_LABELS } from './roles';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

/** Every account, newest first (admins only). */
export function UsersScreen() {
  const query = useUsers();
  return (
    <PagedList
      testID="users-list"
      query={query}
      noun="users"
      empty={{ title: 'No users', description: 'Accounts appear here once they are created.' }}
      renderRow={(user) => <UserRow user={user} />}
    />
  );
}

// One accessible element per row, read whole.
function UserRow({ user }: { user: AccountUser }) {
  const joined = dateFormat.format(new Date(user.createdAt));
  return (
    <Card
      testID={`user-${user.id}`}
      accessible
      accessibilityLabel={`${user.name}, ${user.email}, ${ROLE_LABELS[user.role]}, joined ${joined}`}
    >
      <Text variant="heading">{user.name}</Text>
      <Text tone="muted">{user.email}</Text>
      <Text variant="caption" tone="muted">
        {ROLE_LABELS[user.role]} · Joined {joined}
      </Text>
    </Card>
  );
}

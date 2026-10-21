import { toAppError } from '@/lib/errors';
import { EmptyState, ErrorState, LoadingState, Screen, Text } from '@/ui';

import { useItem } from './api';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** One item: also the target of item links (templateapp://items/42). */
export function ItemDetailScreen({ id }: { id: string }) {
  const query = useItem(id);

  if (query.isPending) return <LoadingState label="Loading item" />;
  if (query.isError) {
    return toAppError(query.error).kind === 'notFound' ? (
      <EmptyState
        title="Item not found"
        description="It may have been deleted."
        icon="help-circle-outline"
      />
    ) : (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  const item = query.data;
  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="item-detail-screen">
      <Text variant="title">{item.title}</Text>
      <Text variant="caption" tone="muted">
        Created {dateFormat.format(new Date(item.createdAt))}
      </Text>
      {item.description !== undefined && <Text>{item.description}</Text>}
    </Screen>
  );
}

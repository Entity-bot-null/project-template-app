import { useLocalSearchParams } from 'expo-router';

import { ItemDetailScreen } from '@/features/items/ItemDetailScreen';
import { EmptyState } from '@/ui';

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export default function ItemRoute() {
  // Route parameters are input like any other: validated before use.
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!ID.test(id)) return <EmptyState title="Item not found" icon="help-circle-outline" />;
  return <ItemDetailScreen id={id} />;
}

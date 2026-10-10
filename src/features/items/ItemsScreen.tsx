import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, View } from 'react-native';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { isEnabled } from '@/lib/flags';
import {
  AlertText,
  Button,
  Card,
  createStyles,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
  TextField,
  useTheme,
} from '@/ui';

import { isOptimistic, type Item, useItems } from './api';

// A paginated, searchable list (docs/PERFORMANCE.md#lists): virtualized
// (FlatList renders what is on screen, plus a window), next page fetched as
// the end nears, one request per pause in typing, pull to refresh, and the
// loading, empty and error states. Switch to FlashList when rows get heavy
// or lists reach thousands of rows. A search changes the screen without
// navigating, so its outcome is announced (docs/ACCESSIBILITY.md#announcements).

/** How many items a settled search found, as said to the user. */
function foundMessage(total: number): string {
  return total === 1 ? '1 item found' : `${total} items found`;
}

const useStyles = createStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: theme.spacing.lg, gap: theme.spacing.md },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  footer: { paddingVertical: theme.spacing.lg },
}));

export function ItemsScreen() {
  const styles = useStyles();
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search.trim());
  const query = useItems(term);
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  // The results of `term`, not the previous ones kept on screen while it loads.
  const found =
    term !== '' && query.isSuccess && !query.isPlaceholderData
      ? query.data.pages[0]?.total
      : undefined;

  const header = (
    <View style={styles.header}>
      <TextField
        label="Search"
        testID="items-search"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by title"
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      {found !== undefined && found > 0 && (
        <AlertText variant="caption" tone="muted">
          {foundMessage(found)}
        </AlertText>
      )}
      {isEnabled('newItemForm') && (
        <Button
          label="New item"
          icon="add"
          testID="items-new"
          onPress={() => {
            router.push('/new-item');
          }}
        />
      )}
    </View>
  );

  // One tree whatever the state: the states render inside the list, so the
  // search field in its header keeps focus and keyboard while results load.
  let placeholder;
  if (query.isPending) {
    placeholder = <LoadingState label="Loading items" />;
  } else if (query.isError) {
    placeholder = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else if (search.trim() === '') {
    placeholder = <EmptyState title="No items yet" description="Items you create appear here." />;
  } else {
    placeholder = (
      <EmptyState
        title="No results"
        description="Nothing matches your search."
        icon="search-outline"
        announce
      />
    );
  }

  return (
    <FlatList
      style={styles.root}
      testID="items-list"
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ItemRow item={item} />}
      ListHeaderComponent={header}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      // A new search loading behind the previous results is not a refresh.
      refreshing={query.isRefetching && !query.isFetchingNextPage && !query.isPlaceholderData}
      onRefresh={() => void query.refetch()}
      removeClippedSubviews={Platform.OS === 'android'}
      ListEmptyComponent={placeholder}
      ListFooterComponent={query.isFetchingNextPage ? <NextPageSpinner /> : null}
    />
  );
}

function NextPageSpinner() {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View
      style={styles.footer}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel="Loading more items"
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

// One accessible element per row, read whole (title, description, state):
// the label replaces what its texts would say one by one. The title wraps at
// any font size; the description is a preview, complete in the label and on
// the item's screen.
function ItemRow({ item }: { item: Item }) {
  const pending = isOptimistic(item);
  const label = [item.title, item.description, pending && 'saving']
    .filter((part) => typeof part === 'string' && part !== '')
    .join(', ');
  return (
    <Card
      testID={`item-${item.id}`}
      accessible
      accessibilityLabel={label}
      {...(!pending && {
        onPress: () => {
          router.push({ pathname: '/items/[id]', params: { id: item.id } });
        },
      })}
    >
      <Text variant="heading">{item.title}</Text>
      {item.description !== undefined && (
        <Text tone="muted" numberOfLines={3}>
          {item.description}
        </Text>
      )}
      {pending && (
        <Text variant="caption" tone="muted">
          Saving…
        </Text>
      )}
    </Card>
  );
}

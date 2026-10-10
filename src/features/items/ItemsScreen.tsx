import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Platform, View } from 'react-native';

import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { isEnabled } from '@/lib/flags';
import {
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
// or lists reach thousands of rows.

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
  const query = useItems(useDebouncedValue(search.trim()));
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

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
      accessibilityRole="progressbar"
      accessibilityLabel="Loading more items"
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

function ItemRow({ item }: { item: Item }) {
  const pending = isOptimistic(item);
  return (
    <Card
      testID={`item-${item.id}`}
      accessibilityLabel={pending ? `${item.title}, saving` : item.title}
      {...(!pending && {
        onPress: () => {
          router.push({ pathname: '/items/[id]', params: { id: item.id } });
        },
      })}
    >
      <Text variant="heading" numberOfLines={1}>
        {item.title}
      </Text>
      {item.description !== undefined && (
        <Text tone="muted" numberOfLines={2}>
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

import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, FlatList, Platform, View } from 'react-native';

import { userMessage } from '@/lib/errors';
import {
  AlertText,
  Button,
  createStyles,
  EmptyState,
  ErrorState,
  LoadingState,
  Text,
  useTheme,
} from '@/ui';

// A paginated list of the admin screens (docs/performance.md#lists): one
// FlatList whatever the state, the next page fetched as the end nears, pull
// to refresh, and the loading, empty and error states. A failure with rows
// already on screen keeps them and is said where it happened.

const useStyles = createStyles((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  list: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  footer: { paddingVertical: theme.spacing.lg },
  failure: { paddingVertical: theme.spacing.md, gap: theme.spacing.sm },
}));

interface PagedListProps<Row extends { id: string }> {
  query: UseInfiniteQueryResult<InfiniteData<{ items: Row[]; total: number }>>;
  renderRow: (row: Row) => ReactElement;
  /** What the rows are, for the loading and failure messages ("users"). */
  noun: string;
  empty: { title: string; description: string };
  header?: ReactNode;
  testID: string;
}

export function PagedList<Row extends { id: string }>({
  query,
  renderRow,
  noun,
  empty,
  header,
  testID,
}: PagedListProps<Row>) {
  const styles = useStyles();
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];

  let placeholder;
  if (query.isPending) placeholder = <LoadingState label={`Loading ${noun}`} />;
  else if (query.isError) {
    placeholder = <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else placeholder = <EmptyState title={empty.title} description={empty.description} />;

  let footer;
  if (query.isFetchingNextPage) footer = <NextPageSpinner label={`Loading more ${noun}`} />;
  else if (query.isFetchNextPageError) {
    footer = (
      <LoadFailure
        title={`Could not load more ${noun}`}
        error={query.error}
        onRetry={() => void query.fetchNextPage()}
      />
    );
  }

  return (
    <FlatList
      style={styles.root}
      testID={testID}
      data={rows}
      keyExtractor={(row) => row.id}
      renderItem={({ item }) => renderRow(item)}
      ListHeaderComponent={
        <>
          {header}
          {query.isRefetchError && (
            <LoadFailure
              title={`Could not refresh the ${noun}`}
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          )}
        </>
      }
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      onRefresh={() => void query.refetch()}
      removeClippedSubviews={Platform.OS === 'android'}
      ListEmptyComponent={placeholder}
      ListFooterComponent={footer}
    />
  );
}

function LoadFailure({
  title,
  error,
  onRetry,
}: {
  title: string;
  error: unknown;
  onRetry: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.failure}>
      <Text variant="label">{title}</Text>
      <AlertText tone="muted">{userMessage(error)}</AlertText>
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

function NextPageSpinner({ label }: { label: string }) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <View
      style={styles.footer}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

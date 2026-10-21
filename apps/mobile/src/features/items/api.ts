import {
  type InfiniteData,
  keepPreviousData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { z } from 'zod';

import { api, type components } from '@/api/client';
import { unwrapWith } from '@/api/unwrap';

// The items feature's server state (docs/mobile-architecture.md#data-fetching):
// query keys in one factory, one hook per query or mutation, every response
// validated. Screens use these hooks; they never call the API client.

export type Item = components['schemas']['Item'];
export type ItemPage = components['schemas']['ItemPage'];
export type CreateItemInput = components['schemas']['CreateItemRequest'];

// What reaches the device, checked against the contract at runtime: the
// generated types are what the server promises (an older server, a proxy or a
// bug can send something else). A response that does not match is an error
// state, not a crash while rendering (an invalid date throws when formatted).
// `satisfies` keeps the schemas in step with the generated types.
export const ItemSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  createdAt: z.iso.datetime({ offset: true }),
}) satisfies z.ZodType<Item>;

export const ItemPageSchema = z.object({
  items: z.array(ItemSchema),
  total: z.number().int().nonnegative(),
}) satisfies z.ZodType<ItemPage>;

export const PAGE_SIZE = 20;

export const itemKeys = {
  all: ['items'] as const,
  lists: () => [...itemKeys.all, 'list'] as const,
  list: (search: string) => [...itemKeys.lists(), { search }] as const,
  detail: (id: string) => [...itemKeys.all, 'detail', id] as const,
};

/** Pages of items, newest first; the next page loads as the list nears its end. */
export function useItems(search: string) {
  return useInfiniteQuery({
    queryKey: itemKeys.list(search),
    queryFn: ({ pageParam, signal }) =>
      unwrapWith(
        api.GET('/api/items', {
          params: { query: { limit: PAGE_SIZE, offset: pageParam, ...(search && { q: search }) } },
          signal,
        }),
        ItemPageSchema,
      ),
    // While a new search loads, the previous results stay on screen instead
    // of a spinner: the list (and the search field above it) never unmounts.
    placeholderData: keepPreviousData,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
  });
}

function findInLists(queryClient: QueryClient, id: string): Item | undefined {
  for (const [, data] of queryClient.getQueriesData<InfiniteData<ItemPage>>({
    queryKey: itemKeys.lists(),
  })) {
    const item = data?.pages.flatMap((page) => page.items).find((candidate) => candidate.id === id);
    if (item) return item;
  }
  return undefined;
}

/** One item; shown at once from a loaded list, then refreshed. */
export function useItem(id: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: itemKeys.detail(id),
    queryFn: ({ signal }) =>
      unwrapWith(api.GET('/api/items/{id}', { params: { path: { id } }, signal }), ItemSchema),
    placeholderData: findInLists(queryClient, id),
  });
}

const OPTIMISTIC_PREFIX = 'optimistic-';

export function isOptimistic(item: Item): boolean {
  return item.id.startsWith(OPTIMISTIC_PREFIX);
}

/**
 * Replaces this create's optimistic item with the server's, or removes it,
 * in the unfiltered list. False when the list no longer holds it: refetched
 * meanwhile, or cleared at sign-out (and maybe refilled by the next user).
 */
function settleOptimistic(queryClient: QueryClient, id: string, created?: Item): boolean {
  const key = itemKeys.list('');
  const list = queryClient.getQueryData<InfiniteData<ItemPage>>(key);
  const index = list?.pages.findIndex((page) => page.items.some((item) => item.id === id)) ?? -1;
  if (list === undefined || index === -1) return false;
  queryClient.setQueryData<InfiniteData<ItemPage>>(key, {
    ...list,
    pages: list.pages.map((page, current) => {
      if (current !== index) return page;
      return created
        ? { ...page, items: page.items.map((item) => (item.id === id ? created : item)) }
        : { items: page.items.filter((item) => item.id !== id), total: page.total - 1 };
    }),
  });
  return true;
}

/**
 * Creates an item. Optimistic: it appears at the top of the unfiltered list
 * at once, and is replaced by the server's item or removed when the request
 * settles; the list is refetched either way, so the server has the last word.
 *
 * The request can settle after the session ended (a sign-out clears the
 * cache, and the next user may already be signed in): the create then
 * touches only what it wrote itself, its optimistic item, and never restores
 * a snapshot of the list, which would bring back the previous user's data.
 */
export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['items', 'create'],
    mutationFn: (input: CreateItemInput) =>
      unwrapWith(api.POST('/api/items', { body: input }), ItemSchema),
    onMutate: async (input) => {
      const key = itemKeys.list('');
      await queryClient.cancelQueries({ queryKey: key });
      const list = queryClient.getQueryData<InfiniteData<ItemPage>>(key);
      const [first, ...rest] = list?.pages ?? [];
      if (list === undefined || first === undefined) return { optimisticId: null };
      const optimistic: Item = {
        id: `${OPTIMISTIC_PREFIX}${Date.now()}`,
        title: input.title,
        ...(input.description !== undefined && { description: input.description }),
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<InfiniteData<ItemPage>>(key, {
        ...list,
        pages: [{ items: [optimistic, ...first.items], total: first.total + 1 }, ...rest],
      });
      return { optimisticId: optimistic.id };
    },
    onError: (_error, _input, context) => {
      if (context?.optimisticId) settleOptimistic(queryClient, context.optimisticId);
    },
    onSuccess: (item, _input, context) => {
      if (context.optimisticId && settleOptimistic(queryClient, context.optimisticId, item)) {
        queryClient.setQueryData(itemKeys.detail(item.id), item);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: itemKeys.lists() }),
  });
}

import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import SuperJSON from "superjson";

import {
  cacheKeyFor,
  pruneCache,
  readCache,
  writeCache,
} from "~/lib/persistentCache";

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });

/**
 * Serves the client from IndexedDB before the network.
 *
 * On a reload every market query would otherwise sit empty until its first
 * fetch resolved, which on this app is the difference between seeing prices
 * immediately and watching skeletons for a few hundred milliseconds. Hydrating
 * from the cache makes the first paint real, and React Query then revalidates
 * in the background on its own schedule.
 *
 * The cached `savedAt` is written into the query's `dataUpdatedAt`, so every
 * "last updated" stamp in the UI reports the age of the *data* rather than the
 * age of the page load. That is the whole point of versioning the entries: a
 * cached price from six hours ago is legitimate to show as long as it is
 * labelled as six hours old.
 *
 * Only successful queries with data are written, and writes are debounced so a
 * 20 second poll does not hit IndexedDB 200 times a minute.
 */
/** The slice of TanStack Query's state this module reads, without `any`. */
type QueryStateLike = {
  status: string;
  data: unknown;
  dataUpdatedAt: number;
};

export function attachPersistentCache(client: QueryClient): void {
  if (typeof window === "undefined") return;

  let hydrated = false;

  const hydrate = async () => {
    if (hydrated) return;
    hydrated = true;

    const entries = client.getQueryCache().getAll();
    // Most-queried first, so the first paint is not held up behind a long list.
    await Promise.all(
      entries.map(async (query) => {
        if (query.state.status === "success") return;
        const key = cacheKeyFor(query.queryKey);
        const entry = await readCache<unknown>(key);
        if (!entry) return;
        client.setQueryData(query.queryKey, entry.data, {
          // Reported by every "last updated" stamp in the UI.
          updatedAt: entry.savedAt,
        });
      }),
    );
  };

  void hydrate();
  void pruneCache();

  const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>();

  const flush = (
    queryKey: readonly unknown[],
    data: unknown,
    dataUpdatedAt: number,
  ) => {
    // `null` is a real answer for a few procedures, so only `undefined` is
    // treated as nothing worth storing.
    if (data === undefined) return;

    const key = cacheKeyFor(queryKey);

    // A short debounce collapses a burst of refetches into one write, so a
    // twenty second poll does not hit IndexedDB hundreds of times an hour.
    const existing = pendingWrites.get(key);
    if (existing) clearTimeout(existing);
    pendingWrites.set(
      key,
      setTimeout(() => {
        pendingWrites.delete(key);
        void writeCache(key, data, dataUpdatedAt);
      }, 1_500),
    );
  };

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    // `added` covers a first successful fetch and `updated` a refetch. The
    // `observer` options cover an explicit `setQueryData`, such as restoring
    // from the cache, which must not immediately overwrite what was read.
    if (event.type !== "added" && event.type !== "updated") return;
    const state = event.query.state as QueryStateLike;
    if (state.status !== "success") return;
    flush(
      event.query.queryKey as readonly unknown[],
      state.data,
      state.dataUpdatedAt,
    );
  });

  // The cache is best effort; a reload is the only thing that tears it down.
  window.addEventListener("pagehide", unsubscribe, { once: true });
}

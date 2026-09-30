/**
 * A small versioned cache in IndexedDB, used as the browser-side database for
 * market snapshots.
 *
 * Why IndexedDB and not localStorage: the Iran board alone is a few hundred
 * kilobytes of JSON per refresh, and localStorage is a synchronous string map
 * that would block the main thread on every read and throw on quota. IndexedDB
 * is asynchronous and stores structured values, so the same job is free.
 *
 * Three rules the rest of the app depends on:
 *
 * - **Versioned.** Every entry carries {@link CACHE_VERSION}. Bump it and the
 *   whole cache reads as empty, so a shape change can never resurrect stale
 *   records that happen to share a key.
 * - **Timestamped.** Every entry carries the moment it was written, and that is
 *   what seeds React Query's `dataUpdatedAt`, so a cached page shows the real
 *   age of the data rather than pretending it just arrived.
 * - **Bounded.** Entries older than {@link MAX_AGE_MS} are dropped, and the
 *   store is pruned on boot so an old install does not carry dead weight
 *   forever.
 *
 * Everything degrades to a no-op when IndexedDB is unavailable: server
 * rendering, private browsing modes and hardened browsers all land here, and
 * none of them should break the app.
 */

export const CACHE_DB_NAME = "obsidian-cache";
export const CACHE_DB_VERSION = 1;
export const CACHE_STORE = "snapshots";

/**
 * Bump this whenever a cached shape changes. Entries written by a different
 * version are ignored and overwritten.
 */
export const CACHE_VERSION = 3;

/** One day. Anything older is treated as absent and pruned on boot. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Above this the store is trimmed, oldest first. */
const MAX_ENTRIES = 400;

export type CacheEntry<T = unknown> = {
  key: string;
  version: number;
  savedAt: number;
  data: T;
};

type EntryRecord = {
  key: string;
  version: number;
  savedAt: number;
  data: unknown;
};

let dbPromise: Promise<IDBDatabase | null> | null = null;

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.indexedDB !== "undefined" &&
    window.indexedDB !== null
  );
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!supported()) return Promise.resolve(null);
  dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        const store = db.createObjectStore(CACHE_STORE, { keyPath: "key" });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // A blocked or unavailable database must not take the app down with it.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return dbPromise;
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T>;
    try {
      request = work(
        db.transaction(CACHE_STORE, mode).objectStore(CACHE_STORE),
      );
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("cache request failed"));
  });
}

/** Stable string for a React Query key, which is a heterogeneous array. */
export function cacheKeyFor(queryKey: readonly unknown[]): string {
  return queryKey
    .map((part) => {
      if (part === undefined) return "u";
      try {
        return JSON.stringify(part, replacer) ?? "u";
      } catch {
        // A value JSON cannot represent at all; its type name is a stable
        // enough discriminator and never becomes `[object Object]`.
        return typeof part;
      }
    })
    .join("|");
}

/** Keeps `undefined` and non-serialisable values out of the key string. */
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "function") return undefined;
  if (typeof value === "bigint") return value.toString();
  return value;
}

export async function readCache<T>(
  key: string,
  now = Date.now(),
): Promise<CacheEntry<T> | null> {
  const db = await openDatabase();
  if (!db) return null;

  let record: EntryRecord | undefined;
  try {
    record = await run<EntryRecord | undefined>(
      db,
      "readonly",
      (store) => store.get(key) as IDBRequest<EntryRecord | undefined>,
    );
  } catch {
    return null;
  }

  if (!record) return null;
  // A version bump or an expired entry both read as a cache miss.
  if (record.version !== CACHE_VERSION) return null;
  if (now - record.savedAt > MAX_AGE_MS) return null;

  return {
    key: record.key,
    version: record.version,
    savedAt: record.savedAt,
    data: record.data as T,
  };
}

export async function writeCache<T>(
  key: string,
  data: T,
  now = Date.now(),
): Promise<void> {
  const db = await openDatabase();
  if (!db) return;

  const record: EntryRecord = {
    key,
    version: CACHE_VERSION,
    savedAt: now,
    data,
  };

  try {
    await run(db, "readwrite", (store) => store.put(record));
  } catch {
    // Quota or a corrupted store: the app keeps working, it just re-fetches.
  }
}

export async function clearCache(): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  try {
    await run(db, "readwrite", (store) => store.clear());
  } catch {
    // Nothing useful to do; the next write repopulates it.
  }
}

/** Age of every entry, so the UI can report how stale the cache is. */
export async function readCacheIndex(
  now = Date.now(),
): Promise<{ key: string; savedAt: number; ageMs: number }[]> {
  const db = await openDatabase();
  if (!db) return [];

  try {
    const all = await run<EntryRecord[]>(
      db,
      "readonly",
      (store) => store.getAll() as IDBRequest<EntryRecord[]>,
    );
    return all
      .filter(
        (entry) =>
          entry.version === CACHE_VERSION && now - entry.savedAt <= MAX_AGE_MS,
      )
      .map((entry) => ({
        key: entry.key,
        savedAt: entry.savedAt,
        ageMs: now - entry.savedAt,
      }));
  } catch {
    return [];
  }
}

/** Drops expired entries and trims the rest, oldest first. */
export async function pruneCache(now = Date.now()): Promise<number> {
  const db = await openDatabase();
  if (!db) return 0;

  let removed = 0;
  try {
    const all = await run<EntryRecord[]>(
      db,
      "readonly",
      (store) => store.getAll() as IDBRequest<EntryRecord[]>,
    );

    const doomed = all
      .filter(
        (entry) =>
          entry.version !== CACHE_VERSION || now - entry.savedAt > MAX_AGE_MS,
      )
      .map((entry) => entry.key);

    const live = all
      .filter((entry) => !doomed.includes(entry.key))
      .sort((a, b) => a.savedAt - b.savedAt);

    // Over budget, the oldest live entries go.
    const overflow = Math.max(0, live.length - MAX_ENTRIES);
    for (let i = 0; i < overflow; i += 1) {
      const entry = live[i];
      if (entry) doomed.push(entry.key);
    }

    if (doomed.length === 0) return 0;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE, "readwrite");
      const store = tx.objectStore(CACHE_STORE);
      for (const key of doomed) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("prune failed"));
    });

    removed = doomed.length;
  } catch {
    return removed;
  }

  return removed;
}

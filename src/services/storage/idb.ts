/**
 * Minimal promise wrapper over IndexedDB.
 *
 * Deliberately dependency-free: IndexedDB is the only storage API that is
 * durable, has enough quota for a full course's attendance, and is available in
 * every browser this app targets.
 *
 * If IndexedDB is unavailable (private windows with storage disabled, hardened
 * browser profiles), we fall back to an in-memory implementation rather than
 * failing to start. The application reports the degraded mode in the UI so the
 * user knows the data will not survive a reload.
 *
 * Both stores use an out-of-line `key` field so KV entries and attendance
 * sessions share one shape and one code path.
 */

export const STORE_KV = 'kv';
export const STORE_SESSIONS = 'sessions';

export const DB_NAME = 'attendance-qr';
export const DB_VERSION = 1;

export interface KvRecord {
  readonly key: string;
  readonly value: unknown;
}

export type StorageBackendKind = 'indexeddb' | 'memory';

export interface StorageBackend {
  readonly kind: StorageBackendKind;
  get<T>(store: string, key: string): Promise<T | undefined>;
  set(store: string, key: string, value: unknown): Promise<void>;
  remove(store: string, key: string): Promise<void>;
  getAll<T>(store: string): Promise<T[]>;
  clear(store: string): Promise<void>;
  close(): void;
}

/* -------------------------------------------------------------------------- */
/* Promise adapters                                                            */
/* -------------------------------------------------------------------------- */

function requestToPromise<T>(request: IDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = (): void => resolve(request.result as T);
    request.onerror = (): void => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

/**
 * Registered *before* any await: an IndexedDB transaction auto-commits as soon
 * as its last request settles, so attaching the `complete` handler afterwards
 * can miss the event and hang forever.
 */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = (): void => reject(tx.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

/* -------------------------------------------------------------------------- */
/* IndexedDB backend                                                           */
/* -------------------------------------------------------------------------- */

function createIndexedDbBackend(db: IDBDatabase): StorageBackend {
  return {
    kind: 'indexeddb',

    async get<T>(store: string, key: string): Promise<T | undefined> {
      const transaction = db.transaction(store, 'readonly');
      const done = transactionDone(transaction);
      const record = await requestToPromise<KvRecord | undefined>(
        transaction.objectStore(store).get(key),
      );
      await done;
      return record === undefined ? undefined : (record.value as T);
    },

    async set(store: string, key: string, value: unknown): Promise<void> {
      const transaction = db.transaction(store, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(store).put({ key, value } satisfies KvRecord);
      await done;
    },

    async remove(store: string, key: string): Promise<void> {
      const transaction = db.transaction(store, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(store).delete(key);
      await done;
    },

    async getAll<T>(store: string): Promise<T[]> {
      const transaction = db.transaction(store, 'readonly');
      const done = transactionDone(transaction);
      const records = await requestToPromise<KvRecord[]>(transaction.objectStore(store).getAll());
      await done;
      return records.map((record) => record.value as T);
    },

    async clear(store: string): Promise<void> {
      const transaction = db.transaction(store, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(store).clear();
      await done;
    },

    close(): void {
      db.close();
    },
  };
}

function openIndexedDb(name: string, version: number): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(name, version);
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Cannot open IndexedDB.'));
      return;
    }

    request.onupgradeneeded = (): void => {
      const db = request.result;
      for (const storeName of [STORE_KV, STORE_SESSIONS]) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'key' });
        }
      }
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error ?? new Error('Cannot open IndexedDB.'));
    request.onblocked = (): void => reject(new Error('IndexedDB is blocked by another tab.'));
  });
}

/* -------------------------------------------------------------------------- */
/* In-memory fallback                                                          */
/* -------------------------------------------------------------------------- */

function createMemoryBackend(): StorageBackend {
  const stores = new Map<string, Map<string, unknown>>();

  function store(name: string): Map<string, unknown> {
    const existing = stores.get(name);
    if (existing !== undefined) return existing;
    const created = new Map<string, unknown>();
    stores.set(name, created);
    return created;
  }

  return {
    kind: 'memory',
    get<T>(storeName: string, key: string): Promise<T | undefined> {
      return Promise.resolve(store(storeName).get(key) as T | undefined);
    },
    set(storeName: string, key: string, value: unknown): Promise<void> {
      store(storeName).set(key, value);
      return Promise.resolve();
    },
    remove(storeName: string, key: string): Promise<void> {
      store(storeName).delete(key);
      return Promise.resolve();
    },
    getAll<T>(storeName: string): Promise<T[]> {
      return Promise.resolve([...store(storeName).values()] as T[]);
    },
    clear(storeName: string): Promise<void> {
      store(storeName).clear();
      return Promise.resolve();
    },
    close(): void {
      stores.clear();
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

let backendPromise: Promise<StorageBackend> | null = null;

async function resolveBackend(): Promise<StorageBackend> {
  if (typeof indexedDB === 'undefined') return createMemoryBackend();
  try {
    const db = await openIndexedDb(DB_NAME, DB_VERSION);
    return createIndexedDbBackend(db);
  } catch {
    return createMemoryBackend();
  }
}

export function getBackend(): Promise<StorageBackend> {
  backendPromise ??= resolveBackend();
  return backendPromise;
}

/** Test seam: forces the next `getBackend()` call to reconnect. */
export function resetBackendForTests(): void {
  backendPromise = null;
}

export async function getStorageKind(): Promise<StorageBackendKind> {
  return (await getBackend()).kind;
}
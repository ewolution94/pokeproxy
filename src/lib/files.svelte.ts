// Pictures that live on this device: uploads, and what a pasted link turned out to show (the
// server fetches it once and the page keeps the bytes). IndexedDB holds them across visits; a
// private window without it keeps them for the visit only.

const DB = 'pokeproxy';
const STORE = 'files';

/** Each picture's object URL, once it's been read; templates update when one arrives. */
const urls = $state<Record<string, string>>({});
const pending = new Set<string>();
/** Without IndexedDB, the pictures of this visit. */
const memory = new Map<string, Blob>();

let opening: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

/** Keeps a picture; returns its key. */
export async function saveFile(blob: Blob): Promise<string> {
  const key = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  memory.set(key, blob);
  urls[key] = URL.createObjectURL(blob);
  await run('readwrite', (s) => s.put(blob, key));
  return key;
}

/** The picture's object URL, or undefined while it's being read (or if it's gone). */
export function fileUrl(key: string): string | undefined {
  if (!(key in urls) && !pending.has(key)) {
    pending.add(key);
    void run<Blob>('readonly', (s) => s.get(key)).then((blob) => {
      const found = blob ?? memory.get(key);
      if (found) urls[key] = URL.createObjectURL(found);
    });
  }
  return urls[key];
}

/** The picture itself, for a saved sheet (share.ts); undefined if it's gone. */
export async function readFile(key: string): Promise<Blob | undefined> {
  return (await run<Blob>('readonly', (st) => st.get(key))) ?? memory.get(key);
}

/** Forgets every picture no slot uses any more. */
export async function prune(keep: Set<string>) {
  const keys = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? [];
  for (const key of keys) {
    if (typeof key === 'string' && !keep.has(key)) {
      await run('readwrite', (s) => s.delete(key));
      memory.delete(key);
      if (urls[key]) URL.revokeObjectURL(urls[key]);
      delete urls[key];
    }
  }
}

/** A picture the browser can show: PNG, JPEG, WebP, GIF or AVIF. */
export const isPicture = (file: Blob) => /^image\/(png|jpe?g|webp|gif|avif)$/i.test(file.type);

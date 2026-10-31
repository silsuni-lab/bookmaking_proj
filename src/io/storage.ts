import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Asset, Book } from '../core/model';

export interface StoredAsset extends Asset {
  bookId: string;
}

interface KidsDB extends DBSchema {
  books: { key: string; value: Book };
  assets: { key: string; value: StoredAsset; indexes: { bookId: string } };
}

let dbPromise: Promise<IDBPDatabase<KidsDB>> | null = null;

function db(): Promise<IDBPDatabase<KidsDB>> {
  dbPromise ??= openDB<KidsDB>('kids-book-maker', 1, {
    blocking() {
      void closeDb();
    },
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' });
      d.createObjectStore('assets', { keyPath: 'id' }).createIndex('bookId', 'bookId');
    },
  });
  return dbPromise;
}

export async function closeDb(): Promise<void> {
  const p = dbPromise;
  dbPromise = null;
  if (p) (await p).close();
}

export async function listBooks(): Promise<Pick<Book, 'id' | 'title' | 'childName' | 'updatedAt'>[]> {
  const all = await (await db()).getAll('books');
  return all
    .map(({ id, title, childName, updatedAt }) => ({ id, title, childName, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadBook(id: string): Promise<Book | undefined> {
  return (await db()).get('books', id);
}

export async function saveBook(book: Book): Promise<void> {
  await (await db()).put('books', book);
}

export async function deleteBook(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['books', 'assets'], 'readwrite');
  const keys = await tx.objectStore('assets').index('bookId').getAllKeys(id);
  await Promise.all([tx.objectStore('books').delete(id), ...keys.map((k) => tx.objectStore('assets').delete(k)), tx.done]);
}

export async function putAsset(a: StoredAsset): Promise<void> {
  await (await db()).put('assets', a);
}

export async function getAsset(id: string): Promise<StoredAsset | undefined> {
  return (await db()).get('assets', id);
}

export async function assetsOf(bookId: string): Promise<StoredAsset[]> {
  return (await db()).getAllFromIndex('assets', 'bookId', bookId);
}

/** Deletes the book's assets whose id is not in keep (e.g. replaced backgrounds, deleted drawings). */
export async function deleteAssetsExcept(bookId: string, keep: ReadonlySet<string>): Promise<void> {
  const tx = (await db()).transaction('assets', 'readwrite');
  const keys = await tx.store.index('bookId').getAllKeys(bookId);
  await Promise.all([...keys.filter((k) => !keep.has(k)).map((k) => tx.store.delete(k)), tx.done]);
}

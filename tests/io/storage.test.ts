import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { newBook } from '../../src/core/model';
import { assetsOf, deleteBook, getAsset, listBooks, loadBook, putAsset, saveBook, type StoredAsset } from '../../src/io/storage';

function asset(id: string, bookId: string, size = 4): StoredAsset {
  return { id, bookId, kind: 'photo', widthPx: 2, heightPx: 2, blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }) };
}

beforeEach(async () => {
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase('kids-book-maker');
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
    r.onblocked = () => res();
  });
});

describe('storage', () => {
  it('save → load 동일, listBooks 최근 순', async () => {
    const a = { ...newBook('a5p', '첫째'), updatedAt: 100 };
    const b = { ...newBook('a5p', '둘째'), updatedAt: 200 };
    await saveBook(a);
    await saveBook(b);
    expect(await loadBook(a.id)).toEqual(a);
    expect(await loadBook('none')).toBeUndefined();
    const list = await listBooks();
    expect(list.map((x) => x.id)).toEqual([b.id, a.id]);
    expect(list[0]).toEqual({ id: b.id, title: '둘째', childName: b.childName, updatedAt: 200 });
  });

  it('asset 저장/조회와 deleteBook 연쇄 삭제', async () => {
    const a = newBook('a5p');
    const other = newBook('a5p');
    await saveBook(a);
    await saveBook(other);
    await putAsset(asset('x1', a.id, 7));
    await putAsset(asset('x2', a.id));
    await putAsset(asset('y1', other.id));
    const got = await getAsset('x1');
    expect(got?.blob.size).toBe(7);
    expect(got?.blob.type).toBe('image/jpeg');
    expect((await assetsOf(a.id)).length).toBe(2);
    await deleteBook(a.id);
    expect(await loadBook(a.id)).toBeUndefined();
    expect(await assetsOf(a.id)).toEqual([]);
    expect((await assetsOf(other.id)).length).toBe(1);
  });
});

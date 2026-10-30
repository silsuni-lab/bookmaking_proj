import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { newBook } from '../../src/core/model';
import { BookFileError, exportBookFile, importBookFile } from '../../src/io/bookFile';
import type { StoredAsset } from '../../src/io/storage';

const mk = (id: string, bookId: string, kind: 'photo' | 'cutout', size: number): StoredAsset => ({
  id, bookId, kind, widthPx: 3, heightPx: 5,
  blob: new Blob([new Uint8Array(size).fill(7)], { type: kind === 'photo' ? 'image/jpeg' : 'image/png' }),
});

describe('bookFile', () => {
  it('export → import 왕복', async () => {
    const book = newBook('a5p', '내 책', '하준');
    const assets = [mk('p1', book.id, 'photo', 10), mk('c1', book.id, 'cutout', 20)];
    const blob = await exportBookFile(book, assets);
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['book.json', 'manifest.json', 'assets/p1.jpg', 'assets/c1.png']));
    const out = await importBookFile(blob);
    expect(out.book.title).toBe('내 책');
    expect(out.book.items).toEqual(book.items);
    expect(out.book.id).not.toBe(book.id);
    expect(out.assets.map((a) => a.id).sort()).toEqual(['c1', 'p1']);
    for (const a of out.assets) expect(a.bookId).toBe(out.book.id);
    const sizes = Object.fromEntries(out.assets.map((a) => [a.id, a.blob.size]));
    expect(sizes).toEqual({ p1: 10, c1: 20 });
    const c1 = out.assets.find((a) => a.id === 'c1')!;
    expect(c1.kind).toBe('cutout');
    expect([c1.widthPx, c1.heightPx]).toEqual([3, 5]);
  });

  it('zip이 아닌 Blob은 BookFileError', async () => {
    await expect(importBookFile(new Blob(['hello']))).rejects.toBeInstanceOf(BookFileError);
    await expect(importBookFile(new Blob(['hello']))).rejects.toThrow('책 파일이 아니거나 손상되었어요.');
  });

  it('manifest 버전/파일 누락은 BookFileError', async () => {
    const book = newBook('a5p');
    const z1 = new JSZip();
    z1.file('book.json', JSON.stringify(book));
    z1.file('manifest.json', JSON.stringify({ version: 2, assets: [] }));
    await expect(importBookFile(await z1.generateAsync({ type: 'blob' }))).rejects.toBeInstanceOf(BookFileError);
    const z2 = new JSZip();
    z2.file('book.json', JSON.stringify(book));
    z2.file('manifest.json', JSON.stringify({ version: 1, assets: [{ id: 'a', kind: 'photo', widthPx: 1, heightPx: 1, file: 'assets/a.jpg' }] }));
    await expect(importBookFile(await z2.generateAsync({ type: 'blob' }))).rejects.toBeInstanceOf(BookFileError);
  });
});

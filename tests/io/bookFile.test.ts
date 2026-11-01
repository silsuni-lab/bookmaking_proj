import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { newBook, newItem, type ImageElement } from '../../src/core/model';
import { BookFileError, exportBookFile, importBookFile } from '../../src/io/bookFile';
import { assetsOf, closeDb, putAsset, saveBook, type StoredAsset } from '../../src/io/storage';
import 'fake-indexeddb/auto';

const mk = (id: string, bookId: string, kind: 'photo' | 'cutout' | 'source', size: number): StoredAsset => ({
  id, bookId, kind, widthPx: 3, heightPx: 5,
  blob: new Blob([new Uint8Array(size).fill(7)], { type: kind === 'cutout' ? 'image/png' : 'image/jpeg' }),
});

function fixture() {
  const book = newBook('a5p', '내 책', '하준');
  const img: ImageElement = { id: 'e1', kind: 'image', assetId: 'c1', role: 'drawing', x: 0, y: 0, width: 10, height: 10, rotation: 0 };
  const item = newItem('full');
  item.backgroundAssetId = 'p1';
  item.elements.push(img);
  book.items.push(item);
  book.cover.front.backgroundAssetId = 'p1';
  const assets = [mk('p1', book.id, 'photo', 10), mk('c1', book.id, 'cutout', 20)];
  return { book, assets };
}

describe('bookFile', () => {
  it('원본 사진·다듬기 마스크 참조도 새 id로 바뀐다', async () => {
    const { book, assets } = fixture();
    const el = book.items[0].elements[0] as ImageElement;
    el.cleanup = { sourceAssetId: 's1', quad: null, strength: 0.4, maskAssetId: 'm1' };
    const all = [...assets, mk('s1', book.id, 'source', 30), { ...mk('m1', book.id, 'cutout', 40), kind: 'mask' as const }];
    const out = await importBookFile(await exportBookFile(book, all));
    const got = (out.book.items[0].elements[0] as ImageElement).cleanup!;
    const byId = new Map(out.assets.map((a) => [a.id, a]));
    expect(byId.get(got.sourceAssetId)?.kind).toBe('source');
    expect(byId.get(got.maskAssetId!)?.kind).toBe('mask');
    expect(byId.get(got.maskAssetId!)?.blob.type).toBe('image/png');
    expect(got.strength).toBe(0.4);
  });

  it('가져오면 asset id가 새로 부여되고 참조가 모두 갱신된다', async () => {
    const { book, assets } = fixture();
    const out = await importBookFile(await exportBookFile(book, assets));
    const ids = new Set(out.assets.map((a) => a.id));
    expect(out.assets.length).toBe(2);
    for (const a of out.assets) expect(['p1', 'c1']).not.toContain(a.id);
    const all = [out.book.cover.front, out.book.cover.back, ...out.book.items];
    const refs = all.flatMap((i) => [i.backgroundAssetId, ...i.elements.map((e) => (e.kind === 'image' ? e.assetId : null))]).filter((x): x is string => !!x);
    expect(refs.length).toBe(3);
    for (const r of refs) expect(ids.has(r)).toBe(true);
  });

  it('두 번 가져와도 원본 책의 asset이 바뀌지 않는다', async () => {
    const { book, assets } = fixture();
    await saveBook(book);
    for (const a of assets) await putAsset(a);
    const blob = await exportBookFile(book, assets);
    for (let i = 0; i < 2; i++) {
      const out = await importBookFile(blob);
      for (const a of out.assets) await putAsset(a);
    }
    const kept = await assetsOf(book.id);
    expect(kept.map((a) => a.id).sort()).toEqual(['c1', 'p1']);
    expect(kept.find((a) => a.id === 'c1')!.blob.size).toBe(20);
    await closeDb();
  });

  it('내보내기에는 책이 쓰는 asset만 들어간다', async () => {
    const { book, assets } = fixture();
    const zip = await JSZip.loadAsync(await exportBookFile(book, [...assets, mk('old', book.id, 'photo', 5)]));
    expect(Object.keys(zip.files)).not.toContain('assets/old.jpg');
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { assets: { id: string }[] };
    expect(manifest.assets.map((a) => a.id).sort()).toEqual(['c1', 'p1']);
  });

  it('export → import 왕복', async () => {
    const book = newBook('a5p', '내 책', '하준');
    book.cover.back.backgroundAssetId = 'p1';
    book.cover.back.elements.push({ id: 'e1', kind: 'image', assetId: 'c1', role: 'drawing', x: 0, y: 0, width: 10, height: 10, rotation: 0 });
    const assets = [mk('p1', book.id, 'photo', 10), mk('c1', book.id, 'cutout', 20)];
    const blob = await exportBookFile(book, assets);
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining(['book.json', 'manifest.json', 'assets/p1.jpg', 'assets/c1.png']));
    const out = await importBookFile(blob);
    expect(out.book.title).toBe('내 책');
    expect(out.book.items).toEqual(book.items);
    expect(out.book.id).not.toBe(book.id);
    expect(out.assets.length).toBe(2);
    for (const a of out.assets) expect(a.bookId).toBe(out.book.id);
    expect(out.assets.map((a) => a.blob.size).sort()).toEqual([10, 20]);
    const c1 = out.assets.find((a) => a.kind === 'cutout')!;
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

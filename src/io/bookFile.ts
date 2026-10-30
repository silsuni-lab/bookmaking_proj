import JSZip from 'jszip';
import { newId, type Book, type PageItem } from '../core/model';
import type { StoredAsset } from './storage';

export class BookFileError extends Error {
  constructor() {
    super('책 파일이 아니거나 손상되었어요.');
    this.name = 'BookFileError';
  }
}

interface ManifestAsset {
  id: string;
  kind: StoredAsset['kind'];
  widthPx: number;
  heightPx: number;
  file: string;
}

export async function exportBookFile(book: Book, assets: StoredAsset[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('book.json', JSON.stringify(book));
  const manifestAssets: ManifestAsset[] = assets.map((a) => {
    const file = `assets/${a.id}.${a.kind === 'cutout' ? 'png' : 'jpg'}`;
    zip.file(file, a.blob);
    return { id: a.id, kind: a.kind, widthPx: a.widthPx, heightPx: a.heightPx, file };
  });
  zip.file('manifest.json', JSON.stringify({ version: 1, assets: manifestAssets }));
  return zip.generateAsync({ type: 'blob' });
}

export async function importBookFile(file: Blob): Promise<{ book: Book; assets: StoredAsset[] }> {
  try {
    const zip = await JSZip.loadAsync(file);
    const bookEntry = zip.file('book.json');
    const manifestEntry = zip.file('manifest.json');
    if (!bookEntry || !manifestEntry) throw new BookFileError();
    const manifest = JSON.parse(await manifestEntry.async('string')) as { version: number; assets: ManifestAsset[] };
    if (manifest.version !== 1 || !Array.isArray(manifest.assets)) throw new BookFileError();
    const parsed = JSON.parse(await bookEntry.async('string')) as Book;
    const book: Book = { ...parsed, id: newId() };
    const assets: StoredAsset[] = [];
    const idMap = new Map<string, string>();
    for (const m of manifest.assets) idMap.set(m.id, newId());
    const remap = (item: PageItem): PageItem => ({
      ...item,
      backgroundAssetId: item.backgroundAssetId ? (idMap.get(item.backgroundAssetId) ?? item.backgroundAssetId) : null,
      elements: item.elements.map((el) => (el.kind === 'image' ? { ...el, assetId: idMap.get(el.assetId) ?? el.assetId } : el)),
    });
    book.cover = { front: remap(book.cover.front), back: remap(book.cover.back) };
    book.items = book.items.map(remap);
    for (const m of manifest.assets) {
      const entry = zip.file(m.file);
      if (!entry) throw new BookFileError();
      const type = m.kind === 'cutout' ? 'image/png' : 'image/jpeg';
      const blob = new Blob([await entry.async('arraybuffer')], { type });
      assets.push({ id: idMap.get(m.id)!, kind: m.kind, widthPx: m.widthPx, heightPx: m.heightPx, blob, bookId: book.id });
    }
    return { book, assets };
  } catch (e) {
    throw e instanceof BookFileError ? e : new BookFileError();
  }
}

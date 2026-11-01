import JSZip from 'jszip';
import { newId, referencedAssetIds, type Book, type CleanupSource, type PageItem } from '../core/model';
import type { StoredAsset } from './storage';

const isPng = (kind: StoredAsset['kind']) => kind === 'cutout' || kind === 'mask';

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
  const used = referencedAssetIds(book);
  const manifestAssets: ManifestAsset[] = assets.filter((a) => used.has(a.id)).map((a) => {
    const file = `assets/${a.id}.${isPng(a.kind) ? 'png' : 'jpg'}`;
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
    const id = (old: string) => idMap.get(old) ?? old;
    const remapDrawing = <T extends { assetId: string; cleanup?: CleanupSource }>(d: T): T => {
      const cleanup = d.cleanup && {
        ...d.cleanup,
        sourceAssetId: id(d.cleanup.sourceAssetId),
        maskAssetId: d.cleanup.maskAssetId && id(d.cleanup.maskAssetId),
      };
      return { ...d, assetId: id(d.assetId), ...(cleanup ? { cleanup } : {}) };
    };
    const remap = (item: PageItem): PageItem => ({
      ...item,
      backgroundAssetId: item.backgroundAssetId ? (idMap.get(item.backgroundAssetId) ?? item.backgroundAssetId) : null,
      elements: item.elements.map((el) => (el.kind === 'image' ? remapDrawing(el) : el)),
    });
    book.cover = { front: remap(book.cover.front), back: remap(book.cover.back) };
    book.items = book.items.map(remap);
    if (book.library) book.library = book.library.map(remapDrawing);
    for (const m of manifest.assets) {
      const entry = zip.file(m.file);
      if (!entry) throw new BookFileError();
      const type = isPng(m.kind) ? 'image/png' : 'image/jpeg';
      const blob = new Blob([await entry.async('arraybuffer')], { type });
      assets.push({ id: idMap.get(m.id)!, kind: m.kind, widthPx: m.widthPx, heightPx: m.heightPx, blob, bookId: book.id });
    }
    return { book, assets };
  } catch (e) {
    throw e instanceof BookFileError ? e : new BookFileError();
  }
}

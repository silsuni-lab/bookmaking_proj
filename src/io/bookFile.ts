import JSZip from 'jszip';
import { newId, type Book } from '../core/model';
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
    for (const m of manifest.assets) {
      const entry = zip.file(m.file);
      if (!entry) throw new BookFileError();
      const type = m.kind === 'cutout' ? 'image/png' : 'image/jpeg';
      const blob = new Blob([await entry.async('arraybuffer')], { type });
      assets.push({ id: m.id, kind: m.kind, widthPx: m.widthPx, heightPx: m.heightPx, blob, bookId: book.id });
    }
    return { book, assets };
  } catch (e) {
    throw e instanceof BookFileError ? e : new BookFileError();
  }
}

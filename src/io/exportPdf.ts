import { jsPDF } from 'jspdf';
import { BLEED_MM, PAGE_SIZES } from '../core/model';
import type { Book, PageItem, PageSize } from '../core/model';
import { paginate, padForExport } from '../core/pagination';

export type PageRenderer = (item: PageItem | null, half: 'whole' | 'left' | 'right') => Promise<Uint8Array>;
type Progress = (done: number, total: number) => void;

export async function buildPdf(
  pages: Array<() => Promise<Uint8Array>>,
  size: PageSize,
  onProgress?: Progress,
): Promise<Blob> {
  const w = size.widthMm + BLEED_MM * 2;
  const h = size.heightMm + BLEED_MM * 2;
  const orientation = w > h ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ unit: 'mm', format: [w, h], orientation, compress: true });
  for (let i = 0; i < pages.length; i++) {
    const bytes = await pages[i]();
    if (i > 0) pdf.addPage([w, h], orientation);
    pdf.addImage(bytes, 'JPEG', 0, 0, w, h);
    onProgress?.(i + 1, pages.length);
  }
  return new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
}

export async function exportBook(
  book: Book,
  render: PageRenderer,
  onProgress?: Progress,
): Promise<{ cover: Blob; interior: Blob }> {
  const size = PAGE_SIZES[book.sizeId];
  const byId = new Map(book.items.map(it => [it.id, it]));
  const cover = [book.cover.front, book.cover.back].map(it => () => render(it, 'whole'));
  const interior = padForExport(paginate(book.items)).map(slot => () => {
    const item = slot.itemId === null ? null : (byId.get(slot.itemId) ?? null);
    return render(item, slot.half);
  });
  const total = cover.length + interior.length;
  const coverBlob = await buildPdf(cover, size, d => onProgress?.(d, total));
  const interiorBlob = await buildPdf(interior, size, d => onProgress?.(cover.length + d, total));
  return { cover: coverBlob, interior: interiorBlob };
}

import { BLEED_MM, DPI, PAGE_SIZES } from '../core/model';
import type { Book, PageItem } from '../core/model';
import { planItem } from '../core/drawPlan';
import type { AssetDims } from '../core/drawPlan';
import { mmToPx, splitSpreadMm } from '../core/geometry';
import type { PageRenderer } from './exportPdf';
import { renderOps } from './renderCanvas';

/** Horizontal crop (px at DPI) of a bleed-inclusive page taken from an item's canvas. */
export function halfCropPx(
  half: 'whole' | 'left' | 'right',
  trimWidthMm: number,
  bleedMm: number,
  dpi: number = DPI,
): { x: number; width: number } {
  const { left, right } = splitSpreadMm(trimWidthMm, bleedMm);
  const range = half === 'right' ? right : left;
  return { x: mmToPx(range.start, dpi), width: mmToPx(trimWidthMm + bleedMm * 2, dpi) };
}

async function toJpegBytes(canvas: OffscreenCanvas): Promise<Uint8Array> {
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return new Uint8Array(await blob.arrayBuffer());
}

function assetIdsOf(item: PageItem): string[] {
  const ids = new Set<string>();
  if (item.backgroundAssetId) ids.add(item.backgroundAssetId);
  for (const el of item.elements) if (el.kind === 'image') ids.add(el.assetId);
  return [...ids];
}

export function makePageRenderer(
  book: Book,
  getAsset: (assetId: string) => Promise<{ blob: Blob; widthPx: number; heightPx: number } | undefined>,
): PageRenderer {
  const size = PAGE_SIZES[book.sizeId];
  const pxPerMm = DPI / 25.4;
  const pageW = mmToPx(size.widthMm + BLEED_MM * 2);
  const pageH = mmToPx(size.heightMm + BLEED_MM * 2);

  return async (item, half) => {
    const out = new OffscreenCanvas(pageW, pageH);
    const octx = out.getContext('2d');
    if (!octx) throw new Error('2D context unavailable');
    octx.fillStyle = '#FFFFFF';
    octx.fillRect(0, 0, pageW, pageH);
    if (!item) return toJpegBytes(out);

    const bitmaps = new Map<string, ImageBitmap>();
    try {
      const dims: AssetDims = {};
      for (const id of assetIdsOf(item)) {
        const a = await getAsset(id);
        if (!a) continue;
        dims[id] = { widthPx: a.widthPx, heightPx: a.heightPx };
        bitmaps.set(id, await createImageBitmap(a.blob, { imageOrientation: 'from-image' }));
      }
      const canvas = await renderOps(planItem(item, size, dims), bitmaps, pxPerMm);
      const crop = halfCropPx(half, size.widthMm, BLEED_MM);
      octx.drawImage(canvas, crop.x, 0, crop.width, pageH, 0, 0, pageW, pageH);
      return await toJpegBytes(out);
    } finally {
      bitmaps.forEach((b) => b.close());
    }
  };
}

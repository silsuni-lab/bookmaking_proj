import { BLEED_MM, itemCanvasMm } from './model';
import type { PageItem, PageSize } from './model';
import { coverFit } from './geometry';
import type { Rect } from './geometry';

// Units: mm. Origin = top-left of the bleed-inclusive canvas.
export type DrawOp =
  | { op: 'fill'; color: string; rect: Rect }
  | { op: 'image'; assetId: string; src: Rect | null; dest: Rect; rotation: number } // src null = whole image
  | { op: 'band'; rect: Rect; color: 'rgba(255,255,255,0.75)'; radiusMm: 2 }
  | { op: 'text'; text: string; rect: Rect; fontSizePt: number; color: string; rotation: number; font: 'Gaegu' };

export interface AssetDims {
  [assetId: string]: { widthPx: number; heightPx: number };
}

const WHITE = '#FFFFFF';
const CREAM = '#FFFDF5';

function backgroundOp(assetId: string, dest: Rect, dims: AssetDims): DrawOp | null {
  const d = dims[assetId];
  if (!d) return null;
  return { op: 'image', assetId, src: coverFit(d.widthPx, d.heightPx, dest.width, dest.height), dest, rotation: 0 };
}

export function planItem(
  item: PageItem,
  size: PageSize,
  dims: AssetDims,
): { widthMm: number; heightMm: number; ops: DrawOp[] } {
  const c = itemCanvasMm(item, size);
  const widthMm = c.widthMm + 2 * BLEED_MM;
  const heightMm = c.heightMm + 2 * BLEED_MM;
  const ops: DrawOp[] = [{ op: 'fill', color: WHITE, rect: { x: 0, y: 0, width: widthMm, height: heightMm } }];

  if (item.layout === 'full') {
    if (item.backgroundAssetId) {
      const bg = backgroundOp(item.backgroundAssetId, { x: 0, y: 0, width: widthMm, height: heightMm }, dims);
      if (bg) ops.push(bg);
    }
  } else if (item.layout === 'spread') {
    const half = widthMm / 2;
    const photoX = item.photoSide === 'left' ? 0 : half;
    const creamX = item.photoSide === 'left' ? half : 0;
    if (item.backgroundAssetId) {
      const bg = backgroundOp(item.backgroundAssetId, { x: photoX, y: 0, width: half, height: heightMm }, dims);
      if (bg) ops.push(bg);
    }
    ops.push({ op: 'fill', color: CREAM, rect: { x: creamX, y: 0, width: half, height: heightMm } });
  }

  for (const el of item.elements) {
    const rect: Rect = { x: el.x + BLEED_MM, y: el.y + BLEED_MM, width: el.width, height: el.height };
    if (el.kind === 'image') {
      if (!dims[el.assetId]) continue;
      ops.push({ op: 'image', assetId: el.assetId, src: null, dest: rect, rotation: el.rotation });
    } else {
      if (el.band) ops.push({ op: 'band', rect: { ...rect }, color: 'rgba(255,255,255,0.75)', radiusMm: 2 });
      ops.push({
        op: 'text', text: el.text, rect, fontSizePt: el.fontSizePt, color: el.color, rotation: el.rotation, font: 'Gaegu',
      });
    }
  }
  return { widthMm, heightMm, ops };
}

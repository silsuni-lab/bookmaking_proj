import { isNeutral } from './adjust';
import { backdropPath, BUBBLE_STROKE } from './backdrop';
import type { ImageAdjust } from './adjust';
import { BLEED_MM, itemCanvasMm } from './model';
import type { PageElement, PageItem, PageSize } from './model';
import { DEFAULT_FRAME, framedCrop } from './geometry';
import type { BgFrame, Rect } from './geometry';

// Units: mm. Origin = top-left of the bleed-inclusive canvas.
export type DrawOp =
  | { op: 'fill'; color: string; rect: Rect }
  // src null = whole image; flipX mirrors inside dest; adjust = colour tweaks (both only on drawings)
  | { op: 'image'; assetId: string; src: Rect | null; dest: Rect; rotation: number; flipX?: true; adjust?: ImageAdjust }
  // path: SVG path relative to rect's top-left (mm); rotates about that corner like the element
  | { op: 'backdrop'; path: string; rect: Rect; color: string; stroke: { color: string; widthMm: number } | null; rotation: number }
  | { op: 'band'; rect: Rect; color: 'rgba(255,255,255,0.75)'; radiusMm: 2; rotation: number }
  | { op: 'text'; text: string; rect: Rect; fontSizePt: number; color: string; rotation: number; font: 'Gaegu' };

export interface AssetDims {
  [assetId: string]: { widthPx: number; heightPx: number };
}

const WHITE = '#FFFFFF';
const CREAM = '#FFFDF5';

function backgroundOp(assetId: string, dest: Rect, dims: AssetDims, frame: BgFrame = DEFAULT_FRAME): DrawOp | null {
  const d = dims[assetId];
  if (!d) return null;
  return { op: 'image', assetId, src: framedCrop(d.widthPx, d.heightPx, dest.width, dest.height, frame), dest, rotation: 0 };
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
      const bg = backgroundOp(item.backgroundAssetId, { x: 0, y: 0, width: widthMm, height: heightMm }, dims, item.bgFrame);
      if (bg) ops.push(bg);
    }
  } else if (item.layout === 'spread') {
    const half = widthMm / 2;
    const photoX = item.photoSide === 'left' ? 0 : half;
    const creamX = item.photoSide === 'left' ? half : 0;
    if (item.backgroundAssetId) {
      const bg = backgroundOp(item.backgroundAssetId, { x: photoX, y: 0, width: half, height: heightMm }, dims, item.bgFrame);
      if (bg) ops.push(bg);
    }
    ops.push({ op: 'fill', color: CREAM, rect: { x: creamX, y: 0, width: half, height: heightMm } });
  }

  const pushBackdrop = (el: PageElement, rect: Rect) => {
    if (!el.backdrop) return;
    ops.push({
      op: 'backdrop', path: backdropPath(el.backdrop, el.width, el.height), rect: { ...rect }, color: el.backdrop.color,
      stroke: el.backdrop.shape === 'bubble' ? BUBBLE_STROKE : null, rotation: el.rotation,
    });
  };

  for (const el of item.elements) {
    const rect: Rect = { x: el.x + BLEED_MM, y: el.y + BLEED_MM, width: el.width, height: el.height };
    if (el.kind === 'image') {
      if (!dims[el.assetId]) continue;
      pushBackdrop(el, rect);
      ops.push({
        op: 'image', assetId: el.assetId, src: null, dest: rect, rotation: el.rotation,
        ...(el.flipX ? { flipX: true as const } : {}),
        ...(isNeutral(el.adjust) ? {} : { adjust: el.adjust }),
      });
    } else {
      pushBackdrop(el, rect);
      if (el.band) ops.push({ op: 'band', rect: { ...rect }, color: 'rgba(255,255,255,0.75)', radiusMm: 2, rotation: el.rotation });
      ops.push({
        op: 'text', text: el.text, rect, fontSizePt: el.fontSizePt, color: el.color, rotation: el.rotation, font: 'Gaegu',
      });
    }
  }
  return { widthMm, heightMm, ops };
}

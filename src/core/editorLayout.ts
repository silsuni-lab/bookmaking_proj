import { itemCanvasMm, newId } from './model';
import type { ImageElement, ItemRef, PageItem, PageSize, TextElement } from './model';
import { paginate } from './pagination';

/** px per mm so that the bleed-inclusive canvas fits the available area (never zero). */
export function fitScale(availW: number, availH: number, canvasWmm: number, canvasHmm: number): number {
  const s = Math.min(availW / canvasWmm, availH / canvasHmm);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** Trim-origin area (mm) where new elements are placed: the whole canvas, or the photo side of a spread. */
export function placementArea(item: PageItem, size: PageSize): { x: number; y: number; width: number; height: number } {
  const c = itemCanvasMm(item, size);
  if (item.layout === 'spread') {
    return { x: item.photoSide === 'left' ? 0 : size.widthMm, y: 0, width: size.widthMm, height: c.heightMm };
  }
  return { x: 0, y: 0, width: c.widthMm, height: c.heightMm };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Drawing: centred, 50% of the area width, aspect kept (height capped to 90% of the area). */
export function newImageElement(
  item: PageItem,
  size: PageSize,
  assetId: string,
  role: 'drawing' | 'handwriting',
  aspect: number,
): ImageElement {
  const a = placementArea(item, size);
  const widthFrac = role === 'drawing' ? 0.5 : 0.8;
  let width = a.width * widthFrac;
  let height = width / aspect;
  if (height > a.height * 0.9) {
    height = a.height * 0.9;
    width = height * aspect;
  }
  const x = a.x + (a.width - width) / 2;
  const y = role === 'drawing' ? a.y + (a.height - height) / 2 : Math.max(0, a.y + a.height * 0.95 - height);
  return { id: newId(), kind: 'image', assetId, role, x, y, width, height, rotation: 0 };
}

/** Text: bottom centre, 80% of the area width. */
export function newTextElement(item: PageItem, size: PageSize): TextElement {
  const a = placementArea(item, size);
  const width = a.width * 0.8;
  const height = a.height * 0.15;
  return {
    id: newId(), kind: 'text', text: '여기에 글을 써 주세요', fontSizePt: 20, color: '#222222', band: false,
    x: a.x + (a.width - width) / 2, y: a.y + a.height * 0.95 - height, width, height, rotation: 0,
  };
}

/** Konva converts a transform into scale; fold it back into width/height (mm). */
export function foldScale(
  w: number,
  h: number,
  scaleX: number,
  scaleY: number,
): { width: number; height: number } {
  return { width: Math.max(1, w * Math.abs(scaleX)), height: Math.max(1, h * Math.abs(scaleY)) };
}

export const MM_PER_PT = 25.4 / 72;
export const clampPt = (pt: number) => clamp(Math.round(pt), 6, 120);

export function pageLabelOf(ref: ItemRef, items: PageItem[]): string {
  if (ref.kind === 'cover') return ref.which === 'front' ? '앞표지' : '뒤표지';
  const slot = paginate(items).find((s) => s.itemId === ref.id);
  return slot ? `${slot.pageNumber}쪽` : '이 쪽';
}

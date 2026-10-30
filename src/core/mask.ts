import type { PaperResult, RawImage } from './paper';

export const MASK_AUTO = 0, MASK_ERASE = 1, MASK_RESTORE = 2;

export function newMask(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h);
}

export function paintMask(
  mask: Uint8Array, w: number, h: number,
  cx: number, cy: number, radius: number, value: 0 | 1 | 2,
): void {
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) mask[y * w + x] = value;
    }
  }
}

export function applyMask(result: PaperResult, mask: Uint8Array): RawImage {
  const { image, normalized } = result;
  const data = new Uint8ClampedArray(image.data);
  for (let i = 0; i < mask.length; i++) {
    const o = i * 4;
    if (mask[i] === MASK_ERASE) data[o + 3] = 0;
    else if (mask[i] === MASK_RESTORE) {
      data[o] = normalized.data[o]; data[o + 1] = normalized.data[o + 1];
      data[o + 2] = normalized.data[o + 2]; data[o + 3] = 255;
    }
  }
  return { width: image.width, height: image.height, data };
}

import { MASK_AUTO, MASK_ERASE, MASK_RESTORE } from './mask';

/** Colour tweaks for a drawing, each −100..100 (0 = unchanged). */
export interface ImageAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Recolour to white (shape and transparency kept), e.g. dark handwriting on a dark photo. */
  toWhite?: boolean;
}

export const NO_ADJUST: ImageAdjust = { brightness: 0, contrast: 0, saturation: 0 };

export function isNeutral(a: ImageAdjust | undefined): boolean {
  return !a || (a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && !a.toWhite);
}

/**
 * Adjusts un-premultiplied RGBA in place; alpha is kept. Order: saturation, contrast, brightness.
 * Brightness moves toward white (+) or black (−) so dark crayon lines stay dark when lightening.
 */
export function adjustPixels(data: Uint8ClampedArray, a: ImageAdjust): void {
  if (a.toWhite) {
    for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = 255;
    return;
  }
  const s = 1 + a.saturation / 100;
  const c = 1 + a.contrast / 100;
  const b = a.brightness / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r0 = data[i], g0 = data[i + 1], b0 = data[i + 2];
    const grey = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
    for (let k = 0; k < 3; k++) {
      let v = grey + ((k === 0 ? r0 : k === 1 ? g0 : b0) - grey) * s;
      v = (v - 128) * c + 128;
      v = b >= 0 ? v + (255 - v) * b : v * (1 + b);
      data[i + k] = v; // Uint8ClampedArray rounds and clamps
    }
  }
}

const MASK_GREY = [0, 128, 255];

/** Touch-up mask → opaque grey RGBA, so it can be stored as a lossless PNG. */
export function encodeMask(mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length * 4);
  for (let i = 0; i < mask.length; i++) {
    const v = MASK_GREY[mask[i]] ?? 0;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function decodeMask(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++) {
    const v = rgba[i * 4];
    out[i] = v < 64 ? MASK_AUTO : v < 192 ? MASK_ERASE : MASK_RESTORE;
  }
  return out;
}

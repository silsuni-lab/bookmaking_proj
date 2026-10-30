import { DPI } from './model';

export function mmToPx(mm: number, dpi: number = DPI): number {
  return Math.round((mm / 25.4) * dpi);
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rect1D {
  start: number;
  end: number;
}

/** Centered crop of the source (source pixel coords) matching the box aspect ratio. Not rounded. */
export function coverFit(srcW: number, srcH: number, boxW: number, boxH: number): Rect {
  const scale = Math.max(boxW / srcW, boxH / srcH);
  const width = boxW / scale;
  const height = boxH / scale;
  return { x: (srcW - width) / 2, y: (srcH - height) / 2, width, height };
}

export function effectiveDpi(srcPx: number, printedMm: number): number {
  return srcPx / (printedMm / 25.4);
}

/** Below this effective DPI, warn about print quality. */
export const DPI_WARN = 200;

/** x-ranges of each page on the bleed-inclusive spread canvas (width 2*trim + 2*bleed). */
export function splitSpreadMm(trimWidthMm: number, bleedMm: number): { left: Rect1D; right: Rect1D } {
  const total = trimWidthMm * 2 + bleedMm * 2;
  return {
    left: { start: 0, end: trimWidthMm + bleedMm * 2 },
    right: { start: trimWidthMm, end: total },
  };
}

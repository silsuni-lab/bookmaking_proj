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

/** How a background photo sits in its box: zoom ≥ 1 enlarges it; cx/cy (0..1) is the photo point at the box centre. */
export interface BgFrame {
  zoom: number;
  cx: number;
  cy: number;
}

export const DEFAULT_FRAME: BgFrame = { zoom: 1, cx: 0.5, cy: 0.5 };
export const MAX_BG_ZOOM = 4;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The frame moved back inside its limits, so the crop never leaves the photo (no white edge in print). */
export function clampFrame(srcW: number, srcH: number, boxW: number, boxH: number, f: BgFrame): BgFrame {
  const zoom = clamp(f.zoom, 1, MAX_BG_ZOOM);
  const base = coverFit(srcW, srcH, boxW, boxH);
  const hw = base.width / zoom / 2 / srcW;
  const hh = base.height / zoom / 2 / srcH;
  return { zoom, cx: clamp(f.cx, hw, 1 - hw), cy: clamp(f.cy, hh, 1 - hh) };
}

/** Source crop for a framed background. The default frame gives the same crop as coverFit. */
export function framedCrop(srcW: number, srcH: number, boxW: number, boxH: number, f: BgFrame): Rect {
  const c = clampFrame(srcW, srcH, boxW, boxH, f);
  const base = coverFit(srcW, srcH, boxW, boxH);
  const width = base.width / c.zoom;
  const height = base.height / c.zoom;
  return { x: c.cx * srcW - width / 2, y: c.cy * srcH - height / 2, width, height };
}

/** Frame after dragging the photo by (dxMm, dyMm) inside a boxW×boxH mm box. */
export function panFrame(srcW: number, srcH: number, boxW: number, boxH: number, f: BgFrame, dxMm: number, dyMm: number): BgFrame {
  const crop = framedCrop(srcW, srcH, boxW, boxH, f);
  const pxPerMm = crop.width / boxW;
  return clampFrame(srcW, srcH, boxW, boxH, {
    zoom: f.zoom,
    cx: f.cx - (dxMm * pxPerMm) / srcW,
    cy: f.cy - (dyMm * pxPerMm) / srcH,
  });
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

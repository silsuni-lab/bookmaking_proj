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

export interface Pt2 {
  x: number;
  y: number;
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

/** Where the whole photo lies (mm, same space as dest) for a framed background; parts outside dest are cropped off. */
export function imageRectOf(srcW: number, srcH: number, dest: Rect, f: BgFrame): Rect {
  const crop = framedCrop(srcW, srcH, dest.width, dest.height, f);
  const s = dest.width / crop.width;
  return { x: dest.x - crop.x * s, y: dest.y - crop.y * s, width: srcW * s, height: srcH * s };
}

/** The frame that puts the whole photo at `rect` (clamped: the photo always covers dest). */
export function frameFromImageRect(srcW: number, srcH: number, dest: Rect, rect: Rect): BgFrame {
  const base = coverFit(srcW, srcH, dest.width, dest.height);
  const zoom = rect.width / srcW / (dest.width / base.width);
  return clampFrame(srcW, srcH, dest.width, dest.height, {
    zoom,
    cx: (dest.x + dest.width / 2 - rect.x) / rect.width,
    cy: (dest.y + dest.height / 2 - rect.y) / rect.height,
  });
}

/**
 * Scale factor for dragging the corner `from` to `to` while the opposite corner `anchor` stays put:
 * the drag projected on the anchor→corner diagonal (outward > 1, inward < 1, never ≤ 0).
 */
export function cornerDragScale(anchor: Pt2, from: Pt2, to: Pt2): number {
  const dx = from.x - anchor.x, dy = from.y - anchor.y;
  const k = ((to.x - anchor.x) * dx + (to.y - anchor.y) * dy) / (dx * dx + dy * dy);
  return Math.max(0.05, k);
}

export function scaleRectAbout(r: Rect, anchor: Pt2, k: number): Rect {
  return { x: anchor.x + (r.x - anchor.x) * k, y: anchor.y + (r.y - anchor.y) * k, width: r.width * k, height: r.height * k };
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

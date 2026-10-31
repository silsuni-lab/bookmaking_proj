import { describe, it, expect } from 'vitest';
import { mmToPx, coverFit, effectiveDpi, DPI_WARN, splitSpreadMm, framedCrop, clampFrame, panFrame, DEFAULT_FRAME } from '../../src/core/geometry';

describe('geometry', () => {
  it('mmToPx converts at default DPI', () => {
    expect(mmToPx(25.4)).toBe(300);
    expect(mmToPx(25.4, 150)).toBe(150);
  });
  it('coverFit crops centered to box aspect', () => {
    expect(coverFit(4000, 3000, 200, 200)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
    expect(coverFit(3000, 4000, 200, 200)).toEqual({ x: 0, y: 500, width: 3000, height: 3000 });
  });
  it('effectiveDpi', () => {
    expect(effectiveDpi(1200, 203.2)).toBeCloseTo(150);
    expect(DPI_WARN).toBe(200);
  });
  it('splitSpreadMm for A4 portrait', () => {
    expect(splitSpreadMm(210, 3)).toEqual({ left: { start: 0, end: 216 }, right: { start: 210, end: 426 } });
  });
  it('framedCrop with the default frame equals coverFit', () => {
    expect(framedCrop(4000, 3000, 200, 200, DEFAULT_FRAME)).toEqual(coverFit(4000, 3000, 200, 200));
  });
  it('framedCrop zooms around the focus point', () => {
    expect(framedCrop(4000, 3000, 200, 200, { zoom: 2, cx: 0.5, cy: 0.5 })).toEqual({ x: 1250, y: 750, width: 1500, height: 1500 });
  });
  it('framedCrop keeps the crop inside the photo so no white edge appears', () => {
    expect(framedCrop(4000, 3000, 200, 200, { zoom: 1, cx: 0, cy: 1 })).toEqual({ x: 0, y: 0, width: 3000, height: 3000 });
    expect(framedCrop(4000, 3000, 200, 200, { zoom: 2, cx: 1, cy: 1 })).toEqual({ x: 2500, y: 1500, width: 1500, height: 1500 });
  });
  it('clampFrame limits zoom to 1..4 and moves the focus back inside', () => {
    expect(clampFrame(4000, 3000, 200, 200, { zoom: 0.5, cx: 0, cy: 0.5 })).toEqual({ zoom: 1, cx: 0.375, cy: 0.5 });
    expect(clampFrame(4000, 3000, 200, 200, { zoom: 9, cx: 0.5, cy: 0.5 }).zoom).toBe(4);
  });
  it('panFrame moves the photo with the drag (drag right shows more of the left side)', () => {
    // dest 200mm shows 3000px, so 20mm of drag = 300px of photo = 0.075 of the 4000px width
    const f = panFrame(4000, 3000, 200, 200, DEFAULT_FRAME, 20, 0);
    expect(f.cx).toBeCloseTo(0.425);
    expect(f.cy).toBe(0.5);
  });
});

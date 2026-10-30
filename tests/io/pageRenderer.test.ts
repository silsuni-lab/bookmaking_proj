import { describe, it, expect } from 'vitest';
import { halfCropPx } from '../../src/io/pageRenderer';
import { mmToPx } from '../../src/core/geometry';
import { PAGE_SIZES, BLEED_MM } from '../../src/core/model';

describe('halfCropPx', () => {
  const w = PAGE_SIZES.a4p.widthMm;
  it('left half starts at 0 and is one page + bleed wide', () => {
    expect(halfCropPx('left', w, BLEED_MM)).toEqual({ x: 0, width: mmToPx(216) });
  });
  it('right half starts at one trim width', () => {
    expect(halfCropPx('right', w, BLEED_MM)).toEqual({ x: mmToPx(210), width: mmToPx(216) });
  });
  it('whole page covers the full width', () => {
    expect(halfCropPx('whole', w, BLEED_MM)).toEqual({ x: 0, width: mmToPx(216) });
  });
  it('right crop stays inside the spread canvas', () => {
    const c = halfCropPx('right', w, BLEED_MM);
    expect(c.x + c.width).toBeLessThanOrEqual(Math.round(((2 * w + 2 * BLEED_MM) / 25.4) * 300));
  });
});

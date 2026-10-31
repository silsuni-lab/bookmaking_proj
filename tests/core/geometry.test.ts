import { describe, it, expect } from 'vitest';
import { mmToPx, coverFit, effectiveDpi, DPI_WARN, splitSpreadMm } from '../../src/core/geometry';

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
});

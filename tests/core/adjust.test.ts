import { describe, expect, it } from 'vitest';
import { adjustPixels, isNeutral, decodeMask, encodeMask } from '../../src/core/adjust';
import { MASK_AUTO, MASK_ERASE, MASK_RESTORE } from '../../src/core/mask';

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe('adjustPixels', () => {
  it('neutral settings leave pixels unchanged', () => {
    const d = px(10, 120, 250, 200);
    adjustPixels(d, { brightness: 0, contrast: 0, saturation: 0 });
    expect([...d]).toEqual([10, 120, 250, 200]);
    expect(isNeutral(undefined)).toBe(true);
    expect(isNeutral({ brightness: 0, contrast: 0, saturation: 0 })).toBe(true);
    expect(isNeutral({ brightness: 5, contrast: 0, saturation: 0 })).toBe(false);
  });
  it('brightness lightens toward white and darkens toward black, keeping alpha', () => {
    const up = px(0, 100, 255, 77);
    adjustPixels(up, { brightness: 50, contrast: 0, saturation: 0 });
    expect([...up]).toEqual([128, 178, 255, 77]);
    const down = px(0, 100, 255, 77);
    adjustPixels(down, { brightness: -50, contrast: 0, saturation: 0 });
    expect([...down]).toEqual([0, 50, 128, 77]);
  });
  it('contrast spreads values away from mid grey', () => {
    const d = px(100, 128, 200, 255);
    adjustPixels(d, { brightness: 0, contrast: 50, saturation: 0 });
    expect([...d]).toEqual([86, 128, 236, 255]);
  });
  it('saturation -100 makes grey, +100 doubles the distance from grey', () => {
    const grey = px(200, 100, 50, 255);
    adjustPixels(grey, { brightness: 0, contrast: 0, saturation: -100 });
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    const vivid = px(150, 100, 100, 255);
    adjustPixels(vivid, { brightness: 0, contrast: 0, saturation: 100 });
    expect(vivid[0] - vivid[1]).toBe(100);
  });
});

describe('white ink', () => {
  it('turns every pixel white but keeps its transparency', () => {
    const d = px(20, 30, 40, 255, 200, 10, 10, 90, 0, 0, 0, 0);
    adjustPixels(d, { brightness: 0, contrast: 0, saturation: 0, toWhite: true });
    expect([...d]).toEqual([255, 255, 255, 255, 255, 255, 255, 90, 255, 255, 255, 0]);
    expect(isNeutral({ brightness: 0, contrast: 0, saturation: 0, toWhite: true })).toBe(false);
    expect(isNeutral({ brightness: 0, contrast: 0, saturation: 0, toWhite: false })).toBe(true);
  });
});

describe('mask image encoding', () => {
  it('round-trips the three mask values through grey RGBA', () => {
    const mask = new Uint8Array([MASK_AUTO, MASK_ERASE, MASK_RESTORE, MASK_ERASE]);
    const rgba = encodeMask(mask);
    expect(rgba.length).toBe(16);
    expect([...decodeMask(rgba)]).toEqual([...mask]);
  });
  it('decodes slightly shifted greys to the nearest value', () => {
    expect([...decodeMask(px(3, 3, 3, 255, 131, 131, 131, 255, 250, 250, 250, 255))]).toEqual([MASK_AUTO, MASK_ERASE, MASK_RESTORE]);
  });
});

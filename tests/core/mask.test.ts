import { describe, it, expect } from 'vitest';
import { newMask, paintMask, applyMask, MASK_ERASE, MASK_RESTORE } from '../../src/core/mask';
import type { RawImage, PaperResult } from '../../src/core/paper';

function solid(w: number, h: number, rgba: [number, number, number, number]): RawImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(rgba, i * 4);
  return { width: w, height: h, data };
}
const mk = (): PaperResult => ({ image: solid(10, 10, [10, 20, 30, 200]), normalized: solid(10, 10, [100, 110, 120, 255]) });
const px = (im: RawImage, x: number, y: number) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));

describe('mask', () => {
  it('erase makes alpha 0 inside brush, keeps outside', () => {
    const r = mk(); const m = newMask(10, 10);
    paintMask(m, 10, 10, 5, 5, 2, MASK_ERASE);
    const out = applyMask(r, m);
    expect(px(out, 5, 5)[3]).toBe(0);
    expect(px(out, 0, 0)).toEqual([10, 20, 30, 200]);
    expect(px(r.image, 5, 5)[3]).toBe(200);
  });
  it('restore uses normalized color with alpha 255', () => {
    const r = mk(); const m = newMask(10, 10);
    paintMask(m, 10, 10, 5, 5, 2, MASK_RESTORE);
    expect(px(applyMask(r, m), 5, 5)).toEqual([100, 110, 120, 255]);
  });
  it('radius 2 brush does not touch (5,8)', () => {
    const m = newMask(10, 10);
    paintMask(m, 10, 10, 5, 5, 2, MASK_ERASE);
    expect(m[8 * 10 + 5]).toBe(0);
    expect(m[7 * 10 + 5]).toBe(1);
  });
  it('clips at bounds', () => {
    const m = newMask(10, 10);
    expect(() => paintMask(m, 10, 10, 0, 0, 3, MASK_ERASE)).not.toThrow();
    expect(m[0]).toBe(1);
  });
});

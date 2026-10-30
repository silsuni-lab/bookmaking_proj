import { describe, it, expect } from 'vitest';
import { homography, outputSize, warpQuad, type Quad } from '../../src/core/perspective';

const apply = (h: number[], x: number, y: number) => {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
};

describe('perspective', () => {
  it('identity quad gives identity homography', () => {
    const q: Quad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const h = homography(q, q);
    [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => expect(h[i]).toBeCloseTo(v, 9));
  });

  it('warpQuad with full-image quad reproduces the source', () => {
    const w = 100, h = 100;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = i % 251; data[i * 4 + 1] = (i * 7) % 256; data[i * 4 + 2] = (i * 13) % 256; data[i * 4 + 3] = 255;
    }
    const q: Quad = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    const out = warpQuad({ width: w, height: h, data }, q);
    expect(out.width).toBe(w);
    expect(out.height).toBe(h);
    expect(Array.from(out.data)).toEqual(Array.from(data));
  });

  it('trapezoid: homography(dst, q) maps dst corners onto q corners', () => {
    const q: Quad = [{ x: 10, y: 0 }, { x: 90, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const { width, height } = outputSize(q);
    const dst: Quad = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
    const h = homography(dst, q);
    dst.forEach((p, i) => {
      const r = apply(h, p.x, p.y);
      expect(Math.abs(r.x - q[i].x)).toBeLessThan(1e-6);
      expect(Math.abs(r.y - q[i].y)).toBeLessThan(1e-6);
    });
  });
});

import type { RawImage } from './paper';

export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // 좌상, 우상, 우하, 좌하

/** 3x3 row-major homography (h[8]=1) mapping each src point to the matching dst point. */
export function homography(src: Quad, dst: Quad): number[] {
  // 8x9 augmented matrix for unknowns h0..h7
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) throw new Error('degenerate quad');
    [a[c], a[p]] = [a[p], a[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 9; k++) a[r][k] -= f * a[c][k];
    }
  }
  const h: number[] = [];
  for (let i = 0; i < 8; i++) h.push(a[i][8] / a[i][i]);
  h.push(1);
  return h;
}

/** Max length of the opposing edges, rounded to integers (min 1). */
export function outputSize(q: Quad): { width: number; height: number } {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  return {
    width: Math.max(1, Math.round(Math.max(d(q[0], q[1]), d(q[3], q[2])))),
    height: Math.max(1, Math.round(Math.max(d(q[0], q[3]), d(q[1], q[2])))),
  };
}

/**
 * Flatten quad q into a rectangle. Convention: coordinates are continuous pixel
 * indices; the output rect corners are (0,0),(W,0),(W,H),(0,H), so the full-image
 * quad [(0,0),(w,0),(w,h),(0,h)] reproduces the source exactly. Bilinear, edge-clamped.
 */
export function warpQuad(src: RawImage, q: Quad): RawImage {
  const { width, height } = outputSize(q);
  const dst: Quad = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }];
  const h = homography(dst, q);
  const out = new Uint8ClampedArray(width * height * 4);
  const sw = src.width, sh = src.height, sd = src.data;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = h[6] * x + h[7] * y + h[8];
      const sx = Math.min(sw - 1, Math.max(0, (h[0] * x + h[1] * y + h[2]) / w));
      const sy = Math.min(sh - 1, Math.max(0, (h[3] * x + h[4] * y + h[5]) / w));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(sw - 1, x0 + 1), y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = sd[(y0 * sw + x0) * 4 + c] * (1 - fx) + sd[(y0 * sw + x1) * 4 + c] * fx;
        const bot = sd[(y1 * sw + x0) * 4 + c] * (1 - fx) + sd[(y1 * sw + x1) * 4 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { width, height, data: out };
}

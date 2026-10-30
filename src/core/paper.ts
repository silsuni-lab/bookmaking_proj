export interface RawImage { width: number; height: number; data: Uint8ClampedArray } // RGBA
export interface PaperResult { image: RawImage; normalized: RawImage }

const BLOCK = 32;
const PERCENTILE = 0.9;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Per-block 90th-percentile of each channel -> Float32Array [blocksY][blocksX][3]. */
function blockPaperColors(src: RawImage, bxN: number, byN: number): Float32Array {
  const { width, height, data } = src;
  const out = new Float32Array(bxN * byN * 3);
  const hist = new Uint32Array(256 * 3);
  for (let by = 0; by < byN; by++) {
    const y0 = by * BLOCK, y1 = Math.min(height, y0 + BLOCK);
    for (let bx = 0; bx < bxN; bx++) {
      const x0 = bx * BLOCK, x1 = Math.min(width, x0 + BLOCK);
      hist.fill(0);
      for (let y = y0; y < y1; y++) {
        let i = (y * width + x0) * 4;
        for (let x = x0; x < x1; x++, i += 4) {
          hist[data[i]]++; hist[256 + data[i + 1]]++; hist[512 + data[i + 2]]++;
        }
      }
      const target = Math.ceil((x1 - x0) * (y1 - y0) * PERCENTILE);
      for (let c = 0; c < 3; c++) {
        let acc = 0, v = 0;
        for (; v < 255; v++) { acc += hist[c * 256 + v]; if (acc >= target) break; }
        out[(by * bxN + bx) * 3 + c] = Math.max(1, v);
      }
    }
  }
  return out;
}

/** Linear interpolation taps between block centres along one axis. */
function axisTaps(size: number, blocks: number) {
  const i0 = new Int32Array(size), i1 = new Int32Array(size), f = new Float32Array(size);
  for (let p = 0; p < size; p++) {
    const g = Math.min(blocks - 1, Math.max(0, (p - BLOCK / 2) / BLOCK));
    const a = Math.floor(g);
    i0[p] = a; i1[p] = Math.min(blocks - 1, a + 1); f[p] = g - a;
  }
  return { i0, i1, f };
}

export function removePaper(src: RawImage, strength: number): PaperResult {
  const { width, height } = src;
  const s = src.data;
  const bxN = Math.max(1, Math.ceil(width / BLOCK));
  const byN = Math.max(1, Math.ceil(height / BLOCK));
  const bg = blockPaperColors(src, bxN, byN);
  const tx = axisTaps(width, bxN);
  const ty = axisTaps(height, byN);

  const t0 = 6 + 40 * strength;
  const t1 = t0 + 120;

  const out = new Uint8ClampedArray(width * height * 4);
  const norm = new Uint8ClampedArray(width * height * 4);
  const bgc = [0, 0, 0];

  for (let y = 0; y < height; y++) {
    const ra = ty.i0[y] * bxN, rb = ty.i1[y] * bxN, fy = ty.f[y];
    for (let x = 0; x < width; x++) {
      const fx = tx.f[x];
      const a00 = (ra + tx.i0[x]) * 3, a01 = (ra + tx.i1[x]) * 3;
      const a10 = (rb + tx.i0[x]) * 3, a11 = (rb + tx.i1[x]) * 3;
      const o = (y * width + x) * 4;
      let ink = 0;
      for (let c = 0; c < 3; c++) {
        const top = bg[a00 + c] + (bg[a01 + c] - bg[a00 + c]) * fx;
        const bot = bg[a10 + c] + (bg[a11 + c] - bg[a10 + c]) * fx;
        bgc[c] = top + (bot - top) * fy;
        let n = (s[o + c] / bgc[c]) * 255;
        if (n > 255) n = 255;
        norm[o + c] = n;
        const d = 255 - norm[o + c];
        if (d > ink) ink = d;
      }
      norm[o + 3] = 255;
      const a = smoothstep(t0, t1, ink);
      out[o + 3] = Math.round(a * 255);
      if (a >= 0.02) {
        const off = (1 - a) * 255;
        for (let c = 0; c < 3; c++) out[o + c] = (norm[o + c] - off) / a;
      }
    }
  }
  return {
    image: { width, height, data: out },
    normalized: { width, height, data: norm },
  };
}

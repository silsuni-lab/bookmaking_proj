import { describe, expect, test } from 'vitest';
import { removePaper, type RawImage } from '../../src/core/paper';

type Rgb = [number, number, number];
interface Rect { x: number; y: number; width: number; height: number }

function fill(width: number, height: number, rgb: Rgb): RawImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}
function paint(img: RawImage, r: Rect, rgb: Rgb): void {
  for (let y = r.y; y < r.y + r.height; y++)
    for (let x = r.x; x < r.x + r.width; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
    }
}
function shadowGradient(w: number, h: number): RawImage {
  const img = fill(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = Math.round(150 + (95 * x) / (w - 1));
      const i = (y * w + x) * 4;
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    }
  return img;
}
function pixel(img: RawImage, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return { r: img.data[i], g: img.data[i + 1], b: img.data[i + 2], a: img.data[i + 3] };
}
function maxAlpha(img: RawImage): number {
  let m = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > m) m = img.data[i];
  return m;
}

describe('removePaper', () => {
  test('plain paper becomes transparent', () => {
    const r = removePaper(fill(64, 64, [243, 234, 210]), 0.5);
    expect(maxAlpha(r.image)).toBeLessThan(10);
  });
  test('shadowed paper (brightness 150→245 gradient) becomes transparent', () => {
    expect(maxAlpha(removePaper(shadowGradient(128, 128), 0.5).image)).toBeLessThan(10);
  });
  test('dark stroke stays opaque with its colour', () => {
    const img = fill(64, 64, [240, 232, 205]);
    paint(img, { x: 20, y: 0, width: 6, height: 64 }, [200, 30, 30]);
    const px = pixel(removePaper(img, 0.5).image, 22, 32);
    expect(px.a).toBeGreaterThan(240);
    expect(px.r).toBeGreaterThan(px.g + 100);
  });
  test('pale crayon is kept partially (손맛)', () => {
    const img = fill(64, 64, [245, 242, 235]);
    paint(img, { x: 10, y: 10, width: 20, height: 20 }, [245, 225, 140]);
    const a = pixel(removePaper(img, 0.5).image, 20, 20).a;
    expect(a).toBeGreaterThan(60);
    expect(a).toBeLessThan(255);
  });
  test('higher strength removes more', () => {
    const img = fill(64, 64, [245, 242, 235]);
    paint(img, { x: 10, y: 10, width: 20, height: 20 }, [230, 220, 190]);
    expect(pixel(removePaper(img, 0.9).image, 20, 20).a).toBeLessThan(pixel(removePaper(img, 0.2).image, 20, 20).a);
  });
  test('normalized is opaque and src is not mutated', () => {
    const img = fill(40, 40, [240, 232, 205]);
    paint(img, { x: 5, y: 5, width: 8, height: 8 }, [200, 30, 30]);
    const copy = new Uint8ClampedArray(img.data);
    const r = removePaper(img, 0.5);
    expect(Array.from(img.data)).toEqual(Array.from(copy));
    for (let i = 3; i < r.normalized.data.length; i += 4) expect(r.normalized.data[i]).toBe(255);
  });
  test('image smaller than one block works', () => {
    const r = removePaper(fill(5, 3, [240, 240, 240]), 0.5);
    expect(r.image.width).toBe(5);
    expect(maxAlpha(r.image)).toBeLessThan(10);
  });
  test('large dark fill survives', () => {
    const img = fill(1200, 1200, [243, 234, 210]);
    paint(img, { x: 400, y: 400, width: 400, height: 400 }, [230, 120, 60]);
    expect(pixel(removePaper(img, 0.5).image, 600, 600).a).toBeGreaterThan(240);
  });
  test('large pale crayon fill survives', () => {
    const img = fill(1200, 1200, [243, 234, 210]);
    paint(img, { x: 400, y: 400, width: 400, height: 400 }, [250, 230, 120]);
    expect(pixel(removePaper(img, 0.5).image, 600, 600).a).toBeGreaterThan(100);
  });
  test('large image under 3s', () => {
    const img = fill(4000, 3000, [240, 232, 205]);
    const t = Date.now();
    removePaper(img, 0.5);
    expect(Date.now() - t).toBeLessThan(3000);
  }, 3000);
});

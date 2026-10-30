// Generates e2e/fixtures/drawing.jpg (synthetic crayon drawing on yellowish paper)
// and e2e/fixtures/photo-rotated.jpg (landscape-stored JPEG with EXIF Orientation=6, i.e. displays portrait).
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures');
const out = resolve(fixtureDir, 'drawing.jpg');
const browser = await chromium.launch();
const page = await browser.newPage();
const dataUrl = await page.evaluate(() => {
  const W = 1600, H = 1200;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.fillStyle = 'rgb(243,234,210)';
  ctx.fillRect(0, 0, W, H);
  const crayon = (color, draw) => {
    ctx.save(); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    draw(); ctx.restore();
  };
  // thick strokes
  crayon('rgb(214,60,50)', () => { ctx.lineWidth = 26; ctx.beginPath(); ctx.moveTo(250, 300); ctx.bezierCurveTo(450, 150, 700, 450, 900, 280); ctx.stroke(); });
  crayon('rgb(40,110,200)', () => { ctx.lineWidth = 30; ctx.beginPath(); ctx.moveTo(300, 900); ctx.bezierCurveTo(500, 1050, 800, 800, 1100, 950); ctx.stroke(); });
  crayon('rgb(40,150,70)', () => { ctx.lineWidth = 22; ctx.beginPath(); ctx.moveTo(1000, 200); ctx.lineTo(1350, 420); ctx.stroke(); });
  // large filled crayon area (sun)
  crayon('rgb(245,170,30)', () => { ctx.beginPath(); ctx.arc(1050, 700, 190, 0, Math.PI * 2); ctx.fill(); });
  // waxy texture: speckles that let the paper show through inside the strokes
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const paper = d[i] === 243 && d[i + 1] === 234 && d[i + 2] === 210;
      const n = (rnd() - 0.5) * 24;
      if (!paper && rnd() < 0.12) { d[i] += 40; d[i + 1] += 40; d[i + 2] += 30; }
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
      // vignette + uneven lighting shadow
      const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
      const v = 1 - 0.28 * (dx * dx + dy * dy) - 0.12 * (x / W);
      d[i] *= v; d[i + 1] *= v; d[i + 2] *= v;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/jpeg', 0.9);
});
const rotatedUrl = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 1200; c.height = 800; // stored landscape
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 1200, 800);
  g.addColorStop(0, 'rgb(120,190,240)'); g.addColorStop(1, 'rgb(250,220,150)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = 'rgb(60,160,80)'; ctx.fillRect(0, 600, 1200, 200);
  ctx.fillStyle = 'rgb(240,90,60)'; ctx.beginPath(); ctx.arc(300, 300, 120, 0, Math.PI * 2); ctx.fill();
  return c.toDataURL('image/jpeg', 0.9);
});
await browser.close();
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote', out);

// EXIF APP1 with a single IFD0 entry: Orientation (0x0112) = 6 (rotate 90 CW), big-endian TIFF.
const exif = Buffer.from([
  0xff, 0xe1, 0x00, 0x22, // APP1, length 34
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF header, IFD0 at offset 8
  0x00, 0x01, // 1 entry
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation, SHORT, count 1, value 6
  0x00, 0x00, 0x00, 0x00, // no next IFD
]);
const jpeg = Buffer.from(rotatedUrl.split(',')[1], 'base64');
writeFileSync(resolve(fixtureDir, 'photo-rotated.jpg'), Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]));
console.log('wrote photo-rotated.jpg');

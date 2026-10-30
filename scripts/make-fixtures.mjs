// Generates e2e/fixtures/drawing.jpg: a synthetic phone-photo-like crayon drawing on yellowish paper.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures/drawing.jpg');
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
await browser.close();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote', out);

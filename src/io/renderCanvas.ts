import { adjustPixels } from '../core/adjust';
import type { ImageAdjust } from '../core/adjust';
import type { planItem } from '../core/drawPlan';
import type { Rect } from '../core/geometry';

const LINE_HEIGHT = 1.3;

type Drawable = HTMLImageElement | ImageBitmap | OffscreenCanvas | HTMLCanvasElement;

const adjusted = new WeakMap<object, Map<string, OffscreenCanvas>>();

/**
 * Colour-adjusted copy of a drawing, at most maxSide px on its long side (never upscaled).
 * Keeps the two most recent variants per image so slider moves and redraws reuse them.
 */
export function adjustedImage(img: Drawable, adjust: ImageAdjust, maxSide: number): OffscreenCanvas {
  const w0 = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h0 = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
  const key = `${adjust.brightness}|${adjust.contrast}|${adjust.saturation}|${adjust.toWhite ? 'w' : ''}|${w}x${h}`;
  let variants = adjusted.get(img);
  const hit = variants?.get(key);
  if (hit) return hit;
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  adjustPixels(data.data, adjust);
  ctx.putImageData(data, 0, 0);
  if (!variants) adjusted.set(img, (variants = new Map()));
  variants.set(key, canvas);
  if (variants.size > 2) variants.delete(variants.keys().next().value!);
  return canvas;
}

function rotateAboutTopLeft(ctx: OffscreenCanvasRenderingContext2D, rect: Rect, rotation: number): void {
  ctx.translate(rect.x, rect.y);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-rect.x, -rect.y);
}

/** Limits drawing to the rect (in the already-rotated space) so overflowing text lines are hidden. */
function clipToRect(ctx: OffscreenCanvasRenderingContext2D, r: Rect): void {
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.width, r.height);
  ctx.clip();
}

function roundedRect(ctx: OffscreenCanvasRenderingContext2D, r: Rect, radius: number): void {
  const rad = Math.min(radius, r.width / 2, r.height / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.width, r.y, r.x + r.width, r.y + r.height, rad);
  ctx.arcTo(r.x + r.width, r.y + r.height, r.x, r.y + r.height, rad);
  ctx.arcTo(r.x, r.y + r.height, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.width, r.y, rad);
  ctx.closePath();
}

function wrapLines(ctx: OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of Array.from(para)) {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        // prefer breaking at the last space when the line holds one
        const sp = line.lastIndexOf(' ');
        if (ch !== ' ' && sp > 0) {
          lines.push(line.slice(0, sp));
          line = line.slice(sp + 1) + ch;
        } else {
          lines.push(line);
          line = ch === ' ' ? '' : ch;
        }
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderOps(
  plan: ReturnType<typeof planItem>,
  bitmaps: ReadonlyMap<string, Drawable>,
  pxPerMm: number,
): Promise<OffscreenCanvas> {
  const canvas = new OffscreenCanvas(Math.round(plan.widthMm * pxPerMm), Math.round(plan.heightMm * pxPerMm));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.scale(pxPerMm, pxPerMm);

  for (const op of plan.ops) {
    ctx.save();
    switch (op.op) {
      case 'fill':
        ctx.fillStyle = op.color;
        ctx.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
        break;
      case 'image': {
        const bmp = bitmaps.get(op.assetId);
        if (bmp) {
          rotateAboutTopLeft(ctx, op.dest, op.rotation);
          const d = op.dest;
          if (op.src) {
            const s = op.src;
            ctx.drawImage(bmp, s.x, s.y, s.width, s.height, d.x, d.y, d.width, d.height);
          } else {
            const img = op.adjust ? adjustedImage(bmp, op.adjust, Math.ceil(Math.max(d.width, d.height) * pxPerMm)) : bmp;
            if (op.flipX) {
              // mirror inside the element box, like the editor's flipped Konva image
              ctx.translate(2 * d.x + d.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(img, d.x, d.y, d.width, d.height);
          }
        }
        break;
      }
      case 'backdrop': {
        rotateAboutTopLeft(ctx, op.rect, op.rotation);
        ctx.translate(op.rect.x, op.rect.y);
        const path = new Path2D(op.path);
        ctx.fillStyle = op.color;
        ctx.fill(path);
        if (op.stroke) {
          ctx.strokeStyle = op.stroke.color;
          ctx.lineWidth = op.stroke.widthMm;
          ctx.lineJoin = 'round';
          ctx.stroke(path);
        }
        break;
      }
      case 'band':
        rotateAboutTopLeft(ctx, op.rect, op.rotation);
        clipToRect(ctx, op.rect);
        ctx.fillStyle = op.color;
        roundedRect(ctx, op.rect, op.radiusMm);
        ctx.fill();
        break;
      case 'text': {
        rotateAboutTopLeft(ctx, op.rect, op.rotation);
        clipToRect(ctx, op.rect);
        const fontMm = (op.fontSizePt * 25.4) / 72;
        if (typeof document !== 'undefined') {
          await document.fonts.load(`${fontMm * pxPerMm}px ${op.font}`, op.text);
        }
        ctx.font = `${fontMm}px ${op.font}`;
        ctx.fillStyle = op.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const lines = wrapLines(ctx, op.text, op.rect.width);
        const lh = fontMm * LINE_HEIGHT;
        const cx = op.rect.x + op.rect.width / 2;
        // Like Konva, drop lines that do not fully fit so print matches the editor.
        lines.forEach((l, i) => {
          if (i * lh + lh <= op.rect.height + 1e-6) ctx.fillText(l, cx, op.rect.y + i * lh + (lh - fontMm) / 2);
        });
        break;
      }
    }
    ctx.restore();
  }
  return canvas;
}

import type { planItem } from '../core/drawPlan';
import type { Rect } from '../core/geometry';

const LINE_HEIGHT = 1.3;

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
  bitmaps: Map<string, ImageBitmap>,
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
            ctx.drawImage(bmp, d.x, d.y, d.width, d.height);
          }
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
        lines.forEach((l, i) => ctx.fillText(l, cx, op.rect.y + i * lh + (lh - fontMm) / 2));
        break;
      }
    }
    ctx.restore();
  }
  return canvas;
}

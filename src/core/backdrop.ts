/** A colour box or speech bubble drawn behind a drawing or handwriting to make it stand out. */
export interface Backdrop {
  shape: 'box' | 'bubble';
  color: string;
  /** Bubble only: which bottom corner the tail points from (default left). */
  tail?: 'left' | 'right';
}

export const BACKDROP_PAD_MM = 3;
export const BACKDROP_COLORS = ['#FFFFFF', '#FFF4B8', '#FFD9E0', '#D6ECFF', '#DFF5D8'];
export const BUBBLE_STROKE = { color: '#333333', widthMm: 0.6 };

const f = (n: number) => +n.toFixed(2);

/**
 * SVG path (mm, relative to the element's top-left) of the backdrop: the element box padded on every side,
 * with rounded corners, plus a tail below for a bubble. Konva and the PDF renderer both draw this string.
 */
export function backdropPath(b: Backdrop, w: number, h: number): string {
  const p = BACKDROP_PAD_MM;
  const x0 = -p, y0 = -p, x1 = w + p, y1 = h + p;
  const W = x1 - x0, H = y1 - y0;
  const r = b.shape === 'box' ? Math.min(4, W / 4, H / 4) : Math.min(W, H) * 0.25;
  const parts = [
    `M${f(x0 + r)},${f(y0)}`, `L${f(x1 - r)},${f(y0)}`, `Q${f(x1)},${f(y0)} ${f(x1)},${f(y0 + r)}`,
    `L${f(x1)},${f(y1 - r)}`, `Q${f(x1)},${f(y1)} ${f(x1 - r)},${f(y1)}`,
  ];
  if (b.shape === 'bubble') {
    // tail on the bottom edge (drawn right to left), tip below and toward the outer corner
    const base = Math.min(W * 0.15, 12);
    const inset = Math.max(r, W * 0.2);
    const tailH = Math.min(12, Math.max(4, H * 0.3));
    const right = b.tail === 'right';
    const a = right ? x1 - inset - base : x0 + inset;
    const tipX = right ? x1 - W * 0.08 : x0 + W * 0.08;
    parts.push(`L${f(a + base)},${f(y1)}`, `L${f(tipX)},${f(y1 + tailH)}`, `L${f(a)},${f(y1)}`);
  }
  parts.push(
    `L${f(x0 + r)},${f(y1)}`, `Q${f(x0)},${f(y1)} ${f(x0)},${f(y1 - r)}`,
    `L${f(x0)},${f(y0 + r)}`, `Q${f(x0)},${f(y0)} ${f(x0 + r)},${f(y0)}`, 'Z',
  );
  return parts.join(' ');
}

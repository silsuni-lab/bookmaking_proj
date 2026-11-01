import { describe, expect, it } from 'vitest';
import { BACKDROP_PAD_MM, backdropPath } from '../../src/core/backdrop';

/** All x,y pairs of an SVG path made of M/L/Q/Z commands. */
function points(d: string): { x: number; y: number }[] {
  const nums = d.replace(/[MLQZ]/g, ' ').trim().split(/[\s,]+/).filter(Boolean).map(Number);
  const out = [];
  for (let i = 0; i < nums.length; i += 2) out.push({ x: nums[i], y: nums[i + 1] });
  return out;
}

describe('backdropPath', () => {
  it('box: a closed shape padded around the element and nothing below it', () => {
    const d = backdropPath({ shape: 'box', color: '#fff' }, 40, 20);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    const ps = points(d);
    expect(Math.min(...ps.map((p) => p.x))).toBeCloseTo(-BACKDROP_PAD_MM);
    expect(Math.max(...ps.map((p) => p.y))).toBeCloseTo(20 + BACKDROP_PAD_MM);
  });
  it('bubble: has a tail below the box on the chosen side', () => {
    const left = points(backdropPath({ shape: 'bubble', color: '#fff', tail: 'left' }, 40, 20));
    const right = points(backdropPath({ shape: 'bubble', color: '#fff', tail: 'right' }, 40, 20));
    const tip = (ps: { x: number; y: number }[]) => ps.reduce((a, b) => (b.y > a.y ? b : a));
    expect(tip(left).y).toBeGreaterThan(20 + BACKDROP_PAD_MM + 3);
    expect(tip(left).x).toBeLessThan(20);
    expect(tip(right).x).toBeGreaterThan(20);
  });
});

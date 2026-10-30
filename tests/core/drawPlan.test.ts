import { describe, it, expect } from 'vitest';
import { planItem } from '../../src/core/drawPlan';
import { PAGE_SIZES, newItem } from '../../src/core/model';
import type { TextElement } from '../../src/core/model';

describe('planItem', () => {
  it('full: white fill then cover-fit background over the bleed canvas', () => {
    const item = newItem('full');
    item.backgroundAssetId = 'bg';
    const plan = planItem(item, PAGE_SIZES.sq200, { bg: { widthPx: 4000, heightPx: 3000 } });
    expect(plan.widthMm).toBe(206);
    expect(plan.heightMm).toBe(206);
    expect(plan.ops[0]).toEqual({ op: 'fill', color: '#FFFFFF', rect: { x: 0, y: 0, width: 206, height: 206 } });
    expect(plan.ops[1]).toEqual({
      op: 'image',
      assetId: 'bg',
      src: { x: 500, y: 0, width: 3000, height: 3000 },
      dest: { x: 0, y: 0, width: 206, height: 206 },
      rotation: 0,
    });
  });

  it('text with band: band op directly before text op, shifted by bleed', () => {
    const item = newItem('full');
    const t: TextElement = {
      id: 't', kind: 'text', x: 10, y: 20, width: 50, height: 20, rotation: 0,
      text: 'hi', fontSizePt: 14, color: '#222222', band: true,
    };
    item.elements.push(t);
    const { ops } = planItem(item, PAGE_SIZES.sq200, {});
    const ti = ops.findIndex((o) => o.op === 'text');
    expect(ops[ti - 1]).toEqual({
      op: 'band', rect: { x: 13, y: 23, width: 50, height: 20 }, color: 'rgba(255,255,255,0.75)', radiusMm: 2,
    });
    expect(ops[ti]).toMatchObject({ op: 'text', rect: { x: 13, y: 23, width: 50, height: 20 }, font: 'Gaegu' });
  });

  it('image element: whole image, shifted by bleed, skipped if asset unknown', () => {
    const item = newItem('full');
    item.elements.push(
      { id: 'a', kind: 'image', assetId: 'x', role: 'drawing', x: 5, y: 6, width: 10, height: 12, rotation: 30 },
      { id: 'b', kind: 'image', assetId: 'missing', role: 'drawing', x: 0, y: 0, width: 1, height: 1, rotation: 0 },
    );
    const { ops } = planItem(item, PAGE_SIZES.sq200, { x: { widthPx: 10, heightPx: 10 } });
    expect(ops).toHaveLength(2);
    expect(ops[1]).toEqual({
      op: 'image', assetId: 'x', src: null, dest: { x: 8, y: 9, width: 10, height: 12 }, rotation: 30,
    });
  });

  it('spread photoSide left: photo covers outer bleed + left page, cream the rest', () => {
    const item = newItem('spread');
    item.backgroundAssetId = 'p';
    item.photoSide = 'left';
    const plan = planItem(item, PAGE_SIZES.a4p, { p: { widthPx: 2130, heightPx: 3030 } });
    expect(plan.widthMm).toBe(426);
    expect(plan.heightMm).toBe(303);
    const img = plan.ops.find((o) => o.op === 'image');
    expect(img).toMatchObject({ dest: { x: 0, y: 0, width: 213, height: 303 } });
    expect(plan.ops).toContainEqual({ op: 'fill', color: '#FFFDF5', rect: { x: 213, y: 0, width: 213, height: 303 } });
  });

  it('spread photoSide right mirrors', () => {
    const item = newItem('spread');
    item.backgroundAssetId = 'p';
    item.photoSide = 'right';
    const plan = planItem(item, PAGE_SIZES.a4p, { p: { widthPx: 2130, heightPx: 3030 } });
    expect(plan.ops.find((o) => o.op === 'image')).toMatchObject({ dest: { x: 213, y: 0, width: 213, height: 303 } });
    expect(plan.ops).toContainEqual({ op: 'fill', color: '#FFFDF5', rect: { x: 0, y: 0, width: 213, height: 303 } });
  });

  it('blank: a single white fill', () => {
    const { ops } = planItem(newItem('blank'), PAGE_SIZES.sq200, {});
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ op: 'fill', color: '#FFFFFF' });
  });
});

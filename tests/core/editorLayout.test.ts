import { describe, expect, it } from 'vitest';
import { fitScale, foldScale, newImageElement, newTextElement, pageLabelOf, placementArea } from '../../src/core/editorLayout';
import { newItem, PAGE_SIZES } from '../../src/core/model';

const size = PAGE_SIZES.sq200;

describe('editorLayout', () => {
  it('fitScale fits the limiting dimension', () => {
    expect(fitScale(1000, 400, 200, 200)).toBe(2);
    expect(fitScale(0, 0, 200, 200)).toBe(1);
  });
  it('places a drawing centred at 50% width keeping aspect', () => {
    const e = newImageElement(newItem('full'), size, 'a', 'drawing', 2);
    expect(e.width).toBe(100);
    expect(e.height).toBe(50);
    expect(e.x).toBe(50);
    expect(e.y).toBe(75);
  });
  it('limits a very tall drawing to the page', () => {
    const e = newImageElement(newItem('full'), size, 'a', 'drawing', 0.25);
    expect(e.height).toBeCloseTo(180);
    expect(e.width).toBeCloseTo(45);
  });
  it('puts drawings on the photo side of a spread', () => {
    const it = { ...newItem('spread'), photoSide: 'right' as const };
    expect(placementArea(it, size).x).toBe(200);
    expect(newImageElement(it, size, 'a', 'drawing', 1).x).toBe(250);
  });
  it('puts text and handwriting on the cream (non-photo) side of a spread', () => {
    const it = { ...newItem('spread'), photoSide: 'right' as const };
    expect(placementArea(it, size, 'text').x).toBe(0);
    const t = newTextElement(it, size);
    expect(t.width).toBe(160);
    expect(t.x).toBe(20);
    expect(t.y + t.height).toBeCloseTo(190);
    const h = newImageElement(it, size, 'a', 'handwriting', 2);
    expect(h.x).toBe(20);
    const left = newTextElement({ ...it, photoSide: 'left' }, size);
    expect(left.x).toBe(220);
  });
  it('folds scale into size', () => {
    expect(foldScale(10, 20, 2, -0.5)).toEqual({ width: 20, height: 10 });
  });
  it('labels pages', () => {
    const a = newItem('full');
    const b = newItem('spread');
    expect(pageLabelOf({ kind: 'cover', which: 'back' }, [])).toBe('뒤표지');
    expect(pageLabelOf({ kind: 'item', id: b.id }, [a, b])).toBe('2쪽');
  });
});

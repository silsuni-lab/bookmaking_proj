import { describe, expect, test } from 'vitest';
import { PAGE_SIZES, itemCanvasMm, newBook, newItem } from '../../src/core/model';

describe('model', () => {
  test('page sizes', () => {
    expect(PAGE_SIZES.sq200).toMatchObject({ widthMm: 200, heightMm: 200 });
    expect(PAGE_SIZES.a4l).toMatchObject({ widthMm: 297, heightMm: 210 });
    expect(PAGE_SIZES.a5p).toMatchObject({ widthMm: 148, heightMm: 210 });
  });
  test('spread canvas is double width', () => {
    expect(itemCanvasMm(newItem('spread'), PAGE_SIZES.a4l)).toEqual({ widthMm: 594, heightMm: 210 });
    expect(itemCanvasMm(newItem('full'), PAGE_SIZES.a4l)).toEqual({ widthMm: 297, heightMm: 210 });
  });
  test('newBook has cover front/back as full items and no interior pages', () => {
    const b = newBook('sq200', '우리 공원', '하린');
    expect(b.cover.front.layout).toBe('full');
    expect(b.cover.back.layout).toBe('full');
    expect(b.items).toEqual([]);
    expect(b.cover.front.elements.map(e => e.kind === 'text' && e.text)).toEqual(['우리 공원', '글·그림 하린']);
  });
});

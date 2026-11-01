import { describe, expect, test } from 'vitest';
import { PAGE_SIZES, itemCanvasMm, newBook, newItem, referencedAssetIds, withLibrary } from '../../src/core/model';
import type { ImageElement } from '../../src/core/model';

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

describe('withLibrary', () => {
  const img = (id: string, assetId: string, role: 'drawing' | 'handwriting'): ImageElement => ({
    id, kind: 'image', assetId, role, x: 0, y: 0, width: 1, height: 1, rotation: 0,
  });
  test('an old book gets a library of the drawings already on its pages, once per asset', () => {
    const book = newBook('sq200', 't', 'c');
    delete book.library; // saved before the collection existed
    book.cover.front.elements.push(img('a', 'cut1', 'drawing'));
    const page = newItem('full');
    page.elements.push(img('b', 'cut1', 'drawing'), { ...img('c', 'cut2', 'handwriting'), cleanup: { sourceAssetId: 's', quad: null, strength: 0.5, maskAssetId: null } });
    book.items.push(page);
    const lib = withLibrary(book).library!;
    expect(lib.map((l) => [l.assetId, l.role])).toEqual([['cut1', 'drawing'], ['cut2', 'handwriting']]);
    expect(lib[1].cleanup?.sourceAssetId).toBe('s');
  });
  test('a book that has a library is returned unchanged', () => {
    const book = { ...newBook('sq200', 't', 'c'), library: [] };
    expect(withLibrary(book)).toBe(book);
    expect(newBook('sq200').library).toEqual([]);
  });
});

describe('referencedAssetIds', () => {
  test('keeps drawings saved in the library even when no page uses them', () => {
    const book = newBook('sq200', 't', 'c');
    book.library = [{ id: 'l', assetId: 'cut', role: 'drawing', cleanup: { sourceAssetId: 'src', quad: null, strength: 0.5, maskAssetId: null } }];
    expect([...referencedAssetIds(book)].sort()).toEqual(['cut', 'src']);
  });
  test('keeps the original photo and touch-up mask of a drawing', () => {
    const book = newBook('sq200', 't', 'c');
    book.cover.front.elements.push({
      id: 'e', kind: 'image', assetId: 'cut', role: 'drawing', x: 0, y: 0, width: 1, height: 1, rotation: 0,
      cleanup: { sourceAssetId: 'src', quad: null, strength: 0.5, maskAssetId: 'm' },
    });
    expect([...referencedAssetIds(book)].sort()).toEqual(['cut', 'm', 'src']);
  });
  test('collects background and image-element asset ids from covers and items', () => {
    const book = newBook('sq200', 't', 'c');
    book.cover.front.backgroundAssetId = 'f';
    const it1 = newItem('full');
    it1.backgroundAssetId = 'bg';
    it1.elements.push({ id: 'e', kind: 'image', assetId: 'cut', role: 'drawing', x: 0, y: 0, width: 1, height: 1, rotation: 0 });
    const it2 = newItem('blank');
    book.items.push(it1, it2);
    book.cover.back.elements.push({ id: 'h', kind: 'image', assetId: 'hw', role: 'handwriting', x: 0, y: 0, width: 1, height: 1, rotation: 0 });
    expect([...referencedAssetIds(book)].sort()).toEqual(['bg', 'cut', 'f', 'hw']);
  });
});

import { describe, it, expect } from 'vitest';
import { checkBook, issueText } from '../../src/core/validate';
import { newBook, newItem } from '../../src/core/model';
import type { ImageElement } from '../../src/core/model';

describe('checkBook', () => {
  it('errors when there are no interior pages, then warns about cover backgrounds', () => {
    const issues = checkBook(newBook('sq200'), {});
    expect(issues[0]).toEqual({ level: 'error', code: 'no-pages' });
    expect(issues.slice(1)).toEqual([
      { level: 'warn', code: 'no-background', ref: { kind: 'cover', which: 'front' } },
      { level: 'warn', code: 'no-background', ref: { kind: 'cover', which: 'back' } },
    ]);
  });

  it('flags low-res backgrounds with rounded dpi, once per ref and asset', () => {
    const book = newBook('sq200');
    const it1 = newItem('full');
    it1.backgroundAssetId = 'bg';
    book.items.push(it1);
    const issues = checkBook(book, { bg: { widthPx: 1200, heightPx: 1200 } });
    expect(issues).toContainEqual({ level: 'warn', code: 'low-res', ref: { kind: 'item', id: it1.id }, assetId: 'bg', dpi: 148 });
    expect(issues.filter(i => i.code === 'low-res' && i.ref.kind === 'item')).toHaveLength(1);
    expect(issues.some(i => i.code === 'no-pages')).toBe(false);
  });

  it('flags low-res elements and no-background only for full/spread, never blank', () => {
    const book = newBook('sq200');
    const full = newItem('full');
    const el: ImageElement = { id: 'e', kind: 'image', assetId: 'cut', role: 'drawing', x: 0, y: 0, width: 100, height: 100, rotation: 0 };
    full.elements.push(el, { ...el, id: 'e2' });
    const spread = newItem('spread');
    const blank = newItem('blank');
    book.items.push(blank, spread, full);
    const issues = checkBook(book, { cut: { widthPx: 500, heightPx: 500 } });
    const low = issues.filter(i => i.code === 'low-res');
    expect(low).toEqual([{ level: 'warn', code: 'low-res', ref: { kind: 'item', id: full.id }, assetId: 'cut', dpi: 127 }]);
    const nb = issues.filter(i => i.code === 'no-background').map(i => (i as { ref: unknown }).ref);
    expect(nb).toContainEqual({ kind: 'item', id: spread.id });
    expect(nb).toContainEqual({ kind: 'item', id: full.id });
    expect(nb).not.toContainEqual({ kind: 'item', id: blank.id });
    expect(issues.some(i => i.code === 'misaligned-spread')).toBe(false);
  });

  it('flags a spread that starts on the right-hand page', () => {
    const book = newBook('sq200');
    const spread = newItem('spread');
    book.items.push(spread);
    const issues = checkBook(book, {});
    expect(issues).toContainEqual({ level: 'warn', code: 'misaligned-spread', ref: { kind: 'item', id: spread.id } });
  });
});

describe('issueText', () => {
  it('formats Korean messages', () => {
    const ref = { kind: 'cover', which: 'front' } as const;
    expect(issueText({ level: 'error', code: 'no-pages' }, '')).toBe('아직 내지가 한 쪽도 없어요.');
    expect(issueText({ level: 'warn', code: 'no-background', ref }, '앞표지')).toBe('앞표지: 배경 사진이 없어요. 흰 바탕으로 인쇄돼요.');
    expect(issueText({ level: 'warn', code: 'low-res', ref, assetId: 'a', dpi: 148 }, '2쪽')).toBe('2쪽: 사진이 작아서 인쇄하면 흐릿할 수 있어요 (약 148dpi).');
    expect(issueText({ level: 'warn', code: 'misaligned-spread', ref }, '3쪽')).toBe('3쪽: 펼침면이 오른쪽 면에서 시작해요. 앞에 빈 쪽을 넣어 주세요.');
  });
});

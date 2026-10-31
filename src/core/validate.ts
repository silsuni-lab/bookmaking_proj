import { itemCanvasMm, PAGE_SIZES } from './model';
import type { Book, ItemRef, PageElement, PageItem } from './model';
import { planItem } from './drawPlan';
import type { AssetDims } from './drawPlan';
import { DPI_WARN, effectiveDpi } from './geometry';
import { misalignedSpreads } from './pagination';

export type Issue =
  | { level: 'error'; code: 'no-pages' }
  | { level: 'warn'; code: 'no-background'; ref: ItemRef }
  | { level: 'warn'; code: 'low-res'; ref: ItemRef; assetId: string; dpi: number }
  | { level: 'warn'; code: 'misaligned-spread'; ref: ItemRef }
  | { level: 'warn'; code: 'off-page'; ref: ItemRef };

/** True when the element's (rotated, about its top-left) box does not overlap the w×h trim canvas at all. */
function isOffPage(e: PageElement, w: number, h: number): boolean {
  const r = (e.rotation * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  const xs = [0, e.width * cos, e.width * cos - e.height * sin, -e.height * sin].map((d) => e.x + d);
  const ys = [0, e.width * sin, e.width * sin + e.height * cos, e.height * cos].map((d) => e.y + d);
  return Math.max(...xs) <= 0 || Math.min(...xs) >= w || Math.max(...ys) <= 0 || Math.min(...ys) >= h;
}

export function checkBook(book: Book, dims: AssetDims): Issue[] {
  const size = PAGE_SIZES[book.sizeId];
  const issues: Issue[] = [];
  if (book.items.length === 0) issues.push({ level: 'error', code: 'no-pages' });

  const misaligned = new Set(misalignedSpreads(book.items));
  const check = (item: PageItem, ref: ItemRef) => {
    if (item.layout !== 'blank' && !item.backgroundAssetId) {
      issues.push({ level: 'warn', code: 'no-background', ref });
    }
    const seen = new Set<string>();
    for (const op of planItem(item, size, dims).ops) {
      if (op.op !== 'image' || seen.has(op.assetId)) continue;
      seen.add(op.assetId);
      const srcPx = op.src ? op.src.width : dims[op.assetId].widthPx;
      const dpi = effectiveDpi(srcPx, op.dest.width);
      if (dpi < DPI_WARN) issues.push({ level: 'warn', code: 'low-res', ref, assetId: op.assetId, dpi: Math.round(dpi) });
    }
    const c = itemCanvasMm(item, size);
    if (item.elements.some((e) => isOffPage(e, c.widthMm, c.heightMm))) issues.push({ level: 'warn', code: 'off-page', ref });
    if (misaligned.has(item.id)) issues.push({ level: 'warn', code: 'misaligned-spread', ref });
  };

  check(book.cover.front, { kind: 'cover', which: 'front' });
  check(book.cover.back, { kind: 'cover', which: 'back' });
  for (const it of book.items) check(it, { kind: 'item', id: it.id });
  return issues;
}

export function issueText(i: Issue, pageLabel: string): string {
  switch (i.code) {
    case 'no-pages':
      return '아직 내지가 한 쪽도 없어요.';
    case 'no-background':
      return `${pageLabel}: 배경 사진이 없어요. 흰 바탕으로 인쇄돼요.`;
    case 'low-res':
      return `${pageLabel}: 사진이 작아서 인쇄하면 흐릿할 수 있어요 (약 ${i.dpi}dpi).`;
    case 'off-page':
      return `${pageLabel}: 쪽 밖으로 나간 그림이나 글자가 있어요. 인쇄되지 않아요.`;
    case 'misaligned-spread':
      return `${pageLabel}: 펼침면이 오른쪽 면에서 시작해요. 앞에 빈 쪽을 넣어 주세요.`;
  }
}

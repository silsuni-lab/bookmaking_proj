import { PAGE_SIZES } from './model';
import type { Book, ItemRef, PageItem } from './model';
import { planItem } from './drawPlan';
import type { AssetDims } from './drawPlan';
import { DPI_WARN, effectiveDpi } from './geometry';
import { misalignedSpreads } from './pagination';

export type Issue =
  | { level: 'error'; code: 'no-pages' }
  | { level: 'warn'; code: 'no-background'; ref: ItemRef }
  | { level: 'warn'; code: 'low-res'; ref: ItemRef; assetId: string; dpi: number }
  | { level: 'warn'; code: 'misaligned-spread'; ref: ItemRef };

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
    case 'misaligned-spread':
      return `${pageLabel}: 펼침면이 오른쪽 면에서 시작해요. 앞에 빈 쪽을 넣어 주세요.`;
  }
}

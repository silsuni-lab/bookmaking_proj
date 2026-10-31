import { newItem, type PageItem } from './model';

export interface PageSlot {
  itemId: string | null; // null = auto-added blank
  pageNumber: number;
  side: 'left' | 'right';
  half: 'whole' | 'left' | 'right';
}

const sideOf = (pageNumber: number): 'left' | 'right' => (pageNumber % 2 === 1 ? 'right' : 'left');

export function paginate(items: PageItem[]): PageSlot[] {
  const slots: PageSlot[] = [];
  let n = 1;
  for (const it of items) {
    if (it.layout === 'spread') {
      slots.push({ itemId: it.id, pageNumber: n, side: sideOf(n), half: 'left' });
      n++;
      slots.push({ itemId: it.id, pageNumber: n, side: sideOf(n), half: 'right' });
      n++;
    } else {
      slots.push({ itemId: it.id, pageNumber: n, side: sideOf(n), half: 'whole' });
      n++;
    }
  }
  return slots;
}

export function misalignedSpreads(items: PageItem[]): string[] {
  return paginate(items)
    .filter(s => s.half === 'left' && s.side === 'right' && s.itemId !== null)
    .map(s => s.itemId as string);
}

export function fixAlignment(items: PageItem[], spreadId: string): PageItem[] {
  const i = items.findIndex(it => it.id === spreadId);
  if (i < 0) return [...items];
  return [...items.slice(0, i), newItem('blank'), ...items.slice(i)];
}

export function padForExport(slots: PageSlot[]): PageSlot[] {
  if (slots.length % 2 === 0) return [...slots];
  const n = slots.length + 1;
  return [...slots, { itemId: null, pageNumber: n, side: sideOf(n), half: 'whole' }];
}

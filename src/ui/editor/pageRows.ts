import type { PageItem } from '../../core/model';
import { misalignedSpreads, paginate } from '../../core/pagination';

/*
 * Row layout rules (left | right, page 1 alone on the right of the first row):
 * - A full/blank item fills the cell for its page number: odd pages on the right, even on the left.
 *   An odd page joins the previous row when that row holds only a left page; otherwise it starts a new row
 *   with an empty left cell. An even page always starts a new row with an empty right cell.
 * - A spread always gets a row of its own (aligned or not); misaligned ones (starting on an odd page) are flagged.
 */
export type Cell = { item: PageItem; label: string } | null;
export type Row = { kind: 'pair'; left: Cell; right: Cell } | { kind: 'spread'; cell: NonNullable<Cell>; misaligned: boolean };

/** Rows of two pages (left | right); page 1 sits alone on the right of the first row. */
export function buildRows(items: PageItem[]): Row[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const bad = new Set(misalignedSpreads(items));
  const rows: Row[] = [];
  const done = new Set<string>();
  for (const slot of paginate(items)) {
    if (!slot.itemId || done.has(slot.itemId)) continue;
    const item = byId.get(slot.itemId) as PageItem;
    if (item.layout === 'spread') {
      done.add(item.id);
      rows.push({ kind: 'spread', cell: { item, label: `${slot.pageNumber}~${slot.pageNumber + 1}쪽` }, misaligned: bad.has(item.id) });
      continue;
    }
    const cell = { item, label: `${slot.pageNumber}쪽` };
    const last = rows[rows.length - 1];
    if (slot.side === 'right') {
      if (last && last.kind === 'pair' && last.right === null && last.left) {
        last.right = cell;
      } else {
        rows.push({ kind: 'pair', left: null, right: cell });
      }
    } else {
      rows.push({ kind: 'pair', left: cell, right: null });
    }
  }
  return rows;
}

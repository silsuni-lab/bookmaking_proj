import { describe, it, expect } from 'vitest';
import { newItem } from '../../src/core/model';
import type { LayoutKind } from '../../src/core/model';
import { buildRows } from '../../src/ui/editor/pageRows';

const items = (...l: LayoutKind[]) => l.map((k) => newItem(k));
const shape = (rows: ReturnType<typeof buildRows>) =>
  rows.map((r) =>
    r.kind === 'spread'
      ? `${r.cell.label}${r.misaligned ? '!' : ''}`
      : `${r.left?.label ?? '-'}|${r.right?.label ?? '-'}`,
  );

describe('buildRows', () => {
  it('empty book has no rows', () => expect(buildRows([])).toEqual([]));
  it('page 1 sits alone on the right', () => expect(shape(buildRows(items('full')))).toEqual(['-|1쪽']));
  it('pairs following pages', () =>
    expect(shape(buildRows(items('full', 'full', 'full')))).toEqual(['-|1쪽', '2쪽|3쪽']));
  it('even page count leaves the last right cell empty after an odd run', () =>
    expect(shape(buildRows(items('full', 'full')))).toEqual(['-|1쪽', '2쪽|-']));
  it('aligned spread takes its own row', () =>
    expect(shape(buildRows(items('full', 'spread')))).toEqual(['-|1쪽', '2~3쪽']));
  it('misaligned spread is flagged on its own row', () =>
    expect(shape(buildRows(items('spread')))).toEqual(['1~2쪽!']));
  it('full, full, spread: spread starts on page 3 and is misaligned', () =>
    expect(shape(buildRows(items('full', 'full', 'spread')))).toEqual(['-|1쪽', '2쪽|-', '3~4쪽!']));
  it('page after a misaligned spread starts a new row', () =>
    expect(shape(buildRows(items('spread', 'full', 'full')))).toEqual(['1~2쪽!', '-|3쪽', '4쪽|-']));
});

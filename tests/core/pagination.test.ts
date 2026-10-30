import { describe, expect, test } from 'vitest';
import { newItem } from '../../src/core/model';
import { fixAlignment, misalignedSpreads, padForExport, paginate } from '../../src/core/pagination';

const f = () => newItem('full'), s = () => newItem('spread');

describe('pagination', () => {
  test('page 1 is right, then alternates', () => {
    expect(paginate([f(), f(), f()]).map(p => p.side)).toEqual(['right', 'left', 'right']);
  });
  test('spread takes two slots', () => {
    const sl = paginate([f(), s()]);
    expect(sl.map(p => [p.pageNumber, p.side, p.half])).toEqual([[1,'right','whole'],[2,'left','left'],[3,'right','right']]);
  });
  test('spread starting on right is misaligned', () => {
    const sp = s(); expect(misalignedSpreads([sp])).toEqual([sp.id]);
    expect(misalignedSpreads(fixAlignment([sp], sp.id))).toEqual([]);
    expect(fixAlignment([sp], sp.id)[0].layout).toBe('blank');
  });
  test('fixAlignment does not mutate input', () => {
    const items = [s()];
    fixAlignment(items, items[0].id);
    expect(items).toHaveLength(1);
  });
  test('pad to even', () => {
    expect(padForExport(paginate([f()]))).toHaveLength(2);
    expect(padForExport(paginate([f()]))[1].itemId).toBeNull();
    expect(padForExport(paginate([f(), f()]))).toHaveLength(2);
  });
});

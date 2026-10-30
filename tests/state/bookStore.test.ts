import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newBook, newItem } from '../../src/core/model';
import type { Book, TextElement } from '../../src/core/model';
import { startAutosave, useBookStore } from '../../src/state/bookStore';

const s = () => useBookStore.getState();
const undo = () => useBookStore.temporal.getState().undo();

function reset(book: Book | null = null) {
  useBookStore.setState({ book: null, selected: null, saveStatus: 'saved' });
  useBookStore.temporal.getState().clear();
  if (book) s().open(book);
}
function textEl(id: string): TextElement {
  return { id, kind: 'text', x: 1, y: 2, width: 10, height: 10, rotation: 0, text: 't', fontSizePt: 12, color: '#000', band: false };
}

beforeEach(() => {
  vi.useFakeTimers();
  reset(newBook('sq200', '제목', '하나'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('edits and undo', () => {
  it('addItem then undo', () => {
    const id = s().addItem('full');
    expect(s().book!.items.map((i) => i.id)).toEqual([id]);
    undo();
    expect(s().book!.items).toHaveLength(0);
  });

  it('open is not undoable', () => {
    s().addItem('full');
    s().open(newBook('a5p'));
    expect(useBookStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('addItem afterId inserts after; moveItem and removeItem', () => {
    const a = s().addItem('full');
    const b = s().addItem('full');
    const c = s().addItem('blank', a);
    expect(s().book!.items.map((i) => i.id)).toEqual([a, c, b]);
    s().moveItem(b, 0);
    expect(s().book!.items.map((i) => i.id)).toEqual([b, a, c]);
    s().removeItem(a);
    expect(s().book!.items.map((i) => i.id)).toEqual([b, c]);
  });

  it('updateElement changes only that element', () => {
    const id = s().addItem('full');
    s().addElement({ kind: 'item', id }, textEl('e1'));
    s().addElement({ kind: 'item', id }, textEl('e2'));
    s().updateElement({ kind: 'item', id }, 'e1', { x: 50 });
    const els = s().book!.items[0].elements;
    expect(els[0].x).toBe(50);
    expect(els[1].x).toBe(1);
    s().removeElement({ kind: 'item', id }, 'e1');
    expect(s().book!.items[0].elements.map((e) => e.id)).toEqual(['e2']);
  });

  it('cover refs, layout, background, photoSide', () => {
    s().setBackground({ kind: 'cover', which: 'back' }, 'asset1');
    expect(s().book!.cover.back.backgroundAssetId).toBe('asset1');
    const id = s().addItem('full');
    s().setLayout({ kind: 'item', id }, 'spread');
    s().setPhotoSide({ kind: 'item', id }, 'right');
    expect(s().book!.items[0]).toMatchObject({ layout: 'spread', photoSide: 'right' });
  });

  it('updates are immutable and bump updatedAt', () => {
    const before = s().book!;
    vi.setSystemTime(before.updatedAt + 5000);
    s().addItem('full');
    expect(s().book).not.toBe(before);
    expect(before.items).toHaveLength(0);
    expect(s().book!.updatedAt).toBeGreaterThan(before.updatedAt);
  });

  it('fixSpread only acts on misaligned spreads', () => {
    const f = newItem('full');
    const sp = newItem('spread');
    s().open({ ...s().book!, items: [sp, f] }); // spread on page 1 (right side) is misaligned
    const book = s().book;
    s().fixSpread(f.id);
    expect(s().book).toBe(book);
    s().fixSpread(sp.id);
    expect(s().book!.items).toHaveLength(3);
    expect(s().book!.items[0].layout).toBe('blank');
    s().fixSpread(sp.id);
    expect(s().book!.items).toHaveLength(3);
  });
});

describe('setMeta', () => {
  it('syncs auto cover texts, leaves user-edited ones', () => {
    s().setMeta({ title: '새제목', childName: '둘' });
    const [t, b] = s().book!.cover.front.elements as TextElement[];
    expect(t.text).toBe('새제목');
    expect(b.text).toBe('글·그림 둘');
    s().updateElement({ kind: 'cover', which: 'front' }, t.id, { text: '내가 쓴 것' });
    s().setMeta({ title: '또 변경' });
    expect((s().book!.cover.front.elements[0] as TextElement).text).toBe('내가 쓴 것');
    expect(s().book!.title).toBe('또 변경');
  });

  it('sizeId only when no items', () => {
    s().setMeta({ sizeId: 'a5p' });
    expect(s().book!.sizeId).toBe('a5p');
    s().addItem('full');
    s().setMeta({ sizeId: 'a4l', title: 'x' });
    expect(s().book!.sizeId).toBe('a5p');
    expect(s().book!.title).toBe('x');
  });
});

describe('autosave', () => {
  let stop: (() => void) | undefined;
  afterEach(() => {
    stop?.();
    stop = undefined;
  });

  it('debounces 1000ms then saved', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    stop = startAutosave(save);
    s().addItem('full');
    expect(s().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(s().book);
    expect(s().saveStatus).toBe('saved');
  });

  it('rejection sets error, keeps book, next success resets', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'))
      .mockResolvedValue(undefined);
    stop = startAutosave(save);
    s().addItem('full');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s().saveStatus).toBe('error');
    expect(s().book!.items).toHaveLength(1);
    s().addItem('full');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s().saveStatus).toBe('saved');
  });

  it('open and selection do not trigger save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    stop = startAutosave(save);
    s().open(newBook('a5p'));
    useBookStore.setState({ selected: { kind: 'cover', which: 'front' } });
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    expect(s().saveStatus).toBe('saved');
  });

  it('opening another book flushes the previous book edit, never saves the new one', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    stop = startAutosave(save);
    s().addItem('full');
    const edited = s().book!;
    const b = newBook('a5p');
    await vi.advanceTimersByTimeAsync(500);
    s().open(b);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(edited);
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalledWith(b);
    expect(s().saveStatus).toBe('saved');
  });

  it('stale in-flight result does not overwrite status after a newer edit', async () => {
    let resolve1!: () => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (resolve1 = r)))
      .mockResolvedValue(undefined);
    stop = startAutosave(save);
    s().addItem('full');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    s().addItem('full');
    resolve1();
    await vi.advanceTimersByTimeAsync(0);
    expect(s().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(s().saveStatus).toBe('saved');
  });

  it('old save rejecting after a newer edit does not set error', async () => {
    let reject1!: (e: unknown) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((_, r) => (reject1 = r)))
      .mockResolvedValue(undefined);
    stop = startAutosave(save);
    s().addItem('full');
    await vi.advanceTimersByTimeAsync(1000);
    s().addItem('full');
    reject1(new Error('old'));
    await vi.advanceTimersByTimeAsync(0);
    expect(s().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(1000);
    expect(s().saveStatus).toBe('saved');
  });

  it('stop flushes a pending edit and leaves status settled', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const unsub = startAutosave(save);
    s().addItem('full');
    unsub();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(s().book);
    await vi.advanceTimersByTimeAsync(0);
    expect(s().saveStatus).toBe('saved');
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

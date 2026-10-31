import { create } from 'zustand';
import { temporal } from 'zundo';
import { fixAlignment, misalignedSpreads } from '../core/pagination';
import { coverTextBoxes, newItem, PAGE_SIZES } from '../core/model';
import type { Book, ItemRef, LayoutKind, PageElement, PageItem } from '../core/model';
import { saveBook } from '../io/storage';

export type SaveStatus = 'saved' | 'saving' | 'error';

interface BookState {
  book: Book | null;
  selected: ItemRef | null;
  saveStatus: SaveStatus;
  open(book: Book): void;
  setMeta(p: Partial<Pick<Book, 'title' | 'childName' | 'sizeId'>>): void;
  addItem(layout: LayoutKind, afterId?: string): string;
  removeItem(id: string): void;
  moveItem(id: string, toIndex: number): void;
  setLayout(ref: ItemRef, layout: LayoutKind): void;
  setBackground(ref: ItemRef, assetId: string | null): void;
  setPhotoSide(ref: ItemRef, side: 'left' | 'right'): void;
  addElement(ref: ItemRef, el: PageElement): void;
  updateElement(ref: ItemRef, elId: string, patch: Partial<PageElement>): void;
  removeElement(ref: ItemRef, elId: string): void;
  fixSpread(id: string): void;
}

// The book object most recently passed to open(); the autosave subscriber skips it once.
let openedBook: Book | null = null;

const touch = (b: Book): Book => ({ ...b, updatedAt: Date.now() });

function mapItem(book: Book, ref: ItemRef, fn: (i: PageItem) => PageItem): Book {
  if (ref.kind === 'cover') {
    return { ...book, cover: { ...book.cover, [ref.which]: fn(book.cover[ref.which]) } };
  }
  return { ...book, items: book.items.map((i) => (i.id === ref.id ? fn(i) : i)) };
}

export const useBookStore = create<BookState>()(
  temporal(
    (set, get) => {
      const edit = (fn: (b: Book) => Book) => {
        const book = get().book;
        if (book) set({ book: touch(fn(book)) });
      };
      const editItem = (ref: ItemRef, fn: (i: PageItem) => PageItem) => edit((b) => mapItem(b, ref, fn));

      return {
        book: null,
        selected: null,
        saveStatus: 'saved',

        open(book) {
          openedBook = book;
          set({ book, selected: null, saveStatus: 'saved' });
          useBookStore.temporal.getState().clear();
        },

        setMeta(p) {
          edit((b) => {
            let next: Book = { ...b };
            const syncFront = (from: string, to: string) => {
              const front = next.cover.front;
              next = {
                ...next,
                cover: {
                  ...next.cover,
                  front: {
                    ...front,
                    elements: front.elements.map((e) =>
                      e.kind === 'text' && e.text === from ? { ...e, text: to } : e,
                    ),
                  },
                },
              };
            };
            if (p.title !== undefined && p.title !== b.title) {
              syncFront(b.title, p.title);
              next.title = p.title;
            }
            if (p.childName !== undefined && p.childName !== b.childName) {
              syncFront(`글·그림 ${b.childName}`, `글·그림 ${p.childName}`);
              next.childName = p.childName;
            }
            if (p.sizeId !== undefined && p.sizeId !== b.sizeId && b.items.length === 0) {
              next.sizeId = p.sizeId;
              // the automatic title/byline follow the new page size (same rule as newBook)
              const boxes = coverTextBoxes(PAGE_SIZES[p.sizeId]);
              const front = next.cover.front;
              const byline = `글·그림 ${next.childName}`;
              next = {
                ...next,
                cover: {
                  ...next.cover,
                  front: {
                    ...front,
                    elements: front.elements.map((e) =>
                      e.kind !== 'text' ? e
                        : e.text === next.title ? { ...e, ...boxes.title }
                        : e.text === byline ? { ...e, ...boxes.byline }
                        : e,
                    ),
                  },
                },
              };
            }
            return next;
          });
        },

        addItem(layout, afterId) {
          const item = newItem(layout);
          edit((b) => {
            const idx = afterId === undefined ? -1 : b.items.findIndex((i) => i.id === afterId);
            const at = idx < 0 ? b.items.length : idx + 1;
            return { ...b, items: [...b.items.slice(0, at), item, ...b.items.slice(at)] };
          });
          return item.id;
        },

        removeItem(id) {
          edit((b) => ({ ...b, items: b.items.filter((i) => i.id !== id) }));
          const sel = get().selected;
          if (sel && sel.kind === 'item' && sel.id === id) set({ selected: null });
        },

        moveItem(id, toIndex) {
          edit((b) => {
            const from = b.items.findIndex((i) => i.id === id);
            if (from < 0) return b;
            const rest = b.items.filter((i) => i.id !== id);
            const at = Math.max(0, Math.min(toIndex, rest.length));
            return { ...b, items: [...rest.slice(0, at), b.items[from], ...rest.slice(at)] };
          });
        },

        setLayout: (ref, layout) => editItem(ref, (i) => ({ ...i, layout })),
        setBackground: (ref, assetId) => editItem(ref, (i) => ({ ...i, backgroundAssetId: assetId })),
        setPhotoSide: (ref, side) => editItem(ref, (i) => ({ ...i, photoSide: side })),
        addElement: (ref, el) => editItem(ref, (i) => ({ ...i, elements: [...i.elements, el] })),
        updateElement: (ref, elId, patch) =>
          editItem(ref, (i) => ({
            ...i,
            elements: i.elements.map((e) => (e.id === elId ? ({ ...e, ...patch } as PageElement) : e)),
          })),
        removeElement: (ref, elId) =>
          editItem(ref, (i) => ({ ...i, elements: i.elements.filter((e) => e.id !== elId) })),

        fixSpread(id) {
          const book = get().book;
          if (!book || !misalignedSpreads(book.items).includes(id)) return;
          edit((b) => ({ ...b, items: fixAlignment(b.items, id) }));
        },
      };
    },
    { partialize: (s) => ({ book: s.book }), equality: (a, b) => a.book === b.book, limit: 50 },
  ),
);

// Undo/redo (or any edit) can remove the selected page; fall back to the front cover so the editor never goes blank.
useBookStore.subscribe((state) => {
  const { book, selected } = state;
  if (book && selected?.kind === 'item' && !book.items.some((i) => i.id === selected.id)) {
    useBookStore.setState({ selected: { kind: 'cover', which: 'front' } });
  }
});

export function startAutosave(
  save: (b: Book) => Promise<void> = saveBook,
  delayMs = 1000,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Book | null = null; // latest edited book awaiting its debounced save
  let seq = 0; // bumped on every new edit or book switch; only the latest save may set status

  const run = (book: Book, mySeq: number) => {
    const settle = (status: SaveStatus) => {
      if (mySeq === seq && pending === null) useBookStore.setState({ saveStatus: status });
    };
    save(book).then(
      () => settle('saved'),
      () => settle('error'),
    );
  };
  const flush = () => {
    clearTimeout(timer);
    if (!pending) return;
    const book = pending;
    pending = null;
    run(book, seq);
  };

  const unsub = useBookStore.subscribe((state, prev) => {
    if (state.book === prev.book) return;
    if (prev.book && state.book?.id !== prev.book.id) {
      flush(); // book switched: save the previous book's last edit now
      seq++; // results of the previous book's saves must not touch the new book's status
    }
    if (!state.book) return;
    if (state.book === openedBook) {
      openedBook = null;
      return;
    }
    pending = state.book;
    seq++;
    useBookStore.setState({ saveStatus: 'saving' });
    clearTimeout(timer);
    const mySeq = seq;
    timer = setTimeout(() => {
      const book = pending;
      pending = null;
      if (book) run(book, mySeq);
    }, delayMs);
  });
  return () => {
    unsub();
    flush();
  };
}

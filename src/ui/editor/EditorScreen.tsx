import { useEffect, useState } from 'react';
import { useBookStore } from '../../state/bookStore';
import CleanupDialog from '../cleanup/CleanupDialog';
import { newImageElement } from '../../core/editorLayout';
import { PAGE_SIZES } from '../../core/model';
import type { ItemRef, PageItem } from '../../core/model';
import Inspector from './Inspector';
import PageList from './PageList';
import PageEditor from './PageEditor';
import { useBookAssets } from './useBookAssets';

const FRONT: ItemRef = { kind: 'cover', which: 'front' };

function findItem(book: { cover: { front: PageItem; back: PageItem }; items: PageItem[] }, ref: ItemRef): PageItem | undefined {
  return ref.kind === 'cover' ? book.cover[ref.which] : book.items.find((i) => i.id === ref.id);
}

/** Centre + right columns of the editor. The left column slot is filled by the page list (Task 15). */
export default function EditorScreen({ bookId }: { bookId: string }) {
  const book = useBookStore((s) => s.book);
  const selected = useBookStore((s) => s.selected);
  const assets = useBookAssets(bookId);
  const [selectedEl, setSelectedEl] = useState<string | null>(null);
  const [cleanup, setCleanup] = useState<'drawing' | 'handwriting' | null>(null);

  useEffect(() => {
    if (!useBookStore.getState().selected) useBookStore.setState({ selected: FRONT });
  }, []);
  const ref = selected ?? FRONT;
  const refKey = ref.kind === 'cover' ? ref.which : ref.id;
  useEffect(() => setSelectedEl(null), [refKey]);

  const item = book ? findItem(book, ref) : undefined;
  if (!book || !item) return <div className="editor-main"><div className="page-list-slot" /></div>;

  return (
    <div className="editor-main">
      <div className="page-list-slot">
        <PageList book={book} dims={assets.dims} images={assets.images} />
      </div>
      <PageEditor
        itemRef={ref} item={item} sizeId={book.sizeId} dims={assets.dims} images={assets.images}
        selectedEl={selectedEl} onSelectEl={setSelectedEl}
      />
      <Inspector
        book={book} itemRef={ref} item={item} dims={assets.dims}
        selectedEl={selectedEl} onSelectEl={setSelectedEl}
        onAsset={assets.add} onOpenCleanup={setCleanup}
      />
      {cleanup && (
        <CleanupDialog
          bookId={book.id}
          role={cleanup}
          onCancel={() => setCleanup(null)}
          onDone={(asset) => {
            assets.add(asset);
            const el = newImageElement(item, PAGE_SIZES[book.sizeId], asset.id, cleanup, asset.widthPx / asset.heightPx);
            useBookStore.getState().addElement(ref, el);
            setSelectedEl(el.id);
            setCleanup(null);
          }}
        />
      )}
    </div>
  );
}

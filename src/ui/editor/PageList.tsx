import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useBookStore } from '../../state/bookStore';
import { PAGE_SIZES } from '../../core/model';
import type { Book, ItemRef, PageItem, PageSizeId } from '../../core/model';
import { planItem } from '../../core/drawPlan';
import type { AssetDims } from '../../core/drawPlan';
import { buildRows } from './pageRows';
import { renderOps } from '../../io/renderCanvas';

const THUMB_PX_PER_MM = 0.5;

interface ThumbProps {
  item: PageItem;
  sizeId: PageSizeId;
  dims: AssetDims;
  images: Map<string, HTMLImageElement>;
}

/** Low-resolution preview. Redrawn only when the (immutable) item object or the loaded photos change. */
const Thumb = memo(function Thumb({ item, sizeId, dims, images }: ThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = PAGE_SIZES[sizeId];
  const spread = item.layout === 'spread';
  const aspect = ((spread ? 2 : 1) * size.widthMm + 6) / (size.heightMm + 6);

  useEffect(() => {
    let dead = false;
    const bitmaps = new Map<string, ImageBitmap>();
    void (async () => {
      const plan = planItem(item, size, dims);
      for (const op of plan.ops) {
        if (op.op !== 'image' || bitmaps.has(op.assetId)) continue;
        const img = images.get(op.assetId);
        if (img) bitmaps.set(op.assetId, await createImageBitmap(img));
      }
      if (dead) return;
      const off = await renderOps(plan, bitmaps, THUMB_PX_PER_MM);
      const canvas = canvasRef.current;
      if (dead || !canvas) return;
      canvas.width = off.width;
      canvas.height = off.height;
      canvas.getContext('2d')?.drawImage(off, 0, 0);
    })()
      .catch((e) => console.error(e))
      .finally(() => bitmaps.forEach((b) => b.close()));
    return () => {
      dead = true;
    };
  }, [item, size, dims, images]);

  return <canvas ref={canvasRef} className="thumb-canvas" style={{ aspectRatio: String(aspect) }} />;
});

interface Props {
  book: Book;
  dims: AssetDims;
  images: Map<string, HTMLImageElement>;
}

export default function PageList({ book, dims, images }: Props) {
  const selected = useBookStore((s) => s.selected);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rows = useMemo(() => buildRows(book.items), [book.items]);

  const select = (ref: ItemRef) => useBookStore.setState({ selected: ref });
  const isOn = (ref: ItemRef) =>
    !!selected && (ref.kind === 'cover' ? selected.kind === 'cover' && selected.which === ref.which : selected.kind === 'item' && selected.id === ref.id);

  const add = () => {
    const st = useBookStore.getState();
    const after = st.selected && st.selected.kind === 'item' ? st.selected.id : undefined;
    const id = st.addItem('full', after);
    select({ kind: 'item', id });
  };

  const remove = (id: string) => {
    const idx = book.items.findIndex((i) => i.id === id);
    const next = book.items[idx + 1] ?? book.items[idx - 1];
    useBookStore.getState().removeItem(id);
    select(next ? { kind: 'item', id: next.id } : { kind: 'cover', which: 'front' });
    setConfirmId(null);
  };

  const thumb = (item: PageItem, ref: ItemRef, label: string, extra?: string) => {
    const on = isOn(ref);
    const interior = ref.kind === 'item';
    return (
      <div
        key={item.id}
        className={`thumb${on ? ' on' : ''}${extra ? ` ${extra}` : ''}${interior && overId === item.id && dragId !== item.id ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-pressed={on}
        draggable={interior}
        onClick={() => select(ref)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return; // let the inner delete button handle its own keys
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            select(ref);
          }
        }}
        onDragStart={interior ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.id); setDragId(item.id); } : undefined}
        onDragOver={interior ? (e) => { if (dragId) { e.preventDefault(); setOverId(item.id); } } : undefined}
        onDrop={interior ? (e) => {
          e.preventDefault();
          const to = book.items.findIndex((i) => i.id === item.id);
          if (dragId && dragId !== item.id && to >= 0) useBookStore.getState().moveItem(dragId, to);
          setDragId(null);
          setOverId(null);
        } : undefined}
        onDragEnd={() => { setDragId(null); setOverId(null); }}
      >
        <Thumb item={item} sizeId={book.sizeId} dims={dims} images={images} />
        <span className="thumb-label">{label}</span>
        {interior && on && (
          <button
            className="thumb-delete"
            aria-label="이 쪽 지우기"
            title="이 쪽 지우기"
            onClick={(e) => { e.stopPropagation(); setConfirmId(item.id); }}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  return (
    <nav className="page-list" aria-label="쪽 목록">
      <div className="page-list-covers">
        {thumb(book.cover.front, { kind: 'cover', which: 'front' }, '앞표지')}
        {thumb(book.cover.back, { kind: 'cover', which: 'back' }, '뒤표지')}
      </div>
      <div className="page-list-rows">
        {rows.map((row) =>
          row.kind === 'spread' ? (
            <div key={row.cell.item.id} className="thumb-spread-wrap">
              {thumb(row.cell.item, { kind: 'item', id: row.cell.item.id }, row.cell.label, row.misaligned ? 'misaligned' : undefined)}
              {row.misaligned && (
                <button className="btn fix-btn" onClick={() => useBookStore.getState().fixSpread(row.cell.item.id)}>
                  빈 쪽 넣어 맞추기
                </button>
              )}
            </div>
          ) : (
            <div key={`${row.left?.item.id ?? '-'}:${row.right?.item.id ?? '-'}`} className="thumb-row">
              {row.left ? thumb(row.left.item, { kind: 'item', id: row.left.item.id }, row.left.label) : <div className="thumb-empty" />}
              {row.right ? thumb(row.right.item, { kind: 'item', id: row.right.item.id }, row.right.label) : <div className="thumb-empty" />}
            </div>
          ),
        )}
      </div>
      <button className="btn add-page" onClick={add}>
        + 쪽 추가
      </button>
      {confirmId && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-label="쪽 지우기">
            <h2>이 쪽을 지울까요?</h2>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmId(null)}>취소</button>
              <button className="btn danger" onClick={() => remove(confirmId)}>지우기</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

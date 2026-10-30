import { useEffect, useMemo, useRef, useState } from 'react';
import { checkBook, issueText } from '../../core/validate';
import type { AssetDims } from '../../core/drawPlan';
import { clampPt, newTextElement, pageLabelOf } from '../../core/editorLayout';
import { newId, PAGE_SIZES } from '../../core/model';
import type { Book, ItemRef, LayoutKind, PageItem, TextElement } from '../../core/model';
import { bitmapToJpegBlob, ImageLoadError, loadBitmap, loadErrorMessage } from '../../io/imageLoader';
import { putAsset } from '../../io/storage';
import type { StoredAsset } from '../../io/storage';
import { useBookStore } from '../../state/bookStore';

interface Props {
  book: Book;
  itemRef: ItemRef;
  item: PageItem;
  dims: AssetDims;
  selectedEl: string | null;
  onSelectEl(id: string | null): void;
  onAsset(asset: StoredAsset): void;
  onOpenCleanup(role: 'drawing' | 'handwriting'): void;
}

const LAYOUTS: { id: LayoutKind; label: string }[] = [
  { id: 'full', label: '사진 가득' },
  { id: 'spread', label: '양쪽 펼침면' },
  { id: 'blank', label: '빈 쪽' },
];
const COLORS = ['#222222', '#FFFFFF', '#D64545', '#F08A4B', '#3B7DD8', '#3A9D5D', '#8E5BD0'];

function TextEditor({ el, itemRef }: { el: TextElement; itemRef: ItemRef }) {
  const update = useBookStore((s) => s.updateElement);
  const remove = useBookStore((s) => s.removeElement);
  const [draft, setDraft] = useState(el.text);
  const [pt, setPt] = useState(String(el.fontSizePt));
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef({ draft, el });
  latest.current = { draft, el };

  useEffect(() => setDraft(el.text), [el.text]);
  useEffect(() => setPt(String(el.fontSizePt)), [el.fontSizePt]);
  const flush = () => {
    clearTimeout(timer.current);
    const { draft: d, el: e } = latest.current;
    if (d !== e.text) update(itemRef, e.id, { text: d });
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="inspector-group">
      <h3>선택한 글자</h3>
      <label className="field">
        <span>내용</span>
        <textarea
          rows={3}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            clearTimeout(timer.current);
            timer.current = setTimeout(flush, 400);
          }}
          onBlur={flush}
        />
      </label>
      <label className="field">
        <span>크기 (pt)</span>
        <input
          type="number" min={6} max={120} value={pt}
          onChange={(e) => {
            setPt(e.target.value);
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 6 && n <= 120) update(itemRef, el.id, { fontSizePt: clampPt(n) });
          }}
          onBlur={() => setPt(String(el.fontSizePt))}
        />
      </label>
      <div className="field">
        <span>색</span>
        <div className="row">
          {COLORS.map((c) => (
            <button
              key={c} className={`swatch${el.color.toLowerCase() === c.toLowerCase() ? ' on' : ''}`}
              style={{ background: c }} aria-label={`글자 색 ${c}`} onClick={() => update(itemRef, el.id, { color: c })}
            />
          ))}
        </div>
      </div>
      <label className="radio">
        <input type="checkbox" checked={el.band} onChange={(e) => update(itemRef, el.id, { band: e.target.checked })} />
        글자 뒤 흰 띠
      </label>
      <button className="btn danger" onClick={() => remove(itemRef, el.id)}>이 글자 지우기</button>
    </section>
  );
}

export default function Inspector({ book, itemRef, item, dims, selectedEl, onSelectEl, onAsset, onOpenCleanup }: Props) {
  const store = useBookStore.getState;
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isCover = itemRef.kind === 'cover';
  const size = PAGE_SIZES[book.sizeId];
  const sel = item.elements.find((e) => e.id === selectedEl);

  const label = pageLabelOf(itemRef, book.items);
  const issues = useMemo(
    () =>
      checkBook(book, dims).filter(
        (i) =>
          i.code !== 'no-pages' &&
          (itemRef.kind === 'cover'
            ? i.ref.kind === 'cover' && i.ref.which === itemRef.which
            : i.ref.kind === 'item' && i.ref.id === itemRef.id),
      ),
    [book, dims, itemRef],
  );

  const pickPhoto = async (f: File) => {
    setError(null);
    setBusy(true);
    try {
      const bmp = await loadBitmap(f);
      const { blob, width, height } = await bitmapToJpegBlob(bmp);
      const asset: StoredAsset = { id: newId(), bookId: book.id, blob, widthPx: width, heightPx: height, kind: 'photo' };
      bmp.close?.();
      await putAsset(asset);
      onAsset(asset);
      store().setBackground(itemRef, asset.id);
    } catch (e) {
      setError(e instanceof ImageLoadError ? loadErrorMessage(e) : '사진을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const addText = () => {
    const el = newTextElement(item, size);
    store().addElement(itemRef, el);
    onSelectEl(el.id);
  };

  return (
    <aside className="inspector">
      <h2>{label}</h2>
      {!isCover && (
        <fieldset className="field">
          <legend>쪽 구성</legend>
          {LAYOUTS.map((l) => (
            <label key={l.id} className="radio">
              <input type="radio" name="layout" checked={item.layout === l.id} onChange={() => store().setLayout(itemRef, l.id)} />
              {l.label}
            </label>
          ))}
        </fieldset>
      )}
      {item.layout === 'spread' && (
        <fieldset className="field">
          <legend>사진 쪽</legend>
          {(['left', 'right'] as const).map((side) => (
            <label key={side} className="radio">
              <input type="radio" name="side" checked={item.photoSide === side} onChange={() => store().setPhotoSide(itemRef, side)} />
              {side === 'left' ? '왼쪽' : '오른쪽'}
            </label>
          ))}
        </fieldset>
      )}
      <div className="inspector-buttons">
        <button className="btn" disabled={busy || item.layout === 'blank'} onClick={() => file.current?.click()}>
          배경 사진 넣기
        </button>
        <button className="btn" onClick={() => onOpenCleanup('drawing')}>그림 넣기</button>
        <button className="btn" onClick={() => onOpenCleanup('handwriting')}>손글씨 넣기</button>
        <button className="btn" onClick={addText}>글자 넣기</button>
        <input
          ref={file} type="file" accept="image/*" hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void pickPhoto(f);
          }}
        />
      </div>
      {busy && <p role="status">사진을 넣는 중이에요…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {sel?.kind === 'text' && <TextEditor key={sel.id} el={sel} itemRef={itemRef} />}
      {sel?.kind === 'image' && (
        <section className="inspector-group">
          <h3>선택한 그림</h3>
          <button className="btn danger" onClick={() => { store().removeElement(itemRef, sel.id); onSelectEl(null); }}>
            이 그림 지우기
          </button>
        </section>
      )}
      {issues.length > 0 && (
        <section className="inspector-group">
          <h3>확인해 주세요</h3>
          <ul className="issues">
            {issues.map((i, n) => (
              <li key={n}>{issueText(i, label)}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

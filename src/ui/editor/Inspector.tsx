import { useEffect, useMemo, useRef, useState } from 'react';
import { checkBook, issueText } from '../../core/validate';
import type { AssetDims } from '../../core/drawPlan';
import { DEFAULT_FRAME, MAX_BG_ZOOM } from '../../core/geometry';
import { clampPt, newImageElement, newTextElement, pageLabelOf, rotateAboutCenter } from '../../core/editorLayout';
import { isNeutral, NO_ADJUST } from '../../core/adjust';
import type { ImageAdjust } from '../../core/adjust';
import { BACKDROP_COLORS } from '../../core/backdrop';
import type { Backdrop } from '../../core/backdrop';
import { newId, PAGE_SIZES } from '../../core/model';
import type { Book, ImageElement, ItemRef, LayoutKind, LibraryItem, PageItem, TextElement } from '../../core/model';
import { bitmapToJpegBlob, ImageLoadError, loadBitmap, loadErrorMessage } from '../../io/imageLoader';
import { putAsset } from '../../io/storage';
import type { StoredAsset } from '../../io/storage';
import { useBookStore } from '../../state/bookStore';
import { beginGesture, gestureEdit } from './gestureEdit';

interface Props {
  book: Book;
  itemRef: ItemRef;
  item: PageItem;
  dims: AssetDims;
  images: Map<string, HTMLImageElement>;
  selectedEl: string | null;
  onSelectEl(id: string | null): void;
  onAsset(asset: StoredAsset): void;
  /** Opens the cleanup dialog; with elId, redoes the paper removal of that drawing. */
  onOpenCleanup(role: 'drawing' | 'handwriting', elId?: string): void;
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
      <BackdropControls
        id={el.id} backdrop={el.backdrop}
        onChange={(backdrop) => update(itemRef, el.id, backdrop ? { backdrop, band: false } : { backdrop })}
      />
      {!el.backdrop && (
        <label className="radio">
          <input type="checkbox" checked={el.band} onChange={(e) => update(itemRef, el.id, { band: e.target.checked })} />
          글자 뒤 흰 띠
        </label>
      )}
      <button className="btn danger" onClick={() => remove(itemRef, el.id)}>이 글자 지우기</button>
    </section>
  );
}

const ADJUSTS: { key: Exclude<keyof ImageAdjust, 'toWhite'>; label: string }[] = [
  { key: 'brightness', label: '밝기' },
  { key: 'contrast', label: '대비' },
  { key: 'saturation', label: '채도' },
];

/** None / colour box / speech bubble behind a drawing or text, with its colour and the bubble's tail side. */
function BackdropControls({ id, backdrop, onChange }: { id: string; backdrop?: Backdrop; onChange(b: Backdrop | undefined): void }) {
  return (
    <>
      <fieldset className="field">
        <legend>뒤 배경 (글씨가 잘 안 보일 때)</legend>
        {([['none', '없음'], ['box', '색 상자'], ['bubble', '말풍선']] as const).map(([shape, label]) => (
          <label key={shape} className="radio">
            <input
              type="radio" name={`backdrop-${id}`} checked={(backdrop?.shape ?? 'none') === shape}
              onChange={() => onChange(shape === 'none' ? undefined : { color: BACKDROP_COLORS[0], ...backdrop, shape })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {backdrop && (
        <div className="field">
          <span>뒤 배경 색</span>
          <div className="row">
            {BACKDROP_COLORS.map((c) => (
              <button
                key={c} className={`swatch${backdrop.color === c ? ' on' : ''}`} style={{ background: c }}
                aria-label={`뒤 배경 색 ${c}`} onClick={() => onChange({ ...backdrop, color: c })}
              />
            ))}
          </div>
        </div>
      )}
      {backdrop?.shape === 'bubble' && (
        <fieldset className="field">
          <legend>말풍선 꼬리</legend>
          {([['left', '왼쪽'], ['right', '오른쪽']] as const).map(([tail, label]) => (
            <label key={tail} className="radio">
              <input
                type="radio" name={`tail-${id}`} checked={(backdrop.tail ?? 'left') === tail}
                onChange={() => onChange({ ...backdrop, tail })}
              />
              {label}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}

function DrawingEditor({ el, itemRef, onRedo, onRemove }: { el: ImageElement; itemRef: ItemRef; onRedo(): void; onRemove(): void }) {
  const update = useBookStore((s) => s.updateElement);
  const adjust = el.adjust ?? NO_ADJUST;
  const noun = el.role === 'drawing' ? '그림' : '손글씨';
  const setBackdrop = (backdrop: Backdrop | undefined) => update(itemRef, el.id, { backdrop });
  return (
    <section className="inspector-group">
      <h3>선택한 {noun}</h3>
      <div className="row">
        <button className="btn" onClick={() => update(itemRef, el.id, rotateAboutCenter(el, -90))}>↺ 왼쪽으로</button>
        <button className="btn" onClick={() => update(itemRef, el.id, rotateAboutCenter(el, 90))}>↻ 오른쪽으로</button>
        <button className={`btn${el.flipX ? ' primary' : ''}`} aria-pressed={!!el.flipX} onClick={() => update(itemRef, el.id, { flipX: !el.flipX })}>
          좌우 뒤집기
        </button>
      </div>
      <BackdropControls id={el.id} backdrop={el.backdrop} onChange={setBackdrop} />
      <label className="radio">
        <input
          type="checkbox" checked={!!adjust.toWhite}
          onChange={(e) => update(itemRef, el.id, { adjust: { ...adjust, toWhite: e.target.checked } })}
        />
        흰색으로 바꾸기 (어두운 사진 위에서)
      </label>
      {!adjust.toWhite && ADJUSTS.map(({ key, label }) => (
        <label key={key} className="field">
          <span>{label} ({adjust[key] > 0 ? '+' : ''}{adjust[key]})</span>
          <input
            type="range" min={-100} max={100} step={5} value={adjust[key]}
            onPointerDown={beginGesture}
            onChange={(e) => gestureEdit(() => update(itemRef, el.id, { adjust: { ...adjust, [key]: Number(e.target.value) } }))}
          />
        </label>
      ))}
      <div className="row">
        <button
          className="btn" disabled={isNeutral({ ...adjust, toWhite: false })}
          onClick={() => update(itemRef, el.id, { adjust: adjust.toWhite ? { ...NO_ADJUST, toWhite: true } : undefined })}
        >
          색 처음대로
        </button>
        <button className="btn" disabled={!el.cleanup} onClick={onRedo}>배경 지우기 다시 하기</button>
      </div>
      {!el.cleanup && <p className="hint">이 기능이 생기기 전에 넣은 {noun}이라 다시 하려면 새로 넣어 주세요.</p>}
      <button className="btn danger" onClick={onRemove}>이 {noun} 지우기</button>
    </section>
  );
}

export default function Inspector({ book, itemRef, item, dims, images, selectedEl, onSelectEl, onAsset, onOpenCleanup }: Props) {
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

  const placeFromLibrary = (l: LibraryItem) => {
    const d = dims[l.assetId];
    if (!d) return;
    const el = newImageElement(item, size, l.assetId, l.role, d.widthPx / d.heightPx);
    store().addElement(itemRef, l.cleanup ? { ...el, cleanup: l.cleanup } : el);
    onSelectEl(el.id);
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
      {item.backgroundAssetId && item.layout !== 'blank' && (
        <section className="inspector-group">
          <h3>배경 사진</h3>
          <p className="hint">
            사진을 클릭하면 잘려 나간 부분이 흐리게 보이고 페이지 모서리에 손잡이가 생겨요. 사진을 끌면 위치가, 손잡이를 바깥·안쪽으로 끌면 크기가 바뀌어요.
          </p>
          <label className="field">
            <span>확대</span>
            <input
              type="range" min={1} max={MAX_BG_ZOOM} step={0.1} value={(item.bgFrame ?? DEFAULT_FRAME).zoom}
              onPointerDown={beginGesture}
              onChange={(e) => gestureEdit(() => store().setBgFrame(itemRef, { ...(item.bgFrame ?? DEFAULT_FRAME), zoom: Number(e.target.value) }))}
            />
          </label>
          <button className="btn" disabled={!item.bgFrame} onClick={() => store().setBgFrame(itemRef, undefined)}>
            처음 위치로
          </button>
        </section>
      )}
      {busy && <p role="status">사진을 넣는 중이에요…</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {sel?.kind === 'text' && <TextEditor key={sel.id} el={sel} itemRef={itemRef} />}
      {sel?.kind === 'image' && (
        <DrawingEditor
          key={sel.id} el={sel} itemRef={itemRef}
          onRedo={() => onOpenCleanup(sel.role, sel.id)}
          onRemove={() => { store().removeElement(itemRef, sel.id); onSelectEl(null); }}
        />
      )}
      <section className="inspector-group">
        <h3>내 그림 모음</h3>
        {(book.library ?? []).length === 0 ? (
          <p className="hint">그림이나 손글씨를 넣으면 여기에 모여요. 눌러서 다른 쪽에도 넣을 수 있어요.</p>
        ) : (
          <>
            <p className="hint">누르면 이 쪽에 넣어요.</p>
            <ul className="library">
              {book.library!.map((l, n) => {
                const noun = l.role === 'drawing' ? '그림' : '손글씨';
                const img = images.get(l.assetId);
                return (
                  <li key={l.id}>
                    <button className="library-add checker" aria-label={`모음의 ${noun} ${n + 1} 넣기`} onClick={() => placeFromLibrary(l)}>
                      {img ? <img src={img.src} alt="" /> : <span>…</span>}
                    </button>
                    <button className="library-remove" aria-label={`모음에서 ${noun} ${n + 1} 빼기`} title="모음에서 빼기"
                      onClick={() => store().removeFromLibrary(l.id)}>×</button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
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

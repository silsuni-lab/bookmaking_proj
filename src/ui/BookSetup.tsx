import { useState } from 'react';
import { PAGE_SIZES, newBook, type Book, type PageSizeId } from '../core/model';
import { saveBook } from '../io/storage';
import { useBookStore } from '../state/bookStore';

interface Props {
  /** 'new' creates a book; 'edit' changes the book currently open in the store. */
  mode: 'new' | 'edit';
  onClose(): void;
  onCreated?(book: Book): void;
}

export default function BookSetup({ mode, onClose, onCreated }: Props) {
  const current = useBookStore.getState().book;
  const editing = mode === 'edit' && current !== null;
  const [title, setTitle] = useState(editing ? current.title : '');
  const [childName, setChildName] = useState(editing ? current.childName : '');
  const [sizeId, setSizeId] = useState<PageSizeId>(editing ? current.sizeId : 'sq200');
  const [busy, setBusy] = useState(false);
  const sizeLocked = editing && current.items.length > 0;
  const ready = title.trim() !== '' && childName.trim() !== '' && !busy;

  const submit = async () => {
    if (!ready) return;
    const t = title.trim();
    const c = childName.trim();
    if (editing) {
      useBookStore.getState().setMeta({ title: t, childName: c, ...(sizeLocked ? {} : { sizeId }) });
      onClose();
      return;
    }
    setBusy(true);
    const book = newBook(sizeId, t, c);
    await saveBook(book);
    onCreated?.(book);
  };

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 id="setup-title">{editing ? '책 정보 바꾸기' : '새 책 만들기'}</h2>
        <label className="field">
          <span>책 제목</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 우리 가족 나들이" />
        </label>
        <label className="field">
          <span>아이 이름</span>
          <input value={childName} onChange={(e) => setChildName(e.target.value)} placeholder="예: 하준" />
        </label>
        <fieldset className="field">
          <legend>책 크기</legend>
          {(Object.keys(PAGE_SIZES) as PageSizeId[]).map((id) => (
            <label key={id} className={`radio${sizeLocked ? ' disabled' : ''}`}>
              <input
                type="radio"
                name="size"
                value={id}
                checked={sizeId === id}
                disabled={sizeLocked}
                onChange={() => setSizeId(id)}
              />
              <span>{PAGE_SIZES[id].label}</span>
            </label>
          ))}
          {sizeLocked && <p className="hint">판형은 쪽을 만들기 전에만 바꿀 수 있어요.</p>}
        </fieldset>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="btn primary" disabled={!ready}>
            {editing ? '저장' : '만들기'}
          </button>
        </div>
      </form>
    </div>
  );
}

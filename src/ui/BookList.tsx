import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book } from '../core/model';
import { BookFileError, importBookFile } from '../io/bookFile';
import { deleteBook, listBooks, loadBook, putAsset, saveBook } from '../io/storage';
import BookSetup from './BookSetup';
import { downloadBookFile } from './bookFileActions';

type Summary = Pick<Book, 'id' | 'title' | 'childName' | 'updatedAt'>;

const fmtDate = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

interface Props {
  onOpen(book: Book): void;
}

export default function BookList({ onOpen }: Props) {
  const [books, setBooks] = useState<Summary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Summary | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const all = await listBooks();
    setBooks([...all].sort((a, b) => b.updatedAt - a.updatedAt));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const open = async (id: string) => {
    const book = await loadBook(id);
    if (book) onOpen(book);
    else {
      setMessage('책을 열 수 없어요.');
      void refresh();
    }
  };

  const saveFile = async (id: string) => {
    const book = await loadBook(id);
    if (book) await downloadBookFile(book);
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    await deleteBook(toDelete.id);
    setToDelete(null);
    await refresh();
  };

  const onFile = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = '';
    if (!file) return;
    try {
      const { book, assets } = await importBookFile(file);
      for (const a of assets) await putAsset(a);
      await saveBook(book);
      await refresh();
    } catch (e) {
      setMessage(e instanceof BookFileError ? e.message : '책 파일을 불러오지 못했어요.');
    }
  };

  return (
    <main className="list-screen">
      <header className="list-header">
        <h1>그림책 만들기</h1>
        <div className="row">
          <button className="btn" onClick={() => fileInput.current?.click()}>
            책 파일 불러오기
          </button>
          <button className="btn primary" onClick={() => setCreating(true)}>
            새 책 만들기
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".kidbook"
          hidden
          data-testid="import-input"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </header>

      {books && books.length === 0 && (
        <p className="empty">아직 만든 책이 없어요. [새 책 만들기]를 눌러 시작해 보세요.</p>
      )}
      <ul className="cards">
        {books?.map((b) => (
          <li key={b.id} className="card">
            <h2>{b.title || '이름 없는 책'}</h2>
            <p>{b.childName}</p>
            <p className="date">마지막 수정 {fmtDate(b.updatedAt)}</p>
            <div className="row">
              <button className="btn primary" onClick={() => void open(b.id)}>
                열기
              </button>
              <button className="btn" onClick={() => void saveFile(b.id)}>
                책 파일로 저장
              </button>
              <button className="btn danger" onClick={() => setToDelete(b)}>
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      {creating && (
        <BookSetup
          mode="new"
          onClose={() => setCreating(false)}
          onCreated={(book) => {
            setCreating(false);
            onOpen(book);
          }}
        />
      )}

      {toDelete && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="del-title">
            <h2 id="del-title">책을 지울까요?</h2>
            <p>「{toDelete.title || '이름 없는 책'}」을 지우면 되돌릴 수 없어요.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setToDelete(null)}>
                취소
              </button>
              <button className="btn danger" onClick={() => void confirmDelete()}>
                지우기
              </button>
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="modal-backdrop">
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="msg-title">
            <h2 id="msg-title">알림</h2>
            <p>{message}</p>
            <div className="modal-actions">
              <button className="btn primary" onClick={() => setMessage(null)}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

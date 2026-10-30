import { useEffect, useState } from 'react';
import type { Book } from '../core/model';
import { startAutosave, useBookStore } from '../state/bookStore';
import BookList from './BookList';
import BookSetup from './BookSetup';
import SaveBanner from './SaveBanner';
import CleanupDialog from './cleanup/CleanupDialog';

/** Temporary editor view; later tasks replace it with the real editor. */
function EditorPlaceholder({ onBack }: { onBack(): void }) {
  const book = useBookStore((s) => s.book);
  const [editingInfo, setEditingInfo] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  return (
    <div className="editor-screen">
      <SaveBanner />
      <header className="editor-header">
        <button className="btn" onClick={onBack}>
          ← 책 목록
        </button>
        <h1>{book?.title}</h1>
        <button className="btn" onClick={() => setEditingInfo(true)}>
          책 정보 바꾸기
        </button>
      </header>
      <div className="editor-body">
        편집 화면은 곧 만들어져요.
        <button className="btn" onClick={() => setCleaning(true)}>그림 넣기 (시험)</button>
      </div>
      {cleaning && book && <CleanupDialog bookId={book.id} role="drawing" onDone={() => setCleaning(false)} onCancel={() => setCleaning(false)} />}
      {editingInfo && <BookSetup mode="edit" onClose={() => setEditingInfo(false)} />}
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<'list' | 'editor'>('list');

  useEffect(() => {
    if (view !== 'editor') return;
    return startAutosave(); // cleanup flushes pending saves
  }, [view]);

  const openBook = (book: Book) => {
    useBookStore.getState().open(book);
    setView('editor');
  };

  return view === 'list' ? <BookList onOpen={openBook} /> : <EditorPlaceholder onBack={() => setView('list')} />;
}

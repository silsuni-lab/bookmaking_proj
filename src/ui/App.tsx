import { useEffect, useState } from 'react';
import type { Book } from '../core/model';
import { startAutosave, useBookStore } from '../state/bookStore';
import BookList from './BookList';
import BookSetup from './BookSetup';
import SaveBanner from './SaveBanner';
import ExportDialog from './ExportDialog';
import EditorScreen from './editor/EditorScreen';

function EditorView({ onBack }: { onBack(): void }) {
  const book = useBookStore((s) => s.book);
  const [editingInfo, setEditingInfo] = useState(false);
  const [exporting, setExporting] = useState(false);
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
        <button className="btn primary" onClick={() => setExporting(true)}>
          PDF 만들기
        </button>
      </header>
      {book && <EditorScreen key={book.id} bookId={book.id} />}
      {exporting && book && <ExportDialog book={book} onClose={() => setExporting(false)} />}
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

  return view === 'list' ? <BookList onOpen={openBook} /> : <EditorView onBack={() => setView('list')} />;
}

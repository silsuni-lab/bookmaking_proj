import { useEffect, useMemo, useRef, useState } from 'react';
import type { Book } from '../core/model';
import type { AssetDims } from '../core/drawPlan';
import { pageLabelOf } from '../core/editorLayout';
import { checkBook, issueText } from '../core/validate';
import { exportBook } from '../io/exportPdf';
import { makePageRenderer } from '../io/pageRenderer';
import { assetsOf, getAsset } from '../io/storage';
import { safeFileTitle } from './bookFileActions';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; coverUrl: string; interiorUrl: string }
  | { kind: 'error' };

export default function ExportDialog({ book, onClose }: { book: Book; onClose(): void }) {
  const [dims, setDims] = useState<AssetDims | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const urls = useRef<string[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    void assetsOf(book.id).then((all) => {
      if (!alive.current) return;
      setDims(Object.fromEntries(all.map((a) => [a.id, { widthPx: a.widthPx, heightPx: a.heightPx }])));
    });
    return () => {
      alive.current = false;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, [book.id]);

  const issues = useMemo(() => (dims ? checkBook(book, dims) : []), [book, dims]);
  const hasError = issues.some((i) => i.level === 'error');
  const running = phase.kind === 'running';

  const start = async () => {
    setPhase({ kind: 'running', done: 0, total: 0 });
    try {
      const { cover, interior } = await exportBook(book, makePageRenderer(book, getAsset), (done, total) => {
        if (alive.current) setPhase({ kind: 'running', done, total });
      });
      if (!alive.current) return;
      const coverUrl = URL.createObjectURL(cover);
      const interiorUrl = URL.createObjectURL(interior);
      urls.current.push(coverUrl, interiorUrl);
      setPhase({ kind: 'done', coverUrl, interiorUrl });
    } catch (e) {
      console.error(e);
      if (alive.current) setPhase({ kind: 'error' });
    }
  };

  const name = safeFileTitle(book.title);
  return (
    <div className="modal-backdrop">
      <div className="modal export-dialog" role="dialog" aria-modal="true" aria-label="PDF 만들기">
        <h2>PDF 만들기</h2>
        {!dims ? (
          <p>책을 살펴보고 있어요…</p>
        ) : (
          <>
            {issues.length === 0 ? (
              <p>모두 괜찮아요. 바로 만들 수 있어요.</p>
            ) : (
              <ul className="issues">
                {issues.map((i, n) => (
                  <li key={n}>{issueText(i, 'ref' in i ? pageLabelOf(i.ref, book.items) : '')}</li>
                ))}
              </ul>
            )}
            {phase.kind === 'running' && (
              <p role="status">{phase.done} / {phase.total}쪽</p>
            )}
            {phase.kind === 'error' && (
              <p role="alert" className="export-error">PDF를 만들지 못했어요. 다시 시도해 주세요.</p>
            )}
            {phase.kind === 'done' && (
              <div className="export-links">
                <p>PDF가 만들어졌어요! 아래 파일을 내려받아 인쇄소에 보내 주세요.</p>
                <a className="btn primary" href={phase.coverUrl} download={`${name}_표지.pdf`}>{name}_표지.pdf</a>
                <a className="btn primary" href={phase.interiorUrl} download={`${name}_내지.pdf`}>{name}_내지.pdf</a>
              </div>
            )}
          </>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={running}>닫기</button>
          {phase.kind !== 'done' && (
            <button className="btn primary" onClick={() => void start()} disabled={!dims || hasError || running}>
              PDF 만들기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

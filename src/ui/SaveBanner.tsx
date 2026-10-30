import { useBookStore } from '../state/bookStore';
import { downloadBookFile } from './bookFileActions';

export default function SaveBanner() {
  const status = useBookStore((s) => s.saveStatus);
  const book = useBookStore((s) => s.book);
  if (status !== 'error') return null;
  return (
    <div className="save-banner" role="alert">
      <span>저장하지 못했어요. [책 파일로 저장] 버튼으로 백업해 주세요.</span>
      <button className="btn" onClick={() => book && void downloadBookFile(book)}>
        책 파일로 저장
      </button>
    </div>
  );
}

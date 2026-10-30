import type { Book } from '../core/model';
import { exportBookFile } from '../io/bookFile';
import { assetsOf } from '../io/storage';

/** Downloads the book as a .kidbook file (includes its stored photos). */
export async function downloadBookFile(book: Book): Promise<void> {
  const blob = await exportBookFile(book, await assetsOf(book.id));
  const safeTitle = (book.title.trim() || '그림책').replace(/[/\\:*?"<>|]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeTitle}.kidbook`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

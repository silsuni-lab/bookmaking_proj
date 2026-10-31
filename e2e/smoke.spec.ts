import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';

const FIX = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const DRAWING = resolve(FIX, 'drawing.jpg');
const ROTATED = resolve(FIX, 'photo-rotated.jpg');

/** Reads the app's IndexedDB directly (the stored source of truth). */
async function readDb(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ books: any[]; assets: any[] }>((resolveDb, reject) => {
        const open = indexedDB.open('kids-book-maker');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction(['books', 'assets'], 'readonly');
          const books = tx.objectStore('books').getAll();
          const assets = tx.objectStore('assets').getAll();
          tx.oncomplete = () => {
            db.close();
            resolveDb({
              books: books.result,
              assets: assets.result.map((a) => ({ id: a.id, kind: a.kind, widthPx: a.widthPx, heightPx: a.heightPx })),
            });
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
}

test('make a book: rotated photo, cleaned drawing, pages survive reload, export PDFs, no external requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') external.push(req.url());
  });

  // New book (sq200 is the default size)
  await page.goto('/');
  await page.getByRole('button', { name: '새 책 만들기' }).click();
  const setup = page.getByRole('dialog', { name: '새 책 만들기' });
  await setup.getByLabel('책 제목').fill('테스트 그림책');
  await setup.getByLabel('아이 이름').fill('하준');
  await expect(setup.getByRole('radio', { name: '정사각 20×20cm' })).toBeChecked();
  await setup.getByRole('button', { name: '만들기' }).click();
  await expect(page.getByRole('heading', { name: '테스트 그림책', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '앞표지', level: 2 })).toBeVisible();

  // EXIF: orientation 6 photo (stored 1200x800) as front-cover background must end up portrait
  await page.locator('aside.inspector input[type=file]').setInputFiles(ROTATED);
  await expect
    .poll(async () => {
      const { assets } = await readDb(page);
      const photo = assets.find((a) => a.kind === 'photo');
      return photo ? { w: photo.widthPx, h: photo.heightPx } : null;
    })
    .toEqual({ w: 800, h: 1200 });
  await expect.poll(async () => (await readDb(page)).books[0]?.cover.front.backgroundAssetId).not.toBeNull();

  // Drawing cleanup: pick -> corners -> paper -> touch-up -> done
  await page.getByRole('button', { name: '그림 넣기' }).click();
  const cleanup = page.getByRole('dialog', { name: '그림 넣기' });
  await cleanup.getByTestId('cleanup-file').setInputFiles(DRAWING);
  await cleanup.getByRole('button', { name: '다음', exact: true }).click(); // corners -> paper
  await cleanup.getByRole('button', { name: '다음', exact: true }).click(); // paper -> touch-up
  await cleanup.getByRole('button', { name: '완료' }).click();
  await expect(cleanup).toBeHidden();
  await expect(page.getByRole('heading', { name: '선택한 그림' })).toBeVisible();
  // (a new cover also carries two default text elements; the drawing is the single image element)
  await expect
    .poll(async () => (await readDb(page)).books[0]?.cover.front.elements.filter((e: { kind: string }) => e.kind === 'image').length)
    .toBe(1);

  // Two interior pages, then reload: both persist
  const addPage = page.getByRole('button', { name: '+ 쪽 추가' });
  await addPage.click();
  await addPage.click();
  await expect.poll(async () => (await readDb(page)).books[0]?.items.length).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: '열기' }).click();
  await expect(page.getByRole('heading', { name: '테스트 그림책', level: 1 })).toBeVisible();
  const pageNav = page.getByRole('navigation', { name: '쪽 목록' });
  await expect(pageNav.locator('.thumb')).toHaveCount(4); // front + back cover + 2 pages
  expect((await readDb(page)).books[0].items).toHaveLength(2);

  // Export: two PDFs, interior has 2 pages
  await page.getByRole('button', { name: 'PDF 만들기' }).first().click();
  const exportDlg = page.getByRole('dialog', { name: 'PDF 만들기' });
  await exportDlg.getByRole('button', { name: 'PDF 만들기' }).click();
  const coverLink = exportDlg.getByRole('link', { name: /_표지\.pdf$/ });
  const interiorLink = exportDlg.getByRole('link', { name: /_내지\.pdf$/ });
  await expect(coverLink).toBeVisible();

  const downloadBytes = async (link: typeof coverLink) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), link.click()]);
    const path = await dl.path();
    return { name: dl.suggestedFilename(), bytes: await readFile(path) };
  };
  const cover = await downloadBytes(coverLink);
  const interior = await downloadBytes(interiorLink);
  expect(cover.name).toBe('테스트 그림책_표지.pdf');
  expect(interior.name).toBe('테스트 그림책_내지.pdf');
  expect(cover.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(interior.bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  const pageCount = (interior.bytes.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  expect(pageCount).toBe(2);

  // Privacy: nothing left localhost
  expect(external).toEqual([]);
});

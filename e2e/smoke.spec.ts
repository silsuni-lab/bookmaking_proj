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

test('background photo can be dragged, zoomed and reset', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 책 만들기' }).click();
  const setup = page.getByRole('dialog', { name: '새 책 만들기' });
  await setup.getByLabel('책 제목').fill('배경 위치');
  await setup.getByLabel('아이 이름').fill('하준');
  await setup.getByRole('button', { name: '만들기' }).click();
  await page.locator('aside.inspector input[type=file]').setInputFiles(ROTATED); // portrait photo on a square page
  await expect(page.getByRole('heading', { name: '배경 사진' })).toBeVisible();
  const frame = async () => (await readDb(page)).books[0]?.cover.front.bgFrame;

  // Drag the photo upward on the page: the view moves toward the bottom of the photo
  const box = (await page.locator('.page-editor canvas').first().boundingBox())!;
  const x = box.x + box.width * 0.25;
  const y = box.y + box.height * 0.6;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 40, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await frame())?.cy ?? 0.5).toBeGreaterThan(0.5);

  // Click the photo to select it, then drag the bottom-right page-corner handle outward: the photo grows
  const pageMm = 206; // 200mm square + bleed
  const sc = Math.min((box.width - 48) / pageMm, (box.height - 48) / pageMm);
  const offX = box.x + (box.width - pageMm * sc) / 2;
  const offY = box.y + (box.height - pageMm * sc) / 2;
  await page.mouse.click(x, y);
  const hx = offX + pageMm * sc, hy = offY + pageMm * sc;
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx + 200, hy + 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await frame())?.zoom ?? 1).toBeGreaterThan(1.2);
  // dragging inward past the start can never shrink the photo below the page
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx - 300, hy - 300, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await frame())?.zoom).toBe(1);

  await page.getByLabel('확대').fill('2');
  await expect.poll(async () => (await frame())?.zoom).toBe(2);

  await page.getByRole('button', { name: '처음 위치로' }).click();
  await expect.poll(frame).toBeUndefined();
});

test('a placed drawing can be rotated, flipped, colour-tweaked and re-cleaned', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/');
  await page.getByRole('button', { name: '새 책 만들기' }).click();
  const setup = page.getByRole('dialog', { name: '새 책 만들기' });
  await setup.getByLabel('책 제목').fill('그림 편집');
  await setup.getByLabel('아이 이름').fill('하준');
  await setup.getByRole('button', { name: '만들기' }).click();

  await page.getByRole('button', { name: '그림 넣기' }).click();
  const add = page.getByRole('dialog', { name: '그림 넣기' });
  await add.getByTestId('cleanup-file').setInputFiles(DRAWING);
  await add.getByRole('button', { name: '다음', exact: true }).click();
  await add.getByRole('button', { name: '다음', exact: true }).click();
  // one eraser stroke, which must survive the redo
  const paint = (await add.locator('canvas.paint').boundingBox())!;
  await page.mouse.move(paint.x + paint.width * 0.2, paint.y + paint.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(paint.x + paint.width * 0.4, paint.y + paint.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await add.getByRole('button', { name: '완료' }).click();
  await expect(add).toBeHidden();

  const drawing = async () => (await readDb(page)).books[0]?.cover.front.elements.find((e: { kind: string }) => e.kind === 'image');
  await expect.poll(async () => (await drawing())?.cleanup?.sourceAssetId).toBeTruthy();
  const first = await drawing();
  expect(first.cleanup.quad).toHaveLength(4);
  expect(first.cleanup.maskAssetId).toBeTruthy();

  await page.getByRole('button', { name: '↻ 오른쪽으로' }).click();
  await page.getByRole('button', { name: '좌우 뒤집기' }).click();
  await page.getByLabel(/^밝기/).fill('30');
  await expect.poll(async () => {
    const d = await drawing();
    return d && { rotation: d.rotation, flipX: d.flipX, brightness: d.adjust?.brightness };
  }).toEqual({ rotation: 90, flipX: true, brightness: 30 });

  // White ink on, then off again (keeps the other colour settings)
  await page.getByRole('checkbox', { name: /흰색으로 바꾸기/ }).check();
  await expect.poll(async () => (await drawing())?.adjust?.toWhite).toBe(true);
  await expect(page.getByLabel(/^밝기/)).toBeHidden();
  await page.getByRole('checkbox', { name: /흰색으로 바꾸기/ }).uncheck();
  await expect.poll(async () => (await drawing())?.adjust).toEqual({ brightness: 30, contrast: 0, saturation: 0, toWhite: false });

  // A speech bubble behind it, yellow, tail on the right
  await page.getByRole('radio', { name: '말풍선' }).check();
  await page.getByRole('button', { name: '뒤 배경 색 #FFF4B8' }).click();
  await page.getByRole('radio', { name: '오른쪽' }).check();
  await expect.poll(async () => (await drawing())?.backdrop).toEqual({ shape: 'bubble', color: '#FFF4B8', tail: 'right' });

  // Redo the paper removal from the saved original: opens straight at the paper step
  const beforeRedo = await drawing();
  await page.getByRole('button', { name: '배경 지우기 다시 하기' }).click();
  const redo = page.getByRole('dialog', { name: '그림 배경 다시 지우기' });
  await expect(redo.getByText('지우기 강도')).toBeVisible();
  await redo.getByRole('button', { name: '다음', exact: true }).click();
  await redo.getByRole('button', { name: '완료' }).click();
  await expect(redo).toBeHidden();
  await expect.poll(async () => (await drawing())?.assetId).not.toBe(first.assetId);
  const after = await drawing();
  expect(after.cleanup.sourceAssetId).toBe(first.cleanup.sourceAssetId); // the original is reused, not copied
  expect(after.cleanup.maskAssetId).toBeTruthy(); // the saved brush strokes were restored and kept
  const keep = (d: any) => ({ x: d.x, y: d.y, width: d.width, rotation: d.rotation, flipX: d.flipX, adjust: d.adjust });
  expect(keep(after)).toEqual(keep(beforeRedo));

  // Dragging a colour slider is one undo step
  const slider = (await page.getByLabel(/^대비/).boundingBox())!;
  await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider.x + slider.width * 0.7, slider.y + slider.height / 2, { steps: 6 });
  await page.mouse.move(slider.x + slider.width * 0.9, slider.y + slider.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await drawing())?.adjust?.contrast).toBeGreaterThan(40);
  await page.getByRole('heading', { name: '선택한 그림' }).click(); // move focus off the slider
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await drawing())?.adjust?.contrast).toBe(0);
  expect((await drawing()).adjust.brightness).toBe(30);

  // The drawing was saved to the collection; place it on a new page from there
  const book = async () => (await readDb(page)).books[0];
  expect((await book()).library).toHaveLength(1);
  const libAsset = (await book()).library[0].assetId;
  await page.getByRole('button', { name: '+ 쪽 추가' }).click();
  await expect(page.getByRole('heading', { name: '1쪽', level: 2 })).toBeVisible();
  await page.getByRole('button', { name: '모음의 그림 1 넣기' }).click();
  await expect.poll(async () => (await book())?.items[0]?.elements.map((e: { assetId?: string }) => e.assetId)).toEqual([libAsset]);
  expect((await book()).items[0].elements[0].cleanup?.sourceAssetId).toBeTruthy(); // can still redo the cleanup there

  // Taking it out of the collection keeps it on the pages
  await page.getByRole('button', { name: '모음에서 그림 1 빼기' }).click();
  await expect.poll(async () => (await book()).library).toHaveLength(0);
  expect((await book()).items[0].elements).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('typed text can get a speech bubble, which replaces the white band', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '새 책 만들기' }).click();
  const setup = page.getByRole('dialog', { name: '새 책 만들기' });
  await setup.getByLabel('책 제목').fill('글자 말풍선');
  await setup.getByLabel('아이 이름').fill('하준');
  await setup.getByRole('button', { name: '만들기' }).click();
  await page.getByRole('button', { name: '글자 넣기' }).click();
  await expect(page.getByRole('heading', { name: '선택한 글자' })).toBeVisible();
  await page.getByRole('checkbox', { name: '글자 뒤 흰 띠' }).check();

  await page.getByRole('radio', { name: '말풍선' }).check();
  await page.getByRole('button', { name: '뒤 배경 색 #D6ECFF' }).click();
  const text = async () =>
    (await readDb(page)).books[0]?.cover.front.elements.find((e: { text?: string }) => e.text === '여기에 글을 써 주세요');
  await expect.poll(async () => {
    const t = await text();
    return t && { backdrop: t.backdrop, band: t.band };
  }).toEqual({ backdrop: { shape: 'bubble', color: '#D6ECFF' }, band: false });
  await expect(page.getByRole('checkbox', { name: '글자 뒤 흰 띠' })).toBeHidden();

  await page.getByRole('radio', { name: '없음' }).check();
  await expect.poll(async () => (await text())?.backdrop).toBeUndefined();
  await expect(page.getByRole('checkbox', { name: '글자 뒤 흰 띠' })).toBeVisible();
});

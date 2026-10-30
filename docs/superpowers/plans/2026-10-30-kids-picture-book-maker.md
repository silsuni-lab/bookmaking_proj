# 어린이 그림책 만들기 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이의 사진·그림·손글씨로 여러 쪽 그림책을 편집하고, 업체 전달용 인쇄 PDF(표지/내지)를 내보내는 브라우저 전용 웹 앱.

**Architecture:** Vite + React + TypeScript 정적 SPA. 이미지 처리(종이 지우기, 원근 보정)와 쪽 배치·PDF 레이아웃은 DOM 없는 순수 함수(`src/core/`)로 두고 Vitest로 검증한다. 편집 화면은 react-konva, 상태는 zustand(+zundo로 undo), 저장은 IndexedDB(`idb`), PDF는 jsPDF. 서버 없음, 외부 네트워크 요청 없음.

**Tech Stack:** Vite 6, React 18, TypeScript 5 (strict), react-konva/konva, zustand + zundo, idb, jszip, jspdf, @fontsource/gaegu, Vitest + fake-indexeddb, Playwright(e2e 1개).

**Spec:** `docs/superpowers/specs/2026-10-30-kids-picture-book-maker-design.md`

## Global Constraints

- 모든 처리는 브라우저 안에서. 앱이 런타임에 localhost(배포 시 자기 origin) 외의 주소로 요청을 보내면 안 된다. 폰트도 번들에 포함.
- 판형 프리셋: 정사각 20×20cm, A5(148×210), A4(210×297). A5·A4는 세로/가로 선택.
- 재단 여유분 사방 3mm, 해상도 300dpi.
- 출력 파일: `표지.pdf`(앞표지 1쪽 + 뒤표지 1쪽), `내지.pdf`. 각 쪽 크기 = 판형 + 사방 3mm.
- PDF 각 쪽은 300dpi로 평탄화한 JPEG 한 장(sRGB, quality 0.92). CMYK 변환 없음.
- 내지 1쪽은 오른쪽 면. 펼침면은 왼쪽 면에서 시작. 내보낼 때 홀수 쪽이면 끝에 빈 쪽 추가.
- 배경 지우기는 "손맛 살리기": 종이만 투명하게, 옅은 칠·질감 보존.
- UI 문구는 한국어, 컴퓨터에 익숙하지 않은 부모 기준의 쉬운 말.
- 편집 화면은 PC 데스크톱 브라우저 전용(최소 너비 1024px).
- 좌표 단위: 모델에 저장되는 모든 위치·크기는 **mm, 재단선(trim) 기준 원점**. 픽셀은 렌더링 시점에만 계산.

## Review Focus

1. **아이폰 HEIC 사진·지원 안 되는 파일** → 앱이 멈추지 않고 "이 사진 형식은 열 수 없어요. JPG나 PNG로 바꿔 주세요 (파일명)"을 보여 준다. (Task 7 테스트)
2. **회전 정보(EXIF)가 있는 휴대폰 사진** → 화면과 PDF에 똑바로 보인다. (Task 7 테스트: `createImageBitmap`에 `imageOrientation: 'from-image'` 전달 확인, Task 16 e2e 픽스처)
3. **저장 공간 부족·시크릿 모드 등으로 자동 저장 실패** → 조용히 넘어가지 않고 "저장하지 못했어요. 책 파일로 내보내 백업하세요" 배너를 보여 준다. (Task 9 테스트)
4. **30쪽 이상 책을 내보낼 때 메모리** → 쪽을 한 번에 하나씩 렌더링·해제해서 브라우저가 죽지 않는다. (Task 11 테스트: 동시 렌더 수 ≤ 1)
5. **쪽이 하나도 없거나 배경 사진이 빠진 쪽** → 내보내기 전에 무엇이 문제인지 목록으로 알려 주고, 빈 쪽은 흰 면으로 내보낸다. (Task 11 테스트)

---

## File Structure

```
package.json, vite.config.ts, tsconfig.json, index.html, .gitignore
.github/workflows/deploy.yml          GitHub Pages 배포
src/
  core/                               DOM 없는 순수 로직 (Vitest)
    model.ts                          타입, 판형, 상수, 새 책/새 쪽 생성
    pagination.ts                     쪽 번호·좌우 면·펼침면 정렬 규칙
    geometry.ts                       mm↔px, cover-fit, 유효 dpi, 펼침면 분할
    paper.ts                          종이 지우기 알고리즘
    mask.ts                           지우개/되살리기 붓 마스크
    perspective.ts                    호모그래피, 원근 보정 warp
    drawPlan.ts                       쪽 → 그리기 명령 목록
    validate.ts                       내보내기 전 점검
  io/
    imageLoader.ts                    파일 → RawImage / Blob, 크기 제한, 오류
    storage.ts                        IndexedDB 저장소
    bookFile.ts                       .kidbook(zip) 내보내기/불러오기
    renderCanvas.ts                   DrawOp[] → Canvas 실행
    exportPdf.ts                      jsPDF로 표지/내지 생성
  state/
    bookStore.ts                      zustand 스토어, undo, 자동 저장
  ui/
    App.tsx, BookList.tsx, BookSetup.tsx
    cleanup/CleanupDialog.tsx         그림 정리 화면
    editor/PageEditor.tsx, ElementNode.tsx, PageList.tsx, Inspector.tsx
    ExportDialog.tsx, SaveBanner.tsx
  main.tsx, styles.css
tests/core/*.test.ts, tests/io/*.test.ts, tests/state/*.test.ts
e2e/smoke.spec.ts, e2e/fixtures/{drawing.jpg, photo-rotated.jpg}
```

---

### Task 1: 프로젝트 뼈대와 데이터 모델

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`, `src/main.tsx`, `src/ui/App.tsx`, `src/core/model.ts`
- Test: `tests/core/model.test.ts`

**Interfaces:**
- Produces (`src/core/model.ts`):
```ts
export const BLEED_MM = 3;
export const DPI = 300;
export type PageSizeId = 'sq200' | 'a5p' | 'a5l' | 'a4p' | 'a4l';
export interface PageSize { id: PageSizeId; label: string; widthMm: number; heightMm: number }
export const PAGE_SIZES: Record<PageSizeId, PageSize>;
export type LayoutKind = 'full' | 'spread' | 'blank';
interface ElementBase { id: string; x: number; y: number; width: number; height: number; rotation: number } // mm, trim origin of the item's canvas
export interface ImageElement extends ElementBase { kind: 'image'; assetId: string; role: 'drawing' | 'handwriting' }
export interface TextElement extends ElementBase { kind: 'text'; text: string; fontSizePt: number; color: string; band: boolean }
export type PageElement = ImageElement | TextElement;
export interface PageItem { id: string; layout: LayoutKind; backgroundAssetId: string | null; photoSide: 'left' | 'right'; elements: PageElement[] }
export interface Book { id: string; title: string; childName: string; sizeId: PageSizeId; cover: { front: PageItem; back: PageItem }; items: PageItem[]; updatedAt: number }
export interface Asset { id: string; blob: Blob; widthPx: number; heightPx: number; kind: 'photo' | 'cutout' }
export type ItemRef = { kind: 'cover'; which: 'front' | 'back' } | { kind: 'item'; id: string };
export function newBook(sizeId: PageSizeId, title?: string, childName?: string): Book; // 앞표지에 제목(28pt)·"글·그림 {childName}"(14pt) TextElement를 미리 배치
export function newItem(layout: LayoutKind): PageItem;
export function itemCanvasMm(item: PageItem, size: PageSize): { widthMm: number; heightMm: number }; // trim size; spread = 2× width
export function newId(): string; // crypto.randomUUID()
```
- `photoSide`는 `spread`에서만 의미: 배경 사진이 덮는 쪽. 반대쪽은 크림색 `#FFFDF5`.

- [ ] **Step 1: 스캐폴드**

`npm create vite@latest . -- --template react-ts` 후 의존성 설치:
`npm i react-konva konva zustand zundo idb jszip jspdf @fontsource/gaegu` / `npm i -D vitest fake-indexeddb @playwright/test`.
`vite.config.ts`에 `base: './'`, `test: { environment: 'node', include: ['tests/**/*.test.ts'] }`. `package.json` scripts: `"test": "vitest run"`, `"e2e": "playwright test"`. `.gitignore`에 `node_modules dist .superpowers test-results`. `git init`.

- [ ] **Step 2: 실패하는 테스트**

```ts
test('page sizes', () => {
  expect(PAGE_SIZES.sq200).toMatchObject({ widthMm: 200, heightMm: 200 });
  expect(PAGE_SIZES.a4l).toMatchObject({ widthMm: 297, heightMm: 210 });
  expect(PAGE_SIZES.a5p).toMatchObject({ widthMm: 148, heightMm: 210 });
});
test('spread canvas is double width', () => {
  expect(itemCanvasMm(newItem('spread'), PAGE_SIZES.a4l)).toEqual({ widthMm: 594, heightMm: 210 });
  expect(itemCanvasMm(newItem('full'), PAGE_SIZES.a4l)).toEqual({ widthMm: 297, heightMm: 210 });
});
test('newBook has cover front/back as full items and no interior pages', () => {
  const b = newBook('sq200', '우리 공원', '하린');
  expect(b.cover.front.layout).toBe('full');
  expect(b.cover.back.layout).toBe('full');
  expect(b.items).toEqual([]);
  expect(b.cover.front.elements.map(e => e.kind === 'text' && e.text)).toEqual(['우리 공원', '글·그림 하린']);
});
```

- [ ] **Step 3: `npm test` → FAIL (모듈 없음)**
- [ ] **Step 4: `model.ts` 구현. 라벨: `정사각 20×20cm`, `A5 세로`, `A5 가로`, `A4 세로`, `A4 가로`.**
- [ ] **Step 5: `npm test` → PASS, `npm run build` 성공**
- [ ] **Step 6: Commit** `git add -A && git commit -m "chore: scaffold app and book data model"`

---

### Task 2: 쪽 배치 규칙

**Files:** Create `src/core/pagination.ts` · Test `tests/core/pagination.test.ts`

**Interfaces:**
- Consumes: `PageItem` (Task 1)
- Produces:
```ts
export interface PageSlot { itemId: string | null; pageNumber: number; side: 'left' | 'right'; half: 'whole' | 'left' | 'right' } // itemId null = auto-added blank
export function paginate(items: PageItem[]): PageSlot[];               // 1쪽 = right
export function misalignedSpreads(items: PageItem[]): string[];         // 오른쪽 면에서 시작하는 spread의 item id
export function fixAlignment(items: PageItem[], spreadId: string): PageItem[]; // 그 spread 앞에 blank item 하나 삽입
export function padForExport(slots: PageSlot[]): PageSlot[];            // 홀수면 끝에 itemId:null blank
```

- [ ] **Step 1: 실패하는 테스트**

```ts
const f = () => newItem('full'), s = () => newItem('spread');
test('page 1 is right, then alternates', () => {
  expect(paginate([f(), f(), f()]).map(p => p.side)).toEqual(['right', 'left', 'right']);
});
test('spread takes two slots', () => {
  const sl = paginate([f(), s()]);
  expect(sl.map(p => [p.pageNumber, p.side, p.half])).toEqual([[1,'right','whole'],[2,'left','left'],[3,'right','right']]);
});
test('spread starting on right is misaligned', () => {
  const sp = s(); expect(misalignedSpreads([sp])).toEqual([sp.id]);
  expect(misalignedSpreads(fixAlignment([sp], sp.id))).toEqual([]);
  expect(fixAlignment([sp], sp.id)[0].layout).toBe('blank');
});
test('pad to even', () => {
  expect(padForExport(paginate([f()]))).toHaveLength(2);
  expect(padForExport(paginate([f()]))[1].itemId).toBeNull();
  expect(padForExport(paginate([f(), f()]))).toHaveLength(2);
});
```

- [ ] **Step 2: `npx vitest run tests/core/pagination.test.ts` → FAIL**
- [ ] **Step 3: 구현** (misaligned spread도 paginate는 그대로 두 쪽을 차지시킨다. 정렬 여부는 경고로만 다룬다)
- [ ] **Step 4: 테스트 PASS**
- [ ] **Step 5: Commit** `feat: page pagination and spread alignment rules`

---

### Task 3: 기하 계산

**Files:** Create `src/core/geometry.ts` · Test `tests/core/geometry.test.ts`

**Interfaces:**
- Produces:
```ts
export function mmToPx(mm: number, dpi?: number): number;   // 기본 DPI, Math.round
export interface Rect { x: number; y: number; width: number; height: number }
export function coverFit(srcW: number, srcH: number, boxW: number, boxH: number): Rect; // 원본에서 잘라낼 영역(src 좌표), 중앙 정렬
export function effectiveDpi(srcPx: number, printedMm: number): number;
export const DPI_WARN = 200; // 이 미만이면 화질 경고 (Claude의 판단)
export function splitSpreadMm(trimWidthMm: number, bleedMm: number): { left: Rect1D; right: Rect1D } // spread 캔버스(bleed 포함) x 구간
export interface Rect1D { start: number; end: number }
```
- 배경 사진은 `bleed 포함 영역`(trim + 사방 3mm)을 덮는다.

- [ ] **Step 1: 실패하는 테스트**

```ts
expect(mmToPx(25.4)).toBe(300);
expect(coverFit(4000, 3000, 200, 200)).toEqual({ x: 500, y: 0, width: 3000, height: 3000 });
expect(effectiveDpi(1200, 203.2)).toBeCloseTo(150);
// A4 세로 펼침면: 캔버스 폭 3+420+3=426mm. 왼쪽 쪽 [0,216], 오른쪽 쪽 [210,426]
expect(splitSpreadMm(210, 3)).toEqual({ left: { start: 0, end: 216 }, right: { start: 210, end: 426 } });
```

- [ ] **Step 2: FAIL 확인** · **Step 3: 구현** · **Step 4: PASS 확인**
- [ ] **Step 5: Commit** `feat: geometry helpers for print layout`

---

### Task 4: 종이 지우기 알고리즘

**Files:** Create `src/core/paper.ts` · Test `tests/core/paper.test.ts`

**Interfaces:**
- Produces:
```ts
export interface RawImage { width: number; height: number; data: Uint8ClampedArray } // RGBA
export interface PaperResult { image: RawImage; normalized: RawImage } // normalized = 조명·종이색 평탄화한 불투명 이미지 (되살리기 붓이 사용)
export function removePaper(src: RawImage, strength: number): PaperResult; // strength 0..1, 기본 0.5
```

- [ ] **Step 1: 실패하는 테스트** (테스트 헬퍼 `fill(w,h,rgb)`, `paint(img, rect, rgb)`, `gradient(...)` 를 같은 파일에)

```ts
test('plain paper becomes transparent', () => {
  const r = removePaper(fill(64, 64, [243, 234, 210]), 0.5); // 누런 종이
  expect(maxAlpha(r.image)).toBeLessThan(10);
});
test('shadowed paper (brightness 150→245 gradient) becomes transparent', () => {
  expect(maxAlpha(removePaper(shadowGradient(128, 128), 0.5).image)).toBeLessThan(10);
});
test('dark stroke stays opaque with its colour', () => {
  const img = fill(64, 64, [240, 232, 205]); paint(img, {x:20,y:0,width:6,height:64}, [200, 30, 30]);
  const px = pixel(removePaper(img, 0.5).image, 22, 32);
  expect(px.a).toBeGreaterThan(240); expect(px.r).toBeGreaterThan(px.g + 100);
});
test('pale crayon is kept partially (손맛)', () => {
  const img = fill(64, 64, [245, 242, 235]); paint(img, {x:10,y:10,width:20,height:20}, [245, 225, 140]);
  const a = pixel(removePaper(img, 0.5).image, 20, 20).a;
  expect(a).toBeGreaterThan(60); expect(a).toBeLessThan(255);
});
test('higher strength removes more', () => {
  const img = fill(64, 64, [245, 242, 235]); paint(img, {x:10,y:10,width:20,height:20}, [230, 220, 190]);
  expect(pixel(removePaper(img, 0.9).image, 20, 20).a).toBeLessThan(pixel(removePaper(img, 0.2).image, 20, 20).a);
});
```

- [ ] **Step 2: FAIL 확인**
- [ ] **Step 3: 구현** — 알고리즘(테스트가 정하지 않는 부분):
  1. 배경 추정: 이미지를 32px 블록으로 나눠 블록마다 채널별 90번째 백분위 값을 구하고, 블록 중심 사이를 쌍선형 보간해 픽셀별 종이색 `bg`를 만든다.
  2. 평탄화: `n = clamp(c / bg * 255)` (채널별). 이게 `normalized`.
  3. 잉크량: `ink = max(255 - n.r, 255 - n.g, 255 - n.b)`.
  4. 알파: `t0 = 6 + 40*strength`, `t1 = t0 + 60` 으로 `alpha = 255 * smoothstep(t0, t1, ink)`. 이 부드러운 경계 덕분에 옅은 칠이 반투명으로 남는다.
  5. 색 복원(흰 바탕 합성 시 `n`이 되도록): `c = (n - (1 - a)*255) / a`, a는 0..1, a < 0.02면 0.
- [ ] **Step 4: PASS 확인.** 별도 테스트 `large image under 3s`: 4000×3000 입력이 3000ms 안에 끝난다(timeout 3000).
- [ ] **Step 5: Commit** `feat: paper removal preserving crayon texture`

---

### Task 5: 지우개/되살리기 마스크

**Files:** Create `src/core/mask.ts` · Test `tests/core/mask.test.ts`

**Interfaces:**
- Consumes: `RawImage`, `PaperResult` (Task 4)
- Produces:
```ts
export const MASK_AUTO = 0, MASK_ERASE = 1, MASK_RESTORE = 2;
export function newMask(w: number, h: number): Uint8Array;
export function paintMask(mask: Uint8Array, w: number, h: number, cx: number, cy: number, radius: number, value: 0 | 1 | 2): void; // 원형 붓
export function applyMask(result: PaperResult, mask: Uint8Array): RawImage; // ERASE → a=0, RESTORE → normalized 색 + a=255, AUTO → result.image
```

- [ ] **Step 1: 실패하는 테스트**: 10×10 결과에 `paintMask(..., 5,5, 2, MASK_ERASE)` 후 (5,5) 알파 0, (0,0)은 원래 값 유지. RESTORE 후 (5,5)는 `normalized`의 RGB와 a=255. 반지름 2 붓은 (5,8)을 건드리지 않음.
- [ ] **Step 2: FAIL** · **Step 3: 구현** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: erase/restore brush mask`

---

### Task 6: 원근 보정

**Files:** Create `src/core/perspective.ts` · Test `tests/core/perspective.test.ts`

**Interfaces:**
- Produces:
```ts
export type Pt = { x: number; y: number };
export type Quad = [Pt, Pt, Pt, Pt]; // 좌상, 우상, 우하, 좌하
export function homography(src: Quad, dst: Quad): number[]; // 3x3 row-major, h[8]=1
export function outputSize(q: Quad): { width: number; height: number }; // 마주보는 변 길이의 최댓값
export function warpQuad(src: RawImage, q: Quad): RawImage; // q 영역을 직사각형으로 펴기, 쌍선형 샘플링
```
- 사용자는 네 모서리를 끌어서 지정(수동). 기본값은 이미지 네 귀퉁이. 자동 검출은 하지 않는다 (Claude의 판단).

- [ ] **Step 1: 실패하는 테스트**: 항등 사각형 → `homography`가 단위행렬(±1e-9). 100×100 이미지에서 q=전체일 때 `warpQuad` 결과가 원본과 픽셀 동일. 사다리꼴 q=[(10,0),(90,0),(100,100),(0,100)]에 대해 `homography(dst, q)`로 dst 네 꼭짓점을 변환하면 q 꼭짓점과 ±1e-6 일치.
- [ ] **Step 2: FAIL** · **Step 3: 구현 (8×8 선형계 가우스 소거)** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: manual perspective correction`

---

### Task 7: 이미지 불러오기

**Files:** Create `src/io/imageLoader.ts` · Test `tests/io/imageLoader.test.ts`

**Interfaces:**
- Consumes: `RawImage` (Task 4)
- Produces:
```ts
export const MAX_SIDE_PX = 4000; // 이보다 크면 긴 변 기준 축소 (Claude의 판단: 20×20cm 300dpi에 충분하고 메모리 안전)
export class ImageLoadError extends Error { constructor(public fileName: string, public reason: 'unsupported' | 'corrupt') }
export async function loadBitmap(file: Blob & { name?: string }): Promise<ImageBitmap>;  // createImageBitmap(file, { imageOrientation: 'from-image' }), 실패 시 ImageLoadError
export function fitWithin(w: number, h: number, max: number): { width: number; height: number };
export async function bitmapToRaw(bmp: ImageBitmap, max?: number): Promise<RawImage>;  // OffscreenCanvas
export async function rawToPngBlob(img: RawImage): Promise<Blob>;
export async function bitmapToJpegBlob(bmp: ImageBitmap, max?: number): Promise<Blob>; // 배경 사진 저장용, quality 0.92
export function loadErrorMessage(e: ImageLoadError): string;
```

- [ ] **Step 1: 실패하는 테스트** (`globalThis.createImageBitmap`을 `vi.fn`으로 대체)

```ts
test('passes orientation option', async () => {
  const spy = vi.fn().mockResolvedValue({ width: 10, height: 10 }); globalThis.createImageBitmap = spy;
  await loadBitmap(new Blob(['x'], { type: 'image/jpeg' }));
  expect(spy.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image' });
});
test('HEIC that fails to decode → unsupported with file name', async () => {
  globalThis.createImageBitmap = vi.fn().mockRejectedValue(new DOMException('x', 'InvalidStateError'));
  const f = Object.assign(new Blob(['x'], { type: 'image/heic' }), { name: 'IMG_0001.HEIC' });
  await expect(loadBitmap(f)).rejects.toMatchObject({ reason: 'unsupported', fileName: 'IMG_0001.HEIC' });
});
test('message', () => {
  expect(loadErrorMessage(new ImageLoadError('a.heic', 'unsupported'))).toBe('a.heic: 이 사진 형식은 열 수 없어요. JPG나 PNG로 바꿔서 다시 넣어 주세요.');
});
test('fitWithin', () => { expect(fitWithin(8000, 6000, 4000)).toEqual({ width: 4000, height: 3000 }); expect(fitWithin(100, 50, 4000)).toEqual({ width: 100, height: 50 }); });
```
- `reason`: MIME이 `image/heic|heif`이거나 확장자가 `.heic/.heif`면 `unsupported`, 그 외 디코드 실패는 `corrupt`(메시지: `"{name}: 사진을 읽지 못했어요. 다른 사진을 골라 주세요."`).

- [ ] **Step 2: FAIL** · **Step 3: 구현** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: image loading with orientation and friendly errors`

---

### Task 8: 저장소와 책 파일

**Files:** Create `src/io/storage.ts`, `src/io/bookFile.ts` · Test `tests/io/storage.test.ts`, `tests/io/bookFile.test.ts`

**Interfaces:**
- Consumes: `Book`, `Asset`, `newId` (Task 1)
- Produces:
```ts
// storage.ts — DB 'kids-book-maker' v1, stores: books(keyPath id), assets(keyPath id, index bookId)
export interface StoredAsset extends Asset { bookId: string }
export async function listBooks(): Promise<Pick<Book, 'id' | 'title' | 'childName' | 'updatedAt'>[]>; // updatedAt 내림차순
export async function loadBook(id: string): Promise<Book | undefined>;
export async function saveBook(book: Book): Promise<void>;
export async function deleteBook(id: string): Promise<void>; // 그 책의 asset도 삭제
export async function putAsset(a: StoredAsset): Promise<void>;
export async function getAsset(id: string): Promise<StoredAsset | undefined>;
export async function assetsOf(bookId: string): Promise<StoredAsset[]>;
// bookFile.ts — 확장자 .kidbook, zip: book.json + assets/{id}.{png|jpg} + manifest.json {version:1, assets:[{id,kind,widthPx,heightPx,file}]}
export async function exportBookFile(book: Book, assets: StoredAsset[]): Promise<Blob>;
export async function importBookFile(file: Blob): Promise<{ book: Book; assets: StoredAsset[] }>; // 새 book id 부여, asset bookId 갱신
export class BookFileError extends Error {}  // 메시지: '책 파일이 아니거나 손상되었어요.'
```

- [ ] **Step 1: 실패하는 테스트** (`import 'fake-indexeddb/auto'`, 테스트마다 `indexedDB.deleteDatabase`)
  - save → load 동일, listBooks가 최근 순.
  - deleteBook 후 `assetsOf(id)` 빈 배열.
  - export → import 왕복: title·items 동일, `book.id`는 달라짐, asset blob 크기 동일.
  - 아무 zip 아닌 Blob import → `BookFileError`.
- [ ] **Step 2: FAIL** · **Step 3: 구현** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: IndexedDB storage and .kidbook import/export`

---

### Task 9: 상태 스토어 (편집 동작, undo, 자동 저장)

**Files:** Create `src/state/bookStore.ts` · Test `tests/state/bookStore.test.ts`

**Interfaces:**
- Consumes: model(Task 1, `ItemRef` 포함), pagination `fixAlignment`(Task 2), storage `saveBook`(Task 8)
- Produces:
```ts
export type SaveStatus = 'saved' | 'saving' | 'error';
interface BookState {
  book: Book | null; selected: ItemRef | null; saveStatus: SaveStatus;
  open(book: Book): void;
  setMeta(p: Partial<Pick<Book, 'title' | 'childName' | 'sizeId'>>): void;
  addItem(layout: LayoutKind, afterId?: string): string;
  removeItem(id: string): void; moveItem(id: string, toIndex: number): void;
  setLayout(ref: ItemRef, layout: LayoutKind): void;
  setBackground(ref: ItemRef, assetId: string | null): void; setPhotoSide(ref: ItemRef, side: 'left' | 'right'): void;
  addElement(ref: ItemRef, el: PageElement): void;
  updateElement(ref: ItemRef, elId: string, patch: Partial<PageElement>): void;
  removeElement(ref: ItemRef, elId: string): void;
  fixSpread(id: string): void;
}
export const useBookStore: UseBoundStore<...>;   // zustand + zundo temporal (limit 50), book 필드만 추적
export function startAutosave(save?: (b: Book) => Promise<void>, delayMs?: number): () => void; // 기본 saveBook, 1000ms 디바운스
```
- 모든 변경은 `book.updatedAt = Date.now()`.

- [ ] **Step 1: 실패하는 테스트** (`vi.useFakeTimers()`)
  - addItem('full') 후 items 길이 1, undo(`useBookStore.temporal.getState().undo()`) 후 0.
  - updateElement로 x 변경 → 해당 요소만 바뀜.
  - autosave: 변경 후 999ms엔 save 미호출, 1000ms에 1회 호출, `saveStatus`가 `saved`.
  - **save가 reject(QuotaExceededError)하면 `saveStatus === 'error'`** (Review Focus 3).
- [ ] **Step 2: FAIL** · **Step 3: 구현** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: book store with undo and autosave`

---

### Task 10: 그리기 계획과 캔버스 렌더러

**Files:** Create `src/core/drawPlan.ts`, `src/io/renderCanvas.ts` · Test `tests/core/drawPlan.test.ts`

**Interfaces:**
- Consumes: geometry(Task 3), model(Task 1)
- Produces:
```ts
// drawPlan.ts — 단위 mm, 원점 = bleed 포함 캔버스 좌상단
export type DrawOp =
  | { op: 'fill'; color: string; rect: Rect }
  | { op: 'image'; assetId: string; src: Rect | null; dest: Rect; rotation: number } // src null = 전체
  | { op: 'band'; rect: Rect; color: 'rgba(255,255,255,0.75)'; radiusMm: 2 }
  | { op: 'text'; text: string; rect: Rect; fontSizePt: number; color: string; rotation: number; font: 'Gaegu' };
export interface AssetDims { [assetId: string]: { widthPx: number; heightPx: number } }
export function planItem(item: PageItem, size: PageSize, dims: AssetDims): { widthMm: number; heightMm: number; ops: DrawOp[] }; // canvas = itemCanvasMm + 2*BLEED
// renderCanvas.ts
export async function renderOps(plan: ReturnType<typeof planItem>, bitmaps: Map<string, ImageBitmap>, pxPerMm: number): Promise<OffscreenCanvas>;
```
- 순서: 흰색 fill → (full: 배경이 bleed 포함 전체 / spread: `photoSide` 쪽 반 + 바깥·가운데 bleed까지, 반대쪽 `#FFFDF5` fill) → 요소(배열 순서 = 위로 쌓임). 요소 좌표는 trim 기준이므로 `+BLEED_MM` 이동. band는 text 요소에 `band:true`일 때 text 바로 아래.
- 텍스트는 `rect` 안에서 줄바꿈, 가운데 정렬, Gaegu 폰트 (`document.fonts.load` 후 그림).

- [ ] **Step 1: 실패하는 테스트**
  - sq200 full + 4000×3000 배경 → ops[1] = `{op:'image', src:{x:500,y:0,width:3000,height:3000}, dest:{x:0,y:0,width:206,height:206}}`.
  - text 요소 x=10,y=20, band:true → band op가 text op 바로 앞, dest x=13,y=23.
  - spread, photoSide 'left', A4 세로 → 사진 dest `{x:0,y:0,width:213,height:303}`, 크림 fill `{x:213,y:0,width:213,height:303}`.
  - blank → fill 하나뿐.
- [ ] **Step 2: FAIL** · **Step 3: 구현 (renderOps는 단위테스트 없이 Task 16 e2e로 검증)** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: draw plan and canvas renderer`

---

### Task 11: 점검과 PDF 내보내기

**Files:** Create `src/core/validate.ts`, `src/io/exportPdf.ts` · Test `tests/core/validate.test.ts`, `tests/io/exportPdf.test.ts`

**Interfaces:**
- Consumes: pagination(Task 2), geometry(Task 3), drawPlan(Task 10)
- Produces:
```ts
// validate.ts
export type Issue =
  | { level: 'error'; code: 'no-pages' }
  | { level: 'warn'; code: 'no-background'; ref: ItemRef }
  | { level: 'warn'; code: 'low-res'; ref: ItemRef; assetId: string; dpi: number }
  | { level: 'warn'; code: 'misaligned-spread'; ref: ItemRef };
export function checkBook(book: Book, dims: AssetDims): Issue[];
export function issueText(i: Issue, pageLabel: string): string;
// exportPdf.ts
export type PageRenderer = (item: PageItem | null, half: 'whole' | 'left' | 'right') => Promise<Uint8Array>; // JPEG bytes, bleed 포함 한 쪽
export async function buildPdf(pages: Array<() => Promise<Uint8Array>>, size: PageSize, onProgress?: (done: number, total: number) => void): Promise<Blob>;
export async function exportBook(book: Book, render: PageRenderer, onProgress?: ...): Promise<{ cover: Blob; interior: Blob }>;
```
- `buildPdf`: jsPDF `{ unit: 'mm', format: [w+6, h+6], orientation 자동 }`, 쪽마다 `addImage(bytes,'JPEG',0,0,w+6,h+6)`. **쪽 렌더러는 순서대로 하나씩 await** (Review Focus 4).
- 펼침면 half: 'left'는 spread 캔버스의 `splitSpreadMm().left`, 'right'는 `.right` 구간을 잘라 냄.
- `low-res` 기준: `effectiveDpi < DPI_WARN(200)`. 배경은 cover-fit으로 잘린 src 폭 ÷ bleed 포함 폭, 요소는 asset 폭 ÷ 요소 폭.
- 문구: `no-pages` "아직 내지가 한 쪽도 없어요.", `no-background` "{p}: 배경 사진이 없어요. 흰 바탕으로 인쇄돼요.", `low-res` "{p}: 사진이 작아서 인쇄하면 흐릿할 수 있어요 (약 {dpi}dpi).", `misaligned-spread` "{p}: 펼침면이 오른쪽 면에서 시작해요. 앞에 빈 쪽을 넣어 주세요." 표지 라벨은 "앞표지"/"뒤표지", 내지는 "{n}쪽".

- [ ] **Step 1: 실패하는 테스트**
  - `checkBook(newBook('sq200'))` → `[{level:'error',code:'no-pages'}, …]` 포함.
  - 1200×1200px 배경 + sq200 full → low-res, dpi ≈ 148 (1200 ÷ 206mm).
  - `buildPdf` 3쪽(작은 JPEG 픽스처 bytes) → 출력 텍스트에 `/Type /Page` 3회, MediaBox 폭 `206mm → 583.94pt`(±0.1).
  - 동시성: 렌더러가 실행 중 카운터를 올렸다 내리게 하고 최댓값 1.
  - `exportBook`: full 1개 → interior 2쪽(빈 쪽 패드), cover 2쪽; spread 하나(앞에 blank)→ interior 4쪽 (blank, spread-left, spread-right, pad).
- [ ] **Step 2: FAIL** · **Step 3: 구현** · **Step 4: PASS**
- [ ] **Step 5: Commit** `feat: pre-export checks and print PDF export`

---

### Task 12: 책 목록과 책 설정 화면

**Files:** Create `src/ui/App.tsx`(교체), `src/ui/BookList.tsx`, `src/ui/BookSetup.tsx`, `src/ui/SaveBanner.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: storage(Task 8), bookFile(Task 8), bookStore(Task 9)
- 화면 흐름: 목록(`BookList`) ↔ 편집기. 상태는 `App`의 `view: 'list' | 'editor'`. 라우터 없음.
- `BookList`: 카드 목록(제목, 아이 이름, 마지막 수정일), "새 책 만들기", "책 파일 불러오기", 카드별 "열기/책 파일로 저장/삭제". 삭제는 앱 내 확인 모달 (`window.confirm` 금지).
- `BookSetup`(새 책 모달): 제목, 아이 이름, 판형 5개 라디오(라벨은 Task 1). 판형 변경은 쪽이 없을 때만 허용, 그 외엔 "판형은 쪽을 만들기 전에만 바꿀 수 있어요." 안내.
- `SaveBanner`: `saveStatus==='error'`면 상단 빨간 배너 "저장하지 못했어요. [책 파일로 저장] 버튼으로 백업해 주세요."

- [ ] **Step 1: 구현 + `src/main.tsx`에서 `@fontsource/gaegu` import**
- [ ] **Step 2: 확인** `npm run dev` → 새 책 만들기 → 새로고침 후 목록에 남아 있음, 삭제 모달 동작, 책 파일 저장 후 불러오기로 복제됨. `npm run build` 성공.
- [ ] **Step 3: Commit** `feat: book list and setup screens`

---

### Task 13: 그림 정리 화면

**Files:** Create `src/ui/cleanup/CleanupDialog.tsx`, `src/ui/cleanup/cleanupWorker.ts`

**Interfaces:**
- Consumes: imageLoader(Task 7), paper(Task 4), mask(Task 5), perspective(Task 6), storage `putAsset`(Task 8)
- Produces: `<CleanupDialog bookId role onDone(asset: StoredAsset) onCancel />`
- 단계 3개, 상단에 1·2·3 표시:
  1. **모서리 맞추기**: 사진 위 네 점을 끌어 종이 모서리에 맞춤. "건너뛰기" 가능.
  2. **배경 지우기**: 좌우 비교(원본 | 결과, 결과 뒤는 체크무늬). "지우기 강도" 슬라이더(0~1, 기본 0.5, 놓을 때 재계산).
  3. **다듬기**: "지우개"/"되살리기" 토글 + 붓 크기 슬라이더, 결과 위에 드래그해 칠함.
  - "완료" → `applyMask` 결과를 PNG로 저장, `kind: 'cutout'`.
- `removePaper`·`warpQuad`는 Web Worker(`cleanupWorker.ts`)에서 실행해 화면이 멈추지 않게 한다. 처리 중엔 "그림을 정리하고 있어요…" 표시.
- 불러오기 실패 시 `loadErrorMessage`를 다이얼로그 안에 표시.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** `e2e/fixtures/drawing.jpg`(누런 종이에 크레파스 그림, 휴대폰 촬영본 하나를 픽스처로 둔다)로 세 단계 진행 → 결과 PNG가 종이 투명·크레파스 결 유지. 슬라이더 올리면 더 많이 지워짐. HEIC 파일 넣으면 안내 문구.
- [ ] **Step 3: Commit** `feat: drawing cleanup dialog`

---

### Task 14: 쪽 편집기

**Files:** Create `src/ui/editor/PageEditor.tsx`, `src/ui/editor/ElementNode.tsx`, `src/ui/editor/Inspector.tsx`

**Interfaces:**
- Consumes: bookStore(Task 9), drawPlan `planItem`(Task 10), geometry(Task 3), validate(Task 11), CleanupDialog(Task 13), imageLoader(Task 7)
- `PageEditor`: 선택된 `ItemRef`의 캔버스를 react-konva `Stage`로 표시. 화면 배율 = 사용 가능 영역에 맞춤(px/mm). 재단선(실선)과 bleed 영역(바깥 3mm, 반투명 회색)과 안전 여백 선(재단선 안쪽 5mm 점선, Claude의 판단)을 그린다.
- 배경은 `planItem`의 배경 op를 그대로 사용해 PDF와 같은 결과를 보장.
- `ElementNode`: 이미지/텍스트 노드, 클릭 선택 → Konva `Transformer`(비율 유지 기본, 회전 허용). `onDragEnd`/`onTransformEnd`에서 px→mm 변환 후 `updateElement`. Delete 키로 삭제, Ctrl/Cmd+Z / Shift+Ctrl/Cmd+Z undo/redo.
- `Inspector`(오른쪽 패널):
  - 쪽 구성: "사진 가득"(full) / "양쪽 펼침면"(spread) / "빈 쪽"(blank). 표지는 구성 선택 숨김.
  - 펼침면이면 "사진 쪽: 왼쪽/오른쪽".
  - 버튼: "배경 사진 넣기", "그림 넣기", "손글씨 넣기"(둘 다 CleanupDialog), "글자 넣기".
  - 선택한 글자 요소: 내용(textarea), 크기(pt), 색, "글자 뒤 흰 띠".
  - 이 쪽의 `checkBook` 경고 표시.
- 새 요소 기본 위치: 그림은 캔버스(펼침면은 사진 쪽) 가운데 폭 50%, 손글씨·글자는 하단 가운데 폭 80%. `setMeta`로 제목·아이 이름이 바뀌면 앞표지의 해당 글자 요소 내용도 함께 바꾼다(사용자가 그 글자를 직접 고친 적이 없을 때만).

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** `npm run dev`: 배경 넣기 → 그림 넣기 → 끌어 옮기고 크기 조절 → 새로고침 후 위치 유지. 글자 넣기·띠 켜기. 펼침면 전환 시 사진이 한쪽만 덮음. 1200px 사진 넣으면 경고. Undo 동작.
- [ ] **Step 3: Commit** `feat: page editor with drag and resize`

---

### Task 15: 쪽 목록과 내보내기 화면

**Files:** Create `src/ui/editor/PageList.tsx`, `src/ui/ExportDialog.tsx`; Modify `src/ui/App.tsx`

**Interfaces:**
- Consumes: pagination(Task 2), bookStore(Task 9), validate·exportPdf(Task 11), renderCanvas(Task 10), storage `getAsset`
- `PageList`(왼쪽): "앞표지", "뒤표지", 그 아래 내지를 **좌우 펼친 모양**으로(1쪽은 오른쪽에 혼자). 썸네일은 `renderOps` 저해상도(pxPerMm 0.5). 끌어서 순서 바꾸기, "+ 쪽 추가", 쪽 삭제(앱 내 확인). misaligned spread에는 빨간 표시와 "빈 쪽 넣어 맞추기" 버튼(`fixSpread`).
- `ExportDialog`: `checkBook` 결과 목록(error면 내보내기 버튼 비활성) → "PDF 만들기" → 진행률 "12 / 30쪽" → `표지.pdf`, `내지.pdf` 다운로드 링크 두 개. 렌더러는 asset Blob → `createImageBitmap` → `renderOps`(pxPerMm = 300/25.4) → `convertToBlob({type:'image/jpeg', quality:0.92})`, 쪽이 끝나면 bitmap `close()`.
- 다운로드 파일 이름: `{책 제목}_표지.pdf`, `{책 제목}_내지.pdf` (파일명에 못 쓰는 문자는 `_`).

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** 3쪽 + 펼침면 1개 책을 A4 가로로 내보내기 → 내지 PDF 쪽 크기 303×216mm, 펼침면 그림이 두 쪽에 이어짐, 홀수면 빈 쪽 추가됨. 표지 PDF 2쪽.
- [ ] **Step 3: Commit** `feat: page list and PDF export dialog`

---

### Task 16: E2E 확인과 배포

**Files:** Create `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/fixtures/photo-rotated.jpg`, `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: 전체 앱

- [ ] **Step 1: e2e 작성** (`webServer: npm run build && npx vite preview --port 4173`)
  - 새 책(sq200) → 앞표지 배경에 `photo-rotated.jpg`(EXIF orientation 6, 세로 사진) → 캔버스 배경이 세로 방향인지 Konva 이미지 노드 크기 비율로 확인 (Review Focus 2).
  - 그림 넣기(`drawing.jpg`) → 정리 3단계 완료 → 요소 1개 생김.
  - 쪽 추가 2개 → 새로고침 → 쪽 2개 유지.
  - 내보내기 → 다운로드 2개, 내지 PDF 바이트에 `/Type /Page` 2회.
  - 테스트 전체에서 `page.on('request')`로 localhost 외 요청 0건 (Global Constraints).
- [ ] **Step 2: `npx playwright install chromium && npm run e2e` → PASS**
- [ ] **Step 3: 배포 워크플로** — `main` push 시 `npm ci && npm test && npm run build` 후 `actions/upload-pages-artifact` + `actions/deploy-pages`로 `dist` 배포.
- [ ] **Step 4: README** — 부모용 사용법 5단계(사진 찍기 팁: 밝은 곳, 그림자 피하기, 종이 전체가 나오게 / 책 만들기 / 그림 정리 / 저장·백업 / 업체에 PDF 보내기), 아이 사진은 컴퓨터 밖으로 나가지 않는다는 안내.
- [ ] **Step 5: `npm test && npm run build` 전체 PASS 확인**
- [ ] **Step 6: Commit** `chore: e2e smoke test, Pages deploy, README`

import type { ImageAdjust } from './adjust';
import type { Backdrop } from './backdrop';
import type { BgFrame } from './geometry';
import type { Quad } from './perspective';


export const BLEED_MM = 3;
export const DPI = 300;

export type PageSizeId = 'sq200' | 'a5p' | 'a5l' | 'a4p' | 'a4l';
export interface PageSize {
  id: PageSizeId;
  label: string;
  widthMm: number;
  heightMm: number;
}

export const PAGE_SIZES: Record<PageSizeId, PageSize> = {
  sq200: { id: 'sq200', label: '정사각 20×20cm', widthMm: 200, heightMm: 200 },
  a5p: { id: 'a5p', label: 'A5 세로', widthMm: 148, heightMm: 210 },
  a5l: { id: 'a5l', label: 'A5 가로', widthMm: 210, heightMm: 148 },
  a4p: { id: 'a4p', label: 'A4 세로', widthMm: 210, heightMm: 297 },
  a4l: { id: 'a4l', label: 'A4 가로', widthMm: 297, heightMm: 210 },
};

export type LayoutKind = 'full' | 'spread' | 'blank';

// mm, trim origin of the item's canvas
interface ElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}
/** What a cutout was made from, so the paper removal can be redone later. Absent on drawings added before this existed. */
export interface CleanupSource {
  sourceAssetId: string;
  /** Paper corners in source pixels; null = corners step skipped. */
  quad: Quad | null;
  strength: number;
  /** Touch-up brush mask (grey PNG); null = no brush strokes. */
  maskAssetId: string | null;
}
export interface ImageElement extends ElementBase {
  kind: 'image';
  assetId: string;
  role: 'drawing' | 'handwriting';
  flipX?: boolean;
  adjust?: ImageAdjust;
  backdrop?: Backdrop;
  cleanup?: CleanupSource;
}
export interface TextElement extends ElementBase {
  kind: 'text';
  text: string;
  fontSizePt: number;
  color: string;
  band: boolean;
}
export type PageElement = ImageElement | TextElement;

/** photoSide is only meaningful for 'spread': the side covered by the background photo (the other side is cream #FFFDF5). */
export interface PageItem {
  id: string;
  layout: LayoutKind;
  backgroundAssetId: string | null;
  /** Position/zoom of the background photo; absent = centred, no zoom. */
  bgFrame?: BgFrame;
  photoSide: 'left' | 'right';
  elements: PageElement[];
}

/** A drawing or handwriting kept in the book's collection so it can be placed on more pages. */
export interface LibraryItem {
  id: string;
  assetId: string;
  role: 'drawing' | 'handwriting';
  cleanup?: CleanupSource;
}

export interface Book {
  id: string;
  title: string;
  childName: string;
  sizeId: PageSizeId;
  cover: { front: PageItem; back: PageItem };
  items: PageItem[];
  /** Newest first. Absent on books saved before the collection existed (see withLibrary). */
  library?: LibraryItem[];
  updatedAt: number;
}

export interface Asset {
  id: string;
  blob: Blob;
  widthPx: number;
  heightPx: number;
  /** source = original photo of a drawing (JPEG); mask = touch-up mask (PNG). Neither is drawn directly. */
  kind: 'photo' | 'cutout' | 'source' | 'mask';
}

export type ItemRef = { kind: 'cover'; which: 'front' | 'back' } | { kind: 'item'; id: string };

export function newId(): string {
  return crypto.randomUUID();
}

export function newItem(layout: LayoutKind): PageItem {
  return { id: newId(), layout, backgroundAssetId: null, photoSide: 'left', elements: [] };
}

/** Gives an older book a collection made of the drawings already on its pages (one per cutout). */
export function withLibrary(book: Book): Book {
  if (book.library) return book;
  const seen = new Set<string>();
  const library: LibraryItem[] = [];
  for (const item of [book.cover.front, book.cover.back, ...book.items]) {
    for (const e of item.elements) {
      if (e.kind !== 'image' || seen.has(e.assetId)) continue;
      seen.add(e.assetId);
      library.push({ id: newId(), assetId: e.assetId, role: e.role, ...(e.cleanup ? { cleanup: e.cleanup } : {}) });
    }
  }
  return { ...book, library };
}

/** Ids of every asset the book uses (backgrounds, image elements, and the drawing collection). */
export function referencedAssetIds(book: Book): Set<string> {
  const ids = new Set<string>();
  for (const l of book.library ?? []) {
    ids.add(l.assetId);
    if (l.cleanup) {
      ids.add(l.cleanup.sourceAssetId);
      if (l.cleanup.maskAssetId) ids.add(l.cleanup.maskAssetId);
    }
  }
  for (const item of [book.cover.front, book.cover.back, ...book.items]) {
    if (item.backgroundAssetId) ids.add(item.backgroundAssetId);
    for (const e of item.elements) {
      if (e.kind !== 'image') continue;
      ids.add(e.assetId);
      if (e.cleanup) {
        ids.add(e.cleanup.sourceAssetId);
        if (e.cleanup.maskAssetId) ids.add(e.cleanup.maskAssetId);
      }
    }
  }
  return ids;
}

export function itemCanvasMm(item: PageItem, size: PageSize): { widthMm: number; heightMm: number } {
  return {
    widthMm: item.layout === 'spread' ? size.widthMm * 2 : size.widthMm,
    heightMm: size.heightMm,
  };
}

function textElement(
  text: string,
  fontSizePt: number,
  x: number,
  y: number,
  width: number,
  height: number,
): TextElement {
  return { id: newId(), kind: 'text', x, y, width, height, rotation: 0, text, fontSizePt, color: '#222222', band: false };
}

type Box = Pick<TextElement, 'x' | 'y' | 'width' | 'height'>;

/** Where the automatic front-cover title and byline sit (mm) for a page size. */
export function coverTextBoxes(size: PageSize): { title: Box; byline: Box } {
  const width = size.widthMm * 0.8;
  const x = (size.widthMm - width) / 2;
  return {
    title: { x, y: size.heightMm * 0.12, width, height: size.heightMm * 0.15 },
    byline: { x, y: size.heightMm * 0.3, width, height: size.heightMm * 0.07 },
  };
}

export function newBook(sizeId: PageSizeId, title = '', childName = ''): Book {
  const { title: t, byline: b } = coverTextBoxes(PAGE_SIZES[sizeId]);
  const front = newItem('full');
  front.elements.push(
    textElement(title, 28, t.x, t.y, t.width, t.height),
    textElement(`글·그림 ${childName}`, 14, b.x, b.y, b.width, b.height),
  );
  return {
    id: newId(),
    title,
    childName,
    sizeId,
    cover: { front, back: newItem('full') },
    library: [],
    items: [],
    updatedAt: Date.now(),
  };
}

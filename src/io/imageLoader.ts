import type { RawImage } from '../core/paper';

export const MAX_SIDE_PX = 4000; // 20×20cm 300dpi에 충분하고 메모리 안전

export function loadErrorMessage(e: ImageLoadError): string {
  return e.reason === 'unsupported'
    ? `${e.fileName}: 이 사진 형식은 열 수 없어요. JPG나 PNG로 바꿔서 다시 넣어 주세요.`
    : `${e.fileName}: 사진을 읽지 못했어요. 다른 사진을 골라 주세요.`;
}

export class ImageLoadError extends Error {
  constructor(public fileName: string, public reason: 'unsupported' | 'corrupt') {
    super();
    this.name = 'ImageLoadError';
    this.message = loadErrorMessage(this);
  }
}

function isHeic(file: Blob & { name?: string }): boolean {
  return /^image\/(heic|heif)$/i.test(file.type) || /\.(heic|heif)$/i.test(file.name ?? '');
}

export async function loadBitmap(file: Blob & { name?: string }): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageLoadError(file.name || '사진', isHeic(file) ? 'unsupported' : 'corrupt');
  }
}

export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const s = max / longest;
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

function drawScaled(bmp: ImageBitmap, max: number): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const { width, height } = fitWithin(bmp.width, bmp.height, max);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없어요 (OffscreenCanvas 2d context is null)');
  ctx.drawImage(bmp, 0, 0, width, height);
  return { canvas, ctx };
}

export async function bitmapToRaw(bmp: ImageBitmap, max: number = MAX_SIDE_PX): Promise<RawImage> {
  const { canvas, ctx } = drawScaled(bmp, max);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: d.width, height: d.height, data: d.data };
}

export async function rawToPngBlob(img: RawImage): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D 캔버스를 만들 수 없어요 (OffscreenCanvas 2d context is null)');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Encodes the bitmap as JPEG (downscaled to ≤ max px); width/height are the encoded image's real size. */
export async function bitmapToJpegBlob(
  bmp: ImageBitmap,
  max: number = MAX_SIDE_PX,
): Promise<{ blob: Blob; width: number; height: number }> {
  const { canvas } = drawScaled(bmp, max);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return { blob, width: canvas.width, height: canvas.height };
}

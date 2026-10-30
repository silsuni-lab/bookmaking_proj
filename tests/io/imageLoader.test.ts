import { afterEach, expect, test, vi } from 'vitest';
import { ImageLoadError, fitWithin, loadBitmap, loadErrorMessage } from '../../src/io/imageLoader';

const original = globalThis.createImageBitmap;
afterEach(() => { globalThis.createImageBitmap = original; });

test('passes orientation option', async () => {
  const spy = vi.fn().mockResolvedValue({ width: 10, height: 10 });
  globalThis.createImageBitmap = spy;
  await loadBitmap(new Blob(['x'], { type: 'image/jpeg' }));
  expect(spy.mock.calls[0][1]).toEqual({ imageOrientation: 'from-image' });
});
test('HEIC that fails to decode → unsupported with file name', async () => {
  globalThis.createImageBitmap = vi.fn().mockRejectedValue(new DOMException('x', 'InvalidStateError'));
  const f = Object.assign(new Blob(['x'], { type: 'image/heic' }), { name: 'IMG_0001.HEIC' });
  await expect(loadBitmap(f)).rejects.toMatchObject({ reason: 'unsupported', fileName: 'IMG_0001.HEIC' });
});
test('HEIC by extension only → unsupported', async () => {
  globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('x'));
  const f = Object.assign(new Blob(['x']), { name: 'a.heif' });
  await expect(loadBitmap(f)).rejects.toMatchObject({ reason: 'unsupported' });
});
test('other decode failure → corrupt, default name', async () => {
  globalThis.createImageBitmap = vi.fn().mockRejectedValue(new Error('x'));
  await expect(loadBitmap(new Blob(['x'], { type: 'image/jpeg' }))).rejects.toMatchObject({ reason: 'corrupt', fileName: '사진', name: 'ImageLoadError' });
});
test('message', () => {
  expect(loadErrorMessage(new ImageLoadError('a.heic', 'unsupported'))).toBe('a.heic: 이 사진 형식은 열 수 없어요. JPG나 PNG로 바꿔서 다시 넣어 주세요.');
  expect(loadErrorMessage(new ImageLoadError('b.jpg', 'corrupt'))).toBe('b.jpg: 사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
  expect(new ImageLoadError('b.jpg', 'corrupt').message).toBe('b.jpg: 사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
});
test('fitWithin', () => {
  expect(fitWithin(8000, 6000, 4000)).toEqual({ width: 4000, height: 3000 });
  expect(fitWithin(100, 50, 4000)).toEqual({ width: 100, height: 50 });
});

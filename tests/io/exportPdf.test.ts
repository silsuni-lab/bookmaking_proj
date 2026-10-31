import { describe, it, expect } from 'vitest';
import { buildPdf, exportBook } from '../../src/io/exportPdf';
import { PAGE_SIZES, newBook, newItem } from '../../src/core/model';
import type { PageItem } from '../../src/core/model';

const JPEG_B64 = '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACKADAAQAAAABAAAACAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgACAAIAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8Az6KKK/lc/tg//9k=';
const jpeg = () => Uint8Array.from(atob(JPEG_B64), c => c.charCodeAt(0));
const text = async (b: Blob) => new TextDecoder('latin1').decode(await b.arrayBuffer());

describe('buildPdf', () => {
  it('writes one PDF page per renderer with bleed-inclusive MediaBox', async () => {
    const calls: Array<[number, number]> = [];
    const blob = await buildPdf([async () => jpeg(), async () => jpeg(), async () => jpeg()], PAGE_SIZES.sq200, (d, t) => calls.push([d, t]));
    expect(blob.type).toBe('application/pdf');
    const s = await text(blob);
    expect(s.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(3);
    const m = s.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
    expect(m).not.toBeNull();
    expect(Math.abs(Number(m![1]) - 583.94)).toBeLessThan(0.1);
    expect(Math.abs(Number(m![2]) - 583.94)).toBeLessThan(0.1);
    expect(calls).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('runs renderers strictly one at a time', async () => {
    let running = 0;
    let max = 0;
    const r = async () => {
      running++;
      max = Math.max(max, running);
      await new Promise(res => setTimeout(res, 5));
      running--;
      return jpeg();
    };
    await buildPdf([r, r, r, r], PAGE_SIZES.sq200);
    expect(max).toBe(1);
  });
});

describe('exportBook', () => {
  it('pads a single full page to two interior pages; cover has two', async () => {
    const book = newBook('sq200');
    const full = newItem('full');
    book.items.push(full);
    const calls: Array<[string | null, string]> = [];
    const progress: Array<[number, number]> = [];
    const out = await exportBook(book, async (it: PageItem | null, half) => {
      calls.push([it ? it.id : null, half]);
      return jpeg();
    }, (d, t) => progress.push([d, t]));
    expect(calls).toEqual([
      [book.cover.front.id, 'whole'],
      [book.cover.back.id, 'whole'],
      [full.id, 'whole'],
      [null, 'whole'],
    ]);
    expect((await text(out.cover)).match(/\/Type \/Page\b(?!s)/g)).toHaveLength(2);
    expect((await text(out.interior)).match(/\/Type \/Page\b(?!s)/g)).toHaveLength(2);
    expect(progress[progress.length - 1]).toEqual([4, 4]);
  });

  it('splits a spread into left/right and pads', async () => {
    const book = newBook('sq200');
    const blank = newItem('blank');
    const spread = newItem('spread');
    book.items.push(blank, spread);
    const calls: Array<[string | null, string]> = [];
    const out = await exportBook(book, async (it, half) => {
      calls.push([it ? it.id : null, half]);
      return jpeg();
    });
    expect(calls.slice(2)).toEqual([
      [blank.id, 'whole'],
      [spread.id, 'left'],
      [spread.id, 'right'],
      [null, 'whole'],
    ]);
    expect((await text(out.interior)).match(/\/Type \/Page\b(?!s)/g)).toHaveLength(4);
  });
});

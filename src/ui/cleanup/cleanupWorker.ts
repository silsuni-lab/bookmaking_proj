import { removePaper, type RawImage } from '../../core/paper';
import { warpQuad, type Quad } from '../../core/perspective';

type Request =
  | { id: number; type: 'warp'; img: RawImage; quad: Quad }
  | { id: number; type: 'paper'; img: RawImage; strength: number };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

scope.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'warp') {
      const img = warpQuad(m.img, m.quad);
      scope.postMessage({ id: m.id, img }, [img.data.buffer]);
    } else {
      const { image, normalized } = removePaper(m.img, m.strength);
      scope.postMessage({ id: m.id, image, normalized }, [image.data.buffer, normalized.data.buffer]);
    }
  } catch (err) {
    scope.postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) });
  }
};

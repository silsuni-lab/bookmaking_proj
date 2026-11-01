import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetDims } from '../../core/drawPlan';
import { assetsOf, type StoredAsset } from '../../io/storage';

export interface BookAssets {
  dims: AssetDims;
  images: Map<string, HTMLImageElement>;
  add(asset: StoredAsset): void;
}

/** Loads a book's stored assets once and keeps decoded images for the canvas. */
export function useBookAssets(bookId: string): BookAssets {
  const [state, setState] = useState<{ dims: AssetDims; images: Map<string, HTMLImageElement> }>({
    dims: {},
    images: new Map(),
  });
  const urls = useRef<string[]>([]);
  const alive = useRef(true);

  const register = useCallback((assets: StoredAsset[]) => {
    // Original photos and masks are only needed when redoing a cleanup; don't decode them for the canvas.
    const loaded = assets.filter((a) => a.kind === 'photo' || a.kind === 'cutout').map(
      (a) =>
        new Promise<[StoredAsset, HTMLImageElement | null]>((resolve) => {
          const url = URL.createObjectURL(a.blob);
          urls.current.push(url);
          const img = new Image();
          img.onload = () => resolve([a, img]);
          img.onerror = () => resolve([a, null]);
          img.src = url;
        }),
    );
    void Promise.all(loaded).then((pairs) => {
      if (!alive.current) return;
      setState((prev) => {
        const dims = { ...prev.dims };
        const images = new Map(prev.images);
        for (const [a, img] of pairs) {
          dims[a.id] = { widthPx: a.widthPx, heightPx: a.heightPx };
          if (img) images.set(a.id, img);
        }
        return { dims, images };
      });
    });
  }, []);

  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void assetsOf(bookId).then((all) => {
      if (!cancelled) register(all);
    });
    return () => {
      cancelled = true;
      alive.current = false;
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    };
  }, [bookId, register]);

  const add = useCallback((asset: StoredAsset) => register([asset]), [register]);
  return { dims: state.dims, images: state.images, add };
}

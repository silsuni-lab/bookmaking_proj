import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeMask, encodeMask } from '../../core/adjust';
import { applyMask, MASK_ERASE, MASK_RESTORE, newMask, paintMask } from '../../core/mask';
import { newId } from '../../core/model';
import type { CleanupSource } from '../../core/model';
import type { PaperResult, RawImage } from '../../core/paper';
import type { Pt, Quad } from '../../core/perspective';
import { bitmapToRaw, blobToRaw, ImageLoadError, loadBitmap, loadErrorMessage, rawToJpegBlob, rawToPngBlob } from '../../io/imageLoader';
import { getAsset, putAsset, type StoredAsset } from '../../io/storage';

export interface CleanupOutput {
  cutout: StoredAsset;
  /** Original photo / mask assets newly stored by this run. */
  saved: StoredAsset[];
  cleanup: CleanupSource;
}

interface Props {
  bookId: string;
  role: 'drawing' | 'handwriting';
  /** Start from a drawing's saved original and settings instead of picking a photo. */
  redo?: CleanupSource;
  onDone(out: CleanupOutput): void;
  onCancel(): void;
}

type Stage = 'pick' | 'corners' | 'paper' | 'touchup';
type WorkerReply = { error: string } | { img: RawImage } | PaperResult;

const STEP_LABELS = ['모서리 맞추기', '배경 지우기', '다듬기'];
const STAGE_INDEX: Record<Stage, number> = { pick: 0, corners: 1, paper: 2, touchup: 3 };

function drawRaw(canvas: HTMLCanvasElement | null, raw: RawImage): void {
  if (!canvas) return;
  canvas.width = raw.width;
  canvas.height = raw.height;
  canvas.getContext('2d')?.putImageData(new ImageData(raw.data as Uint8ClampedArray<ArrayBuffer>, raw.width, raw.height), 0, 0);
}

function copyRaw(r: RawImage): RawImage {
  return { width: r.width, height: r.height, data: new Uint8ClampedArray(r.data) };
}

function defaultQuad(raw: RawImage): Quad {
  const inset = 0.08;
  return [
    { x: raw.width * inset, y: raw.height * inset },
    { x: raw.width * (1 - inset), y: raw.height * inset },
    { x: raw.width * (1 - inset), y: raw.height * (1 - inset) },
    { x: raw.width * inset, y: raw.height * (1 - inset) },
  ];
}

export default function CleanupDialog({ bookId, role, redo, onDone, onCancel }: Props) {
  const [stage, setStage] = useState<Stage>('pick');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [strength, setStrength] = useState(0.5);
  const [tool, setTool] = useState<'erase' | 'restore'>('erase');
  const [brush, setBrush] = useState(25);

  const fileInput = useRef<HTMLInputElement>(null);
  const srcRef = useRef<RawImage | null>(null);
  const warpedRef = useRef<RawImage | null>(null);
  const resultRef = useRef<PaperResult | null>(null);
  const maskRef = useRef<Uint8Array | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  // Original photo already stored (redo), the corners actually used, and a saved mask waiting for its result.
  const sourceIdRef = useRef<string | null>(null);
  const usedQuad = useRef<Quad | null>(null);
  const pendingMask = useRef<Uint8Array | null>(null);

  const srcCanvas = useRef<HTMLCanvasElement>(null);
  const origCanvas = useRef<HTMLCanvasElement>(null);
  const resultCanvas = useRef<HTMLCanvasElement>(null);
  const editCanvas = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);

  const mounted = useRef(true);
  const pending = useRef(new Map<number, { resolve(r: WorkerReply): void; reject(e: Error): void }>());
  const msgId = useRef(0);
  const rafHandle = useRef(0);

  useEffect(() => {
    mounted.current = true;
    if (!redo) fileInput.current?.click();
    const waiting = pending.current;
    return () => {
      mounted.current = false;
      cancelAnimationFrame(rafHandle.current);
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const p of waiting.values()) p.reject(new Error('cancelled'));
      waiting.clear();
    };
  }, []);

  const call = useCallback((msg: { type: 'warp' | 'paper'; img: RawImage } & Record<string, unknown>): Promise<WorkerReply> => {
    if (!workerRef.current) {
      const w = new Worker(new URL('./cleanupWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerReply & { id: number }>) => {
        const p = pending.current.get(e.data.id);
        pending.current.delete(e.data.id);
        p?.resolve(e.data);
      };
      w.onerror = (e) => {
        for (const p of pending.current.values()) p.reject(new Error(e.message));
        pending.current.clear();
      };
      workerRef.current = w;
    }
    const w = workerRef.current;
    const id = ++msgId.current;
    return new Promise((resolve, reject) => {
      pending.current.set(id, { resolve, reject });
      w.postMessage({ ...msg, id }, [msg.img.data.buffer]);
    });
  }, []);

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setLoadError(null);
    setBusy(true);
    try {
      const bmp = await loadBitmap(file);
      const raw = await bitmapToRaw(bmp);
      bmp.close();
      if (!mounted.current) return;
      srcRef.current = raw;
      sourceIdRef.current = null;
      pendingMask.current = null;
      setQuad(defaultQuad(raw));
      setNotice(null);
      setStage('corners');
    } catch (e) {
      if (!mounted.current) return;
      setLoadError(e instanceof ImageLoadError ? loadErrorMessage(e) : '사진을 읽지 못했어요. 다른 사진을 골라 주세요.');
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  // Draw the photo whenever step 1 is shown.
  useEffect(() => {
    if (stage === 'corners' && srcRef.current) drawRaw(srcCanvas.current, srcRef.current);
  }, [stage]);

  const runPaper = useCallback(async (warped: RawImage, s: number) => {
    const id = ++reqId.current;
    setBusy(true);
    setNotice(null);
    try {
      const r = await call({ type: 'paper', img: copyRaw(warped), strength: s });
      if (!mounted.current || id !== reqId.current) return false;
      if ('error' in r) throw new Error(r.error);
      if (!('image' in r)) throw new Error('unexpected reply');
      resultRef.current = r;
      const saved = pendingMask.current;
      pendingMask.current = null;
      maskRef.current = saved && saved.length === r.image.width * r.image.height ? saved : newMask(r.image.width, r.image.height);
      drawRaw(resultCanvas.current, r.image);
      return true;
    } catch (e) {
      if (!mounted.current) return false;
      console.error(e);
      if (id === reqId.current) setNotice('그림을 정리하지 못했어요. 다시 시도해 주세요.');
      return false;
    } finally {
      if (mounted.current && id === reqId.current) setBusy(false);
    }
  }, [call]);

  const goPaper = async (useQuad: boolean, q: Quad | null = quad, s: number = strength) => {
    const src = srcRef.current;
    if (!src || !q || busy) return;
    setNotice(null);
    let warped = src;
    if (useQuad) {
      const id = ++reqId.current;
      setBusy(true);
      try {
        const r = await call({ type: 'warp', img: copyRaw(src), quad: q });
        if (!mounted.current || id !== reqId.current) return;
        if ('error' in r) {
          setNotice(r.error === 'degenerate quad' ? '모서리 위치를 다시 맞춰 주세요.' : '그림을 정리하지 못했어요. 다시 시도해 주세요.');
          setBusy(false);
          return;
        }
        if (!('img' in r)) throw new Error('unexpected reply');
        warped = r.img;
      } catch (e) {
        if (!mounted.current) return;
        console.error(e);
        setNotice('그림을 정리하지 못했어요. 다시 시도해 주세요.');
        setBusy(false);
        return;
      }
    }
    warpedRef.current = warped;
    usedQuad.current = useQuad ? q : null;
    resultRef.current = null;
    maskRef.current = null;
    setStage('paper');
    // canvases mount after the stage change; wait one frame
    await new Promise((res) => { rafHandle.current = requestAnimationFrame(res); });
    if (!mounted.current) return;
    await runPaper(warped, s);
  };

  // Redo: load the saved original, corners, strength and brush mask, then open at the paper step.
  useEffect(() => {
    if (!redo) return;
    void (async () => {
      setBusy(true);
      try {
        const a = await getAsset(redo.sourceAssetId);
        if (!a) throw new Error('missing source');
        const raw = await blobToRaw(a.blob);
        const m = redo.maskAssetId ? await getAsset(redo.maskAssetId) : undefined;
        const mask = m ? decodeMask((await blobToRaw(m.blob)).data) : null;
        if (!mounted.current) return;
        srcRef.current = raw;
        sourceIdRef.current = redo.sourceAssetId;
        pendingMask.current = mask;
        const q = redo.quad ?? defaultQuad(raw);
        setQuad(q);
        setStrength(redo.strength);
        setBusy(false);
        await goPaper(redo.quad !== null, q, redo.strength);
      } catch (e) {
        console.error(e);
        if (!mounted.current) return;
        setBusy(false);
        setLoadError('원본 사진을 불러오지 못했어요. 새 사진을 골라 주세요.');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Redraw step 2 panes whenever it is (re)entered, without recomputing.
  useEffect(() => {
    if (stage !== 'paper') return;
    if (warpedRef.current) drawRaw(origCanvas.current, warpedRef.current);
    if (resultRef.current) drawRaw(resultCanvas.current, resultRef.current.image);
  }, [stage]);

  // Recompute only when the slider value is committed (native 'change').
  useEffect(() => {
    const el = sliderRef.current;
    if (stage !== 'paper' || !el) return;
    const onCommit = () => {
      const s = Number(el.value);
      if (warpedRef.current) void runPaper(warpedRef.current, s);
    };
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, [stage, runPaper]);

  const goTouchup = () => {
    const r = resultRef.current;
    if (!r || busy) return;
    setStage('touchup');
  };

  useEffect(() => {
    const r = resultRef.current;
    if (stage === 'touchup' && r && maskRef.current) drawRaw(editCanvas.current, applyMask(r, maskRef.current));
  }, [stage]);

  // --- step 1: corner handles ---
  const dragCorner = (i: number) => (e: React.PointerEvent<HTMLDivElement>) => {
    const src = srcRef.current;
    const canvas = srcCanvas.current;
    if (!src || !canvas) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = Math.min(src.width, Math.max(0, ((ev.clientX - rect.left) / rect.width) * src.width));
      const y = Math.min(src.height, Math.max(0, ((ev.clientY - rect.top) / rect.height) * src.height));
      setQuad((q) => (q ? (q.map((p, k) => (k === i ? { x, y } : p)) as Quad) : q));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  // --- step 3: painting ---
  const rafPending = useRef(false);
  const lastPt = useRef<Pt | null>(null);
  const scheduleRender = () => {
    if (rafPending.current) return;
    rafPending.current = true;
    rafHandle.current = requestAnimationFrame(() => {
      rafPending.current = false;
      const r = resultRef.current;
      if (r && maskRef.current) drawRaw(editCanvas.current, applyMask(r, maskRef.current));
    });
  };
  const paintAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const mask = maskRef.current;
    if (!mask) return;
    const rect = canvas.getBoundingClientRect();
    const p = {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
    const prev = lastPt.current ?? p;
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
    const radius = brush * (canvas.width / rect.width); // slider is in on-screen px
    const steps = Math.max(1, Math.ceil(dist / Math.max(1, radius / 3)));
    const value = tool === 'erase' ? MASK_ERASE : MASK_RESTORE;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      paintMask(mask, canvas.width, canvas.height, prev.x + (p.x - prev.x) * t, prev.y + (p.y - prev.y) * t, radius, value);
    }
    lastPt.current = p;
    scheduleRender();
  };

  const finish = async () => {
    const r = resultRef.current;
    const mask = maskRef.current;
    if (!r || !mask || busy) return;
    setBusy(true);
    setSaveError(false);
    try {
      const final = applyMask(r, mask);
      const blob = await rawToPngBlob(final);
      const cutout: StoredAsset = { id: newId(), bookId, blob, widthPx: final.width, heightPx: final.height, kind: 'cutout' };
      await putAsset(cutout);
      const saved: StoredAsset[] = [];
      let sourceAssetId = sourceIdRef.current;
      if (!sourceAssetId) {
        const src = srcRef.current!;
        const a: StoredAsset = { id: newId(), bookId, blob: await rawToJpegBlob(src), widthPx: src.width, heightPx: src.height, kind: 'source' };
        await putAsset(a);
        saved.push(a);
        sourceAssetId = sourceIdRef.current = a.id;
      }
      let maskAssetId: string | null = null;
      if (mask.some((v) => v !== 0)) {
        const png = await rawToPngBlob({ width: r.image.width, height: r.image.height, data: encodeMask(mask) });
        const m: StoredAsset = { id: newId(), bookId, blob: png, widthPx: r.image.width, heightPx: r.image.height, kind: 'mask' };
        await putAsset(m);
        saved.push(m);
        maskAssetId = m.id;
      }
      if (mounted.current) onDone({ cutout, saved, cleanup: { sourceAssetId, quad: usedQuad.current, strength, maskAssetId } });
    } catch (e) {
      if (!mounted.current) return;
      console.error(e);
      setSaveError(true);
      setBusy(false);
    }
  };

  const noun = role === 'drawing' ? '그림' : '손글씨';
  const title = redo ? `${noun} 배경 다시 지우기` : `${noun} 넣기`;
  const current = STAGE_INDEX[stage];
  const aspect = srcRef.current ? srcRef.current.width / srcRef.current.height : 1;

  return (
    <div className="modal-backdrop">
      <div className="modal cleanup" role="dialog" aria-modal="true" aria-labelledby="cleanup-title">
        <h2 id="cleanup-title">{title}</h2>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          data-testid="cleanup-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            void pickFile(f);
          }}
        />
        <ol className="steps" aria-label="진행 단계">
          {STEP_LABELS.map((l, i) => (
            <li key={l} className={i + 1 === current ? 'on' : ''} aria-current={i + 1 === current ? 'step' : undefined}>
              <b>{i + 1}</b> {l}
            </li>
          ))}
        </ol>

        {stage === 'pick' && (
          <div className="cleanup-pick">
            {loadError && <p className="error" role="alert">{loadError}</p>}
            <button className="btn primary" disabled={busy} onClick={() => fileInput.current?.click()}>
              {loadError ? '다른 사진 고르기' : '사진 고르기'}
            </button>
          </div>
        )}

        {stage === 'corners' && quad && srcRef.current && (
          <>
            <p>사진 위의 네 점을 끌어서 종이 모서리에 맞춰 주세요.</p>
            <div className="cleanup-stage" style={{ aspectRatio: String(aspect) }}>
              <canvas ref={srcCanvas} className="cleanup-canvas" />
              <svg className="cleanup-quad" viewBox={`0 0 ${srcRef.current.width} ${srcRef.current.height}`} preserveAspectRatio="none">
                <polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} />
              </svg>
              {quad.map((p, i) => (
                <div
                  key={i}
                  className="handle"
                  role="slider"
                  aria-label={`모서리 ${i + 1}`}
                  aria-valuenow={0}
                  style={{ left: `${(p.x / srcRef.current!.width) * 100}%`, top: `${(p.y / srcRef.current!.height) * 100}%` }}
                  onPointerDown={dragCorner(i)}
                />
              ))}
            </div>
          </>
        )}

        {stage === 'paper' && (
          <>
            <div className="cleanup-compare">
              <figure><figcaption>원본</figcaption><canvas ref={origCanvas} className="cleanup-canvas" /></figure>
              <figure><figcaption>결과</figcaption><canvas ref={resultCanvas} className="cleanup-canvas checker" /></figure>
            </div>
            <label className="field">
              <span>지우기 강도 ({strength.toFixed(2)})</span>
              <input
                ref={sliderRef}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={strength}
                disabled={busy}
                onChange={(e) => setStrength(Number(e.target.value))}
              />
            </label>
          </>
        )}

        {stage === 'touchup' && (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <button className={`btn${tool === 'erase' ? ' primary' : ''}`} aria-pressed={tool === 'erase'} onClick={() => setTool('erase')}>지우개</button>
              <button className={`btn${tool === 'restore' ? ' primary' : ''}`} aria-pressed={tool === 'restore'} onClick={() => setTool('restore')}>되살리기</button>
              <label className="row">
                붓 크기 ({brush}px)
                <input type="range" min={5} max={80} step={1} value={brush} onChange={(e) => setBrush(Number(e.target.value))} />
              </label>
            </div>
            <canvas
              ref={editCanvas}
              className="cleanup-canvas checker paint"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                lastPt.current = null;
                paintAt(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons) paintAt(e);
              }}
              onPointerUp={() => { lastPt.current = null; }}
              onPointerCancel={() => { lastPt.current = null; }}
            />
          </>
        )}

        {busy && <p role="status">그림을 정리하고 있어요…</p>}
        {notice && <p className="error" role="alert">{notice}</p>}
        {saveError && <p className="error" role="alert">저장하지 못했어요. 다시 시도해 주세요.</p>}

        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>취소</button>
          {stage === 'corners' && (
            <>
              <button className="btn" disabled={busy} onClick={() => void goPaper(false)}>건너뛰기</button>
              <button className="btn primary" disabled={busy} onClick={() => void goPaper(true)}>다음</button>
            </>
          )}
          {stage === 'paper' && (
            <>
              <button className="btn" disabled={busy} onClick={() => { setNotice(null); setStage('corners'); }}>이전</button>
              <button className="btn primary" disabled={busy} onClick={goTouchup}>다음</button>
            </>
          )}
          {stage === 'touchup' && (
            <>
              <button className="btn" disabled={busy} onClick={() => setStage('paper')}>이전</button>
              <button className="btn primary" disabled={busy} onClick={() => void finish()}>완료</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

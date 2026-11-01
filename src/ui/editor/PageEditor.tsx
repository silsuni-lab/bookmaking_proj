import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { planItem } from '../../core/drawPlan';
import type { AssetDims } from '../../core/drawPlan';
import { fitScale } from '../../core/editorLayout';
import { clampFrame, DEFAULT_FRAME, cornerDragScale, frameFromImageRect, imageRectOf, panFrame, scaleRectAbout } from '../../core/geometry';
import type { BgFrame, Rect as RectMm } from '../../core/geometry';
import { BLEED_MM, PAGE_SIZES } from '../../core/model';
import type { ImageElement, ItemRef, PageElement, PageItem } from '../../core/model';
import { isNeutral } from '../../core/adjust';
import { adjustedImage } from '../../io/renderCanvas';
import { useBookStore } from '../../state/bookStore';
import ElementNode from './ElementNode';

const SAFE_MM = 5;
const EDITOR_ADJUST_PX = 1600;
const HANDLE_PX = 12;

/** selectedEl value meaning "the background photo" (element ids are UUIDs). */
export const BG_SELECTED = 'background';

/** The drawing as shown in the editor: colour-adjusted (at screen resolution) when tweaks are set. */
function drawingImage(img: HTMLImageElement | undefined, el: ImageElement): CanvasImageSource | undefined {
  if (!img || isNeutral(el.adjust)) return img;
  return adjustedImage(img, el.adjust!, EDITOR_ADJUST_PX);
}
const PAD = 24;

interface Props {
  itemRef: ItemRef;
  item: PageItem;
  sizeId: keyof typeof PAGE_SIZES;
  dims: AssetDims;
  images: Map<string, HTMLImageElement>;
  selectedEl: string | null;
  onSelectEl(id: string | null): void;
}

function isTyping(t: EventTarget | null): boolean {
  const n = t as HTMLElement | null;
  if (!n) return false;
  if (n.tagName === 'INPUT') return !/^(checkbox|radio|button|file|color)$/.test((n as HTMLInputElement).type);
  return n.tagName === 'TEXTAREA' || n.tagName === 'SELECT' || n.isContentEditable;
}

export default function PageEditor({ itemRef, item, sizeId, dims, images, selectedEl, onSelectEl }: Props) {
  const size = PAGE_SIZES[sizeId];
  // While the background is being dragged, preview the new frame without touching the store (one undo step per drag).
  const [bgPreview, setBgPreview] = useState<BgFrame | null>(null);
  const bgStart = useRef<BgFrame>(DEFAULT_FRAME);
  const bgLive = useRef<BgFrame>(DEFAULT_FRAME);
  const bgRectStart = useRef<RectMm | null>(null);
  const plan = useMemo(
    () => planItem(bgPreview ? { ...item, bgFrame: bgPreview } : item, size, dims),
    [item, size, dims, bgPreview],
  );
  const holder = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });
  const [, setFontTick] = useState(0);
  const nodes = useRef(new Map<string, Konva.Group>());
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    void document.fonts.load('20px Gaegu', '가나다').then(() => setFontTick((t) => t + 1));
  }, []);

  const s = fitScale(box.w - PAD * 2, box.h - PAD * 2, plan.widthMm, plan.heightMm);
  const offX = (box.w - plan.widthMm * s) / 2;
  const offY = (box.h - plan.heightMm * s) / 2;
  const trimW = plan.widthMm - 2 * BLEED_MM;
  const trimH = plan.heightMm - 2 * BLEED_MM;

  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const n = selectedEl ? nodes.current.get(selectedEl) : undefined;
    tr.nodes(n ? [n] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedEl, item, s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const st = useBookStore.getState();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEl && selectedEl !== BG_SELECTED) {
        e.preventDefault();
        st.removeElement(itemRef, selectedEl);
        onSelectEl(null);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        const t = useBookStore.temporal.getState();
        if (e.shiftKey) t.redo();
        else t.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [itemRef, selectedEl, onSelectEl]);

  const commit = (id: string, patch: Partial<PageElement>) => useBookStore.getState().updateElement(itemRef, id, patch);
  const register = (id: string, n: Konva.Group | null) => {
    if (n) nodes.current.set(id, n);
    else nodes.current.delete(id);
  };

  // Selected background: the whole photo (also the cropped-off parts) with corner handles to resize it.
  const bgOp = plan.ops.find((o): o is Extract<typeof o, { op: 'image' }> => o.op === 'image' && o.src !== null);
  const bgImg = bgOp && images.get(bgOp.assetId);
  const bgDims = bgOp && dims[bgOp.assetId];
  const bgSel =
    selectedEl === BG_SELECTED && bgOp && bgImg && bgDims
      ? {
          img: bgImg, dest: bgOp.dest, d: bgDims,
          rect: imageRectOf(bgDims.widthPx, bgDims.heightPx, bgOp.dest, bgPreview ?? item.bgFrame ?? DEFAULT_FRAME),
        }
      : null;
  const hs = HANDLE_PX / s;

  const tint = 'rgba(90,80,70,0.28)';
  const W = plan.widthMm;
  const H = plan.heightMm;
  const B = BLEED_MM;

  return (
    <div className="page-editor" ref={holder}>
      <Stage
        width={box.w}
        height={box.h}
        onMouseDown={(e) => {
          if (e.target.name() === 'bgphoto') onSelectEl(BG_SELECTED);
          else if (e.target === e.target.getStage() || e.target.name() === 'bg') onSelectEl(null);
        }}
      >
        <Layer x={offX} y={offY} scaleX={s} scaleY={s}>
          {bgSel && <KImage image={bgSel.img} {...bgSel.rect} opacity={0.35} listening={false} />}
          {plan.ops.map((op, i) => {
            if (op.op === 'fill') {
              return <Rect key={i} name="bg" {...op.rect} fill={op.color} />;
            }
            if (op.op === 'image' && op.src) {
              const img = images.get(op.assetId);
              const d = dims[op.assetId];
              const { dest } = op;
              // Konva reports the total drag offset from the start; the image itself stays put and only its crop changes.
              const pan = (n: Konva.Node) => {
                bgLive.current = panFrame(d.widthPx, d.heightPx, dest.width, dest.height, bgStart.current, n.x() - dest.x, n.y() - dest.y);
                n.position({ x: dest.x, y: dest.y });
                setBgPreview(bgLive.current);
              };
              return img ? (
                <KImage
                  key={i} name="bgphoto" image={img} {...dest} crop={op.src}
                  draggable dragDistance={3}
                  onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = 'move'; }}
                  onMouseLeave={(e) => { e.target.getStage()!.container().style.cursor = ''; }}
                  onDragStart={() => {
                    bgStart.current = clampFrame(d.widthPx, d.heightPx, dest.width, dest.height, item.bgFrame ?? DEFAULT_FRAME);
                    bgLive.current = bgStart.current;
                  }}
                  onDragMove={(e) => pan(e.target)}
                  onDragEnd={() => {
                    useBookStore.getState().setBgFrame(itemRef, bgLive.current);
                    setBgPreview(null);
                  }}
                />
              ) : null;
            }
            return null;
          })}
          <Group x={B} y={B}>
            {item.elements.map((el) => (
              <ElementNode
                key={el.id}
                el={el}
                image={el.kind === 'image' ? drawingImage(images.get(el.assetId), el) : undefined}
                register={register}
                onSelect={onSelectEl}
                onCommit={commit}
              />
            ))}
          </Group>
          {/* overlays */}
          <Rect x={0} y={0} width={W} height={B} fill={tint} listening={false} />
          <Rect x={0} y={H - B} width={W} height={B} fill={tint} listening={false} />
          <Rect x={0} y={B} width={B} height={H - 2 * B} fill={tint} listening={false} />
          <Rect x={W - B} y={B} width={B} height={H - 2 * B} fill={tint} listening={false} />
          <Rect x={B} y={B} width={trimW} height={trimH} stroke="#333" strokeWidth={0.4} listening={false} />
          <Rect
            x={B + SAFE_MM} y={B + SAFE_MM} width={trimW - 2 * SAFE_MM} height={trimH - 2 * SAFE_MM}
            stroke="#2f80ed" strokeWidth={0.3} dash={[2, 2]} listening={false}
          />
          {item.layout === 'spread' && (
            <Line points={[W / 2, B, W / 2, H - B]} stroke="#999" strokeWidth={0.3} dash={[1.5, 1.5]} listening={false} />
          )}
          {bgSel && (
            <>
              <Rect {...bgSel.rect} stroke="#2f80ed" strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
              {/* handles sit on the photo box corners (always on screen); drag out = bigger, in = smaller */}
              {[0, 1, 2, 3].map((c) => {
                const r = bgSel.rect;
                const box = bgSel.dest;
                const corner = (k: number) => ({
                  x: k === 0 || k === 3 ? box.x : box.x + box.width,
                  y: k === 0 || k === 1 ? box.y : box.y + box.height,
                });
                const { x: cx, y: cy } = corner(c);
                const anchor = corner((c + 2) % 4);
                return (
                  <Rect
                    key={c} name="bghandle" aria-label={`배경 모서리 ${c + 1}`}
                    x={cx - hs / 2} y={cy - hs / 2} width={hs} height={hs}
                    fill="#fff" stroke="#2f80ed" strokeWidth={1.5} strokeScaleEnabled={false} draggable
                    onMouseEnter={(e) => { e.target.getStage()!.container().style.cursor = c % 2 ? 'nesw-resize' : 'nwse-resize'; }}
                    onMouseLeave={(e) => { e.target.getStage()!.container().style.cursor = ''; }}
                    onDragStart={() => {
                      bgRectStart.current = r;
                      bgLive.current = item.bgFrame ?? DEFAULT_FRAME;
                    }}
                    onDragMove={(e) => {
                      const p = { x: e.target.x() + hs / 2, y: e.target.y() + hs / 2 };
                      const k = cornerDragScale(anchor, { x: cx, y: cy }, p);
                      const rect = scaleRectAbout(bgRectStart.current!, anchor, k);
                      bgLive.current = frameFromImageRect(bgSel.d.widthPx, bgSel.d.heightPx, bgSel.dest, rect);
                      setBgPreview(bgLive.current);
                    }}
                    onDragEnd={(e) => {
                      e.target.position({ x: cx - hs / 2, y: cy - hs / 2 }); // snap back to the corner
                      useBookStore.getState().setBgFrame(itemRef, bgLive.current);
                      setBgPreview(null);
                    }}
                  />
                );
              })}
            </>
          )}
          <Transformer
            ref={trRef}
            rotateEnabled
            flipEnabled={false}
            keepRatio
            rotationSnaps={[0, 90, 180, 270]}
            anchorSize={10}
            boundBoxFunc={(o, n) => (n.width < 5 || n.height < 5 ? o : n)}
          />
        </Layer>
      </Stage>
    </div>
  );
}

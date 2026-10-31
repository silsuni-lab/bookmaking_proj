import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Image as KImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import { planItem } from '../../core/drawPlan';
import type { AssetDims } from '../../core/drawPlan';
import { fitScale } from '../../core/editorLayout';
import { BLEED_MM, PAGE_SIZES } from '../../core/model';
import type { ItemRef, PageElement, PageItem } from '../../core/model';
import { useBookStore } from '../../state/bookStore';
import ElementNode from './ElementNode';

const SAFE_MM = 5;
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
  const plan = useMemo(() => planItem(item, size, dims), [item, size, dims]);
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEl) {
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
          if (e.target === e.target.getStage() || e.target.name() === 'bg') onSelectEl(null);
        }}
      >
        <Layer x={offX} y={offY} scaleX={s} scaleY={s}>
          {plan.ops.map((op, i) => {
            if (op.op === 'fill') {
              return <Rect key={i} name="bg" {...op.rect} fill={op.color} />;
            }
            if (op.op === 'image' && op.src) {
              const img = images.get(op.assetId);
              return img ? <KImage key={i} name="bg" image={img} {...op.dest} crop={op.src} /> : null;
            }
            return null;
          })}
          <Group x={B} y={B}>
            {item.elements.map((el) => (
              <ElementNode
                key={el.id}
                el={el}
                image={el.kind === 'image' ? images.get(el.assetId) : undefined}
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

import { Group, Image as KImage, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import { foldScale, MM_PER_PT } from '../../core/editorLayout';
import type { PageElement } from '../../core/model';

interface Props {
  el: PageElement;
  image: HTMLImageElement | undefined;
  register(id: string, node: Konva.Group | null): void;
  onSelect(id: string): void;
  /** Called once per finished drag/resize/rotate gesture, with mm values. */
  onCommit(id: string, patch: Partial<PageElement>): void;
}

/** One interactive element. Konva units are mm; the parent layer scales to pixels. */
export default function ElementNode({ el, image, register, onSelect, onCommit }: Props) {
  const fontMm = el.kind === 'text' ? el.fontSizePt * MM_PER_PT : 0;
  return (
    <Group
      ref={(n) => register(el.id, n)}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      draggable
      onMouseDown={() => onSelect(el.id)}
      onTouchStart={() => onSelect(el.id)}
      onDragEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        onCommit(el.id, { x: e.target.x(), y: e.target.y() });
      }}
      onTransformEnd={(e) => {
        const n = e.target;
        const size = foldScale(el.width, el.height, n.scaleX(), n.scaleY());
        n.scaleX(1);
        n.scaleY(1);
        onCommit(el.id, { x: n.x(), y: n.y(), rotation: n.rotation(), ...size });
      }}
    >
      <Rect width={el.width} height={el.height} fill="rgba(0,0,0,0.001)" />
      {el.kind === 'image' && image && <KImage image={image} width={el.width} height={el.height} />}
      {el.kind === 'text' && el.band && (
        <Rect width={el.width} height={el.height} fill="rgba(255,255,255,0.75)" cornerRadius={2} />
      )}
      {el.kind === 'text' && (
        <Text
          text={el.text}
          width={el.width}
          height={el.height}
          fontFamily="Gaegu"
          fontSize={fontMm}
          lineHeight={1.3}
          fill={el.color}
          align="center"
          wrap="word"
        />
      )}
    </Group>
  );
}

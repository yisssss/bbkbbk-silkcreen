import { useEffect, useRef, useState } from 'react';
import { hexToRgb } from '../core/color';
import { compositeInks } from '../core/composite';
import { buildCoverageLuts, darknessOrder } from '../core/separation';
import { NEUTRAL_ADJUST } from '../core/tone';
import type { InkLayer, SeparationSettings } from '../core/types';
import { clamp } from '../core/units';
import { useDocument } from '../state/documentStore';
import { useUi } from '../state/uiStore';

interface Props {
  layers: InkLayer[];
  separation: SeparationSettings;
  paperColor: string;
}

const RAMP = 256;

/** Renders the separation of a white→black ramp, using the same code as the image. */
function useRampCanvas(layers: InkLayer[], separation: SeparationSettings, paperColor: string) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const luts = buildCoverageLuts(layers, separation, NEUTRAL_ADJUST);
    const coverages = luts.map((lut) => {
      const c = new Uint8Array(RAMP);
      for (let i = 0; i < RAMP; i++) c[i] = lut[255 - i];
      return c;
    });
    const img = new ImageData(RAMP, 1);
    const order = darknessOrder(layers);
    compositeInks(
      img.data,
      coverages,
      layers.map((l) => hexToRgb(l.color)),
      order.filter((i) => layers[i].visible),
      hexToRgb(paperColor),
      separation.overprint,
    );
    canvas.getContext('2d')!.putImageData(img, 0, 0);
  }, [layers, separation, paperColor]);
  return ref;
}

type DragTarget = { kind: 'white' } | { kind: 'edge'; id: string; edge: 'lo' | 'hi' };

export function GradientMapBar({ layers, separation, paperColor }: Props) {
  const canvasRef = useRampCanvas(layers, separation, paperColor);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const updateTone = useDocument((s) => s.updateTone);
  const setSeparation = useDocument((s) => s.setSeparation);
  const resetGradient = useDocument((s) => s.resetGradient);
  const selectedLayerId = useUi((s) => s.selectedLayerId);
  const setUi = useUi((s) => s.set);

  const pctAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.round(clamp(((clientX - r.left) / r.width) * 100, 0, 100) * 10) / 10;
  };

  const apply = (target: DragTarget, pct: number) => {
    if (target.kind === 'white') {
      const minLo = Math.min(...layers.map((l) => l.tone.solidLo));
      setSeparation({ whitePoint: clamp(pct, 0, minLo) });
      return;
    }
    const layer = layers.find((l) => l.id === target.id);
    if (!layer) return;
    if (target.edge === 'lo') {
      updateTone(target.id, { solidLo: clamp(pct, separation.whitePoint, layer.tone.solidHi) });
    } else {
      updateTone(target.id, { solidHi: clamp(pct, layer.tone.solidLo, 100) });
    }
  };

  const startDrag = (target: DragTarget) => (e: React.PointerEvent) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    setDrag(target);
    if (target.kind === 'edge') setUi({ selectedLayerId: target.id });
  };

  const onMove = (e: React.PointerEvent) => {
    if (drag) apply(drag, pctAt(e.clientX));
  };

  const endDrag = () => setDrag(null);
  const dragging = (id: string, edge: 'lo' | 'hi') => drag?.kind === 'edge' && drag.id === id && drag.edge === edge;

  return (
    <div className="gradient-map">
      <div className="gradient-map-head">
        <span>그라디언트맵</span>
        <button className="text-btn" onClick={resetGradient}>
          초기화
        </button>
      </div>
      <div className="gradient-map-track" ref={trackRef}>
        <canvas ref={canvasRef} width={RAMP} height={1} className="gradient-map-canvas" />
        <div className="gradient-map-stops" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
          {layers.map((l) => (
            <div
              key={`${l.id}-span`}
              className="gm-span"
              style={{
                left: `${l.tone.solidLo}%`,
                width: `${Math.max(0, l.tone.solidHi - l.tone.solidLo)}%`,
                background: l.color,
              }}
            />
          ))}
          <button
            className={`gm-stop white ${drag?.kind === 'white' ? 'dragging' : ''}`}
            style={{ left: `${separation.whitePoint}%` }}
            title={`흰색 지점 ${separation.whitePoint.toFixed(1)}% · 이보다 밝은 톤은 인쇄하지 않음`}
            onPointerDown={startDrag({ kind: 'white' })}
          />
          {layers.map((l, i) => (
            <span key={l.id}>
              <button
                className={`gm-stop ${selectedLayerId === l.id ? 'selected' : ''} ${dragging(l.id, 'lo') ? 'dragging' : ''}`}
                style={{ left: `${l.tone.solidLo}%`, ['--ink' as string]: l.color }}
                title={`${l.name} 단색 시작 · ${l.tone.solidLo.toFixed(1)}%`}
                onPointerDown={startDrag({ kind: 'edge', id: l.id, edge: 'lo' })}
              >
                <span>{i + 1}</span>
              </button>
              <button
                className={`gm-stop end ${selectedLayerId === l.id ? 'selected' : ''} ${dragging(l.id, 'hi') ? 'dragging' : ''}`}
                style={{ left: `${l.tone.solidHi}%`, ['--ink' as string]: l.color }}
                title={`${l.name} 단색 끝 · ${l.tone.solidHi.toFixed(1)}%`}
                onPointerDown={startDrag({ kind: 'edge', id: l.id, edge: 'hi' })}
              >
                <span>{i + 1}</span>
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

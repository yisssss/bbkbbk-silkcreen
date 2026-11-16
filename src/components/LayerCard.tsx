import { useEffect, useRef, useState } from 'react';
import { defaultTone } from '../core/defaults';
import type { InkLayer, LayerTone, SeparationSettings } from '../core/types';
import { useDocument } from '../state/documentStore';
import { useUi } from '../state/uiStore';
import { ColorField } from './controls/ColorField';
import { RangeField } from './controls/RangeField';

interface Props {
  layer: InkLayer;
  index: number;
  count: number;
  separation: SeparationSettings;
  band: string;
}

export function LayerCard({ layer, index, count, separation, band }: Props) {
  const updateLayer = useDocument((s) => s.updateLayer);
  const updateTone = useDocument((s) => s.updateTone);
  const resetTone = useDocument((s) => s.resetTone);
  const selected = useUi((s) => s.selectedLayerId === layer.id);
  const setUi = useUi((s) => s.set);
  const def = defaultTone(index, count);
  const tone = (patch: Partial<LayerTone>) => updateTone(layer.id, patch);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const clickTimer = useRef<number | null>(null);
  const cancelRename = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(layer.name);
  }, [layer.name, editing]);

  useEffect(() => {
    if (!editing) return;
    nameRef.current?.focus();
    nameRef.current?.select();
  }, [editing]);

  useEffect(
    () => () => {
      if (clickTimer.current) window.clearTimeout(clickTimer.current);
    },
    [],
  );

  const toggle = () => setUi({ selectedLayerId: selected ? null : layer.id });

  const armToggle = () => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null;
      toggle();
    }, 220);
  };

  const startRename = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setDraft(layer.name);
    setEditing(true);
  };

  const commitRename = () => {
    if (cancelRename.current) {
      cancelRename.current = false;
      setDraft(layer.name);
      setEditing(false);
      return;
    }
    const name = draft.trim();
    if (name && name !== layer.name) updateLayer(layer.id, { name });
    setEditing(false);
  };

  return (
    <section className={`layer-card ${selected ? 'selected' : ''}`}>
      <header
        className="layer-card-head"
        onClick={(e) => {
          if (editing) return;
          if ((e.target as HTMLElement).closest('.layer-rename')) armToggle();
          else toggle();
        }}
      >
        <span className="layer-swatch" style={{ background: layer.color }} />
        <span className="layer-index layer-rename" onDoubleClick={startRename}>
          {String(index + 1).padStart(2, '0')}
        </span>
        {editing ? (
          <input
            ref={nameRef}
            className="layer-name-input"
            value={draft}
            maxLength={40}
            aria-label="레이어 이름"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelRename.current = true;
                e.currentTarget.blur();
              }
            }}
          />
        ) : (
          <span className="layer-name-preview layer-rename" onDoubleClick={startRename}>
            {layer.name}
          </span>
        )}
        <span className="layer-band">{band}</span>
        <span className="chevron">{selected ? '▾' : '▸'}</span>
      </header>

      {selected && (
        <div className="layer-card-body">
          <ColorField label="잉크 색상" value={layer.color} onChange={(color) => updateLayer(layer.id, { color })} />

          <div className="subhead">
            <span>단색 구간</span>
            <button className="text-btn" onClick={() => resetTone(layer.id)}>
              초기화
            </button>
          </div>
          <RangeField
            loLabel="단색 시작"
            hiLabel="단색 끝"
            loHint="이 명도까지는 그라데이션이고, 여기서부터 잉크 100%입니다"
            hiHint="여기까지 잉크 100%이고, 이후는 다음 색으로 그라데이션됩니다"
            lo={layer.tone.solidLo}
            hi={layer.tone.solidHi}
            min={separation.whitePoint}
            max={100}
            step={0.5}
            precision={1}
            unit="%"
            loDefault={def.solidLo}
            hiDefault={def.solidHi}
            onLo={(solidLo) => tone({ solidLo: Math.min(solidLo, layer.tone.solidHi) })}
            onHi={(solidHi) => tone({ solidHi: Math.max(solidHi, layer.tone.solidLo) })}
          />
        </div>
      )}
    </section>
  );
}

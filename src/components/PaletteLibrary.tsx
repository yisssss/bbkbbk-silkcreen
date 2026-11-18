import { useEffect, useRef, useState } from 'react';
import { MAX_PALETTE } from '../core/defaults';
import type { PaletteColor } from '../core/types';
import { useDocument } from '../state/documentStore';
import { useUi } from '../state/uiStore';

const NEXT_COLORS = ['#888888', '#C71585', '#FF8C00', '#00A3A1', '#6B4C9A', '#8B5A2B'];

function PaletteName({ name, onCommit }: { name: string; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(name);
  const cancel = useRef(false);

  useEffect(() => setDraft(name), [name]);

  return (
    <input
      className="palette-name"
      value={draft}
      maxLength={40}
      aria-label="색 이름"
      spellCheck={false}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={() => {
        if (cancel.current) {
          cancel.current = false;
          setDraft(name);
          return;
        }
        const next = draft.trim();
        if (!next || next === name) {
          setDraft(name);
          return;
        }
        onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancel.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function PaletteLibrary() {
  const palette = useDocument((s) => s.doc.palette);
  const layers = useDocument((s) => s.doc.layers);
  const addPaletteColor = useDocument((s) => s.addPaletteColor);
  const updatePaletteColor = useDocument((s) => s.updatePaletteColor);
  const removePaletteColor = useDocument((s) => s.removePaletteColor);
  const updateLayer = useDocument((s) => s.updateLayer);
  const selectedLayerId = useUi((s) => s.selectedLayerId);
  const setUi = useUi((s) => s.set);

  const apply = (swatch: PaletteColor) => {
    const id = layers.some((layer) => layer.id === selectedLayerId) ? selectedLayerId : layers[0]?.id;
    if (!id) return;
    updateLayer(id, { color: swatch.color });
    setUi({ selectedLayerId: id });
  };

  const add = () => {
    const used = new Set(palette.map((swatch) => swatch.color.toUpperCase()));
    const color = NEXT_COLORS.find((hex) => !used.has(hex)) ?? NEXT_COLORS[palette.length % NEXT_COLORS.length];
    addPaletteColor(color, `색상 ${palette.length + 1}`);
  };

  return (
    <section className="panel-section">
      <div className="section-title-row">
        <h2 className="section-title">색상 라이브러리</h2>
        <button type="button" className="text-btn" disabled={palette.length >= MAX_PALETTE} onClick={add}>
          추가
        </button>
      </div>
      <p className="note">이름을 붙여 저장한 색입니다. 적용하면 선택한 잉크에 들어가고, 선택이 없으면 첫 잉크에 들어갑니다.</p>
      {palette.length === 0 && <p className="note">등록된 색이 없습니다.</p>}
      <ul className="palette-list">
        {palette.map((swatch) => (
          <li key={swatch.id} className="palette-row">
            <input
              type="color"
              className="swatch-input"
              aria-label={`${swatch.name} 색상`}
              value={swatch.color.toLowerCase()}
              onChange={(e) => updatePaletteColor(swatch.id, { color: e.currentTarget.value.toUpperCase() })}
            />
            <PaletteName name={swatch.name} onCommit={(name) => updatePaletteColor(swatch.id, { name })} />
            <button type="button" className="btn small" onClick={() => apply(swatch)}>
              적용
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`${swatch.name} 삭제`}
              onClick={() => removePaletteColor(swatch.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

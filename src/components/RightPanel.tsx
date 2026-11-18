import { useState } from 'react';
import type { ColorCount, InkLayer } from '../core/types';
import { useDocument } from '../state/documentStore';
import { usePreview, useUi } from '../state/uiStore';
import { GradientMapBar } from './GradientMapBar';
import { PaletteLibrary } from './PaletteLibrary';
import { HalftonePanel } from './HalftonePanel';
import { LayerCard } from './LayerCard';
import { LayerThumb } from './LayerThumb';

const fmt = (v: number) => `${Math.round(v)}%`;

function describeBands(layers: InkLayer[]): string[] {
  return layers.map((l) => `${fmt(l.tone.solidLo)}–${fmt(l.tone.solidHi)}`);
}

type RightTab = 'color' | 'halftone';

export function RightPanel() {
  const doc = useDocument((s) => s.doc);
  const actions = useDocument.getState();
  const setColorCount = useDocument((s) => s.setColorCount);
  const setSeparation = useDocument((s) => s.setSeparation);
  const viewMode = useUi((s) => s.viewMode);
  const selectedLayerId = useUi((s) => s.selectedLayerId);
  const setUi = useUi((s) => s.set);
  const thumbs = usePreview((s) => s.result?.thumbs);
  const printInk = usePreview((s) => (s.print && s.print.detailRev === s.rev ? s.print.inkArea : null));
  const [tab, setTab] = useState<RightTab>('color');

  const { layers, separation } = doc;
  const bands = describeBands(layers);

  return (
    <aside className="panel panel-right panel-split">
      <section className="panel-section layers-dock">
        <h2 className="section-title">레이어</h2>
        <ul className="layer-list">
          {doc.layers.map((l, i) => {
            const thumb = thumbs?.find((t) => t.id === l.id);
            const solo = viewMode === 'layer' && selectedLayerId === l.id;
            return (
              <li
                key={l.id}
                className={`layer-row ${selectedLayerId === l.id ? 'selected' : ''}`}
                onClick={() => setUi({ selectedLayerId: l.id })}
              >
                <LayerThumb bitmap={thumb?.bitmap} />
                <div className="layer-row-info">
                  <span className="layer-row-name">
                    <span className="layer-swatch small" style={{ background: l.color }} />
                    {String(i + 1).padStart(2, '0')} · {l.name}
                  </span>
                  <span
                    className="layer-row-meta"
                    title={printInk ? '300 DPI 망점 기준 실제 잉크 면적' : '연속톤 근사 기준 잉크가 닿는 면적'}
                  >
                    {l.color} · {printInk ? '망점 면적' : '잉크 면적'}{' '}
                    {Math.round((printInk ? printInk[i] : (thumb?.inkArea ?? 0)) * 100)}%
                  </span>
                </div>
                <div className="layer-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`icon-btn ${l.visible ? '' : 'off'}`}
                    title={l.visible ? '합성 미리보기에서 숨기기' : '합성 미리보기에 표시'}
                    onClick={() => actions.updateLayer(l.id, { visible: !l.visible })}
                  >
                    {l.visible ? '◉' : '○'}
                  </button>
                  <button
                    className={`icon-btn ${solo ? 'active' : ''}`}
                    title="이 레이어만 흑백 농도로 보기"
                    onClick={() =>
                      setUi(solo ? { viewMode: 'composite' } : { viewMode: 'layer', selectedLayerId: l.id })
                    }
                  >
                    S
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="panel-tabs" role="tablist" aria-label="오른쪽 하단 패널">
        <button
          type="button"
          role="tab"
          id="tab-color"
          aria-selected={tab === 'color'}
          aria-controls="panel-color"
          className={tab === 'color' ? 'active' : ''}
          onClick={() => setTab('color')}
        >
          색상 조정
        </button>
        <button
          type="button"
          role="tab"
          id="tab-halftone"
          aria-selected={tab === 'halftone'}
          aria-controls="panel-halftone"
          className={tab === 'halftone' ? 'active' : ''}
          onClick={() => setTab('halftone')}
        >
          망점 조정
        </button>
      </div>

      <div className="panel-scroll">
        {tab === 'color' ? (
          <div id="panel-color" role="tabpanel" aria-labelledby="tab-color">
            <section className="panel-section">
              <h2 className="section-title">인쇄 색상 수</h2>
              <div className="segmented">
                {([1, 2, 3] as ColorCount[]).map((n) => (
                  <button key={n} className={layers.length === n ? 'active' : ''} onClick={() => setColorCount(n)}>
                    {n}색
                  </button>
                ))}
              </div>
            </section>

            <PaletteLibrary />

            <section className="panel-section">
              <h2 className="section-title">분판 방식</h2>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={separation.overprint}
                  onChange={(e) => setSeparation({ overprint: e.currentTarget.checked })}
                />
                <span>오버프린트</span>
              </label>
              <GradientMapBar layers={layers} separation={separation} paperColor={doc.preview.paperColor} />
            </section>

            <section className="panel-section">
              <h2 className="section-title">색상 레이어</h2>
              <div className="layer-cards">
                {layers.map((layer, i) => (
                  <LayerCard
                    key={layer.id}
                    layer={layer}
                    index={i}
                    count={layers.length}
                    separation={separation}
                    band={bands[i]}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div id="panel-halftone" role="tabpanel" aria-labelledby="tab-halftone">
            <HalftonePanel />
          </div>
        )}
      </div>
    </aside>
  );
}

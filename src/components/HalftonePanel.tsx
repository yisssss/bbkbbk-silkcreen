import { useEffect, type CSSProperties } from 'react';
import { activeFrame, DEFAULT_ANGLES, DEFAULT_HALFTONE } from '../core/defaults';
import { usesScreenAngle } from '../core/halftone';
import { MM_PER_INCH } from '../core/units';
import { useDocument } from '../state/documentStore';
import { RangeField } from './controls/RangeField';
import { SliderField } from './controls/SliderField';

export function HalftonePanel() {
  const frame = useDocument((s) => activeFrame(s.doc));
  const halftone = frame.halftone;
  const layers = frame.layers;
  const setHalftone = useDocument((s) => s.setHalftone);
  const resetHalftone = useDocument((s) => s.resetHalftone);
  const setLayerAngle = useDocument((s) => s.setLayerAngle);
  const changed =
    halftone.lpi !== DEFAULT_HALFTONE.lpi ||
    halftone.minDotPct !== DEFAULT_HALFTONE.minDotPct ||
    halftone.maxDotPct !== DEFAULT_HALFTONE.maxDotPct ||
    layers.some((l, i) => l.halftone.angleDeg !== (DEFAULT_ANGLES[i] ?? 22.5));
  const cellMm = MM_PER_INCH / halftone.lpi;

  useEffect(() => {
    if (halftone.pattern !== 'ordered') setHalftone({ pattern: 'ordered' });
  }, [halftone.pattern, setHalftone]);

  return (
    <section className="panel-section">
      <div className="section-title-row">
        <h2 className="section-title">망점 (하프톤)</h2>
        <button className="text-btn" disabled={!changed} onClick={resetHalftone}>
          전체 초기화
        </button>
      </div>

      <SliderField
        label="망점 개수"
        hint="1인치당 망점 줄 수. 낮을수록 망점이 크고 거칠어집니다"
        value={halftone.lpi}
        min={10}
        max={85}
        step={1}
        defaultValue={DEFAULT_HALFTONE.lpi}
        onChange={(lpi) => setHalftone({ lpi })}
      />
      <p className="note">망점 간격 {cellMm.toFixed(2)} mm</p>

      <RangeField
        loLabel="최소 망점"
        hiLabel="최대 망점"
        loHint="이보다 옅은 농도는 인쇄하지 않습니다 (메시에 맺히지 않는 작은 점 제거)"
        hiHint="이보다 진한 농도는 100%로 채웁니다 (막히기 쉬운 작은 구멍 제거)"
        lo={halftone.minDotPct}
        hi={halftone.maxDotPct}
        min={0}
        max={100}
        loCap={50}
        hiFloor={50}
        step={0.5}
        precision={1}
        unit="%"
        loDefault={DEFAULT_HALFTONE.minDotPct}
        hiDefault={DEFAULT_HALFTONE.maxDotPct}
        onLo={(minDotPct) => setHalftone({ minDotPct })}
        onHi={(maxDotPct) => setHalftone({ maxDotPct })}
      />

      <div className="subhead">
        <span>레이어별 망점 각도</span>
      </div>
      {usesScreenAngle(halftone) ? (
        layers.map((layer, index) => (
          <div key={layer.id} className="angle-field" style={{ '--swatch': layer.color } as CSSProperties}>
            <SliderField
              label={layer.name}
              hint="레이어마다 각도를 다르게 하면 겹칠 때 모아레가 줄어듭니다"
              value={layer.halftone.angleDeg}
              min={0}
              max={90}
              step={0.5}
              precision={1}
              unit="°"
              defaultValue={DEFAULT_ANGLES[index] ?? 22.5}
              onChange={(angleDeg) => setLayerAngle(layer.id, angleDeg)}
            />
          </div>
        ))
      ) : (
        <p className="note">FM 패턴(Floyd–Steinberg / Stochastic)은 망점 각도를 사용하지 않습니다.</p>
      )}
    </section>
  );
}

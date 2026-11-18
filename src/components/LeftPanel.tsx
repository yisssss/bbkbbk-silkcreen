import { activeFrame, ARTBOARD_PRESETS, DEFAULT_ADJUST } from '../core/defaults';
import { effectiveDpi, mmToUnit, PRINT_DPI, printPixelSize } from '../core/units';
import { useDocument } from '../state/documentStore';
import { useUi } from '../state/uiStore';
import { ColorField } from './controls/ColorField';
import { LengthField } from './controls/LengthField';
import { SliderField } from './controls/SliderField';

const MIN_GOOD_DPI = 200;

export function LeftPanel() {
  const doc = useDocument((s) => s.doc);
  const actions = useDocument.getState();
  const setAdjust = useDocument((s) => s.setAdjust);
  const resetAdjust = useDocument((s) => s.resetAdjust);
  const unit = useUi((s) => s.unit);
  const setUi = useUi((s) => s.set);
  const requestFit = useUi((s) => s.requestFit);
  const requestCover = useUi((s) => s.requestCover);

  const image = activeFrame(doc);
  const { artboard } = doc;
  const { placement, crop, source, adjust, lockRatio } = image;
  const palette = doc.palette;
  const printPx = printPixelSize(artboard.widthMm, artboard.heightMm);
  const dpi = crop ? Math.min(effectiveDpi(crop.width, placement.widthMm), effectiveDpi(crop.height, placement.heightMm)) : 0;
  const fmtLen = (mm: number) => `${mmToUnit(mm, unit).toFixed(unit === 'cm' ? 1 : 0)}`;
  const adjustChanged =
    adjust.brightness !== DEFAULT_ADJUST.brightness ||
    adjust.contrast !== DEFAULT_ADJUST.contrast ||
    adjust.gamma !== DEFAULT_ADJUST.gamma;

  return (
    <aside className="panel panel-left panel-split">
      <div className="panel-tabs" role="tablist" aria-label="왼쪽 패널">
        <button type="button" role="tab" className="active" aria-selected="true">
          원본 이미지 조정
        </button>
      </div>
      <div className="panel-scroll">
        <section className="panel-section">
          <div className="section-title-row">
            <h2 className="section-title">이미지 조정</h2>
            <button className="text-btn" disabled={!adjustChanged} onClick={resetAdjust}>
              전체 초기화
            </button>
          </div>
          <p className="note">「{image.name}」 탭만 바뀝니다. 판 크기와 인쇄 색은 모든 탭이 함께 씁니다.</p>
          <SliderField
            label="밝기"
            value={adjust.brightness}
            min={-100}
            max={100}
            defaultValue={DEFAULT_ADJUST.brightness}
            onChange={(brightness) => setAdjust({ brightness })}
          />
          <SliderField
            label="대비"
            value={adjust.contrast}
            min={-100}
            max={100}
            defaultValue={DEFAULT_ADJUST.contrast}
            onChange={(contrast) => setAdjust({ contrast })}
          />
          <SliderField
            label="감마"
            value={adjust.gamma}
            min={0.1}
            max={3}
            step={0.01}
            precision={2}
            defaultValue={DEFAULT_ADJUST.gamma}
            onChange={(gamma) => setAdjust({ gamma })}
          />
        </section>

        <section className="panel-section">
          <div className="section-title-row">
            <h2 className="section-title">출력 크기</h2>
            <div className="segmented small">
              {(['mm', 'cm'] as const).map((u) => (
                <button key={u} className={unit === u ? 'active' : ''} onClick={() => setUi({ unit: u })}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <select
            className="select"
            value=""
            onChange={(e) => {
              const preset = ARTBOARD_PRESETS[Number(e.currentTarget.value)];
              if (preset) {
                actions.setArtboard(preset.artboard);
                requestFit();
              }
            }}
          >
            <option value="" disabled>
              프리셋 선택…
            </option>
            {ARTBOARD_PRESETS.map((p, i) => (
              <option key={p.label} value={i}>
                {p.label} mm
              </option>
            ))}
          </select>
          <div className="grid-2">
            <LengthField label="W" valueMm={artboard.widthMm} unit={unit} minMm={10} maxMm={1000} onChange={(widthMm) => actions.setArtboard({ widthMm })} />
            <LengthField label="H" valueMm={artboard.heightMm} unit={unit} minMm={10} maxMm={1000} onChange={(heightMm) => actions.setArtboard({ heightMm })} />
          </div>
          <p className="note">
            인쇄 영역(판) 크기 · {PRINT_DPI} DPI 기준 {printPx.width} × {printPx.height}px
          </p>
        </section>

        <section className="panel-section">
          <h2 className="section-title">이미지 배치</h2>
          <div className="grid-2">
            <LengthField label="X" valueMm={placement.xMm} unit={unit} disabled={!source} onChange={(xMm) => actions.setPlacement({ xMm })} />
            <LengthField label="Y" valueMm={placement.yMm} unit={unit} disabled={!source} onChange={(yMm) => actions.setPlacement({ yMm })} />
            <LengthField label="W" valueMm={placement.widthMm} unit={unit} minMm={1} disabled={!source} onChange={(widthMm) => actions.setPlacement({ widthMm })} />
            <LengthField label="H" valueMm={placement.heightMm} unit={unit} minMm={1} disabled={!source} onChange={(heightMm) => actions.setPlacement({ heightMm })} />
          </div>
          <label className="toggle-row compact">
            <input type="checkbox" checked={lockRatio} onChange={(e) => actions.setLockRatio(e.currentTarget.checked)} />
            <span>비율 유지</span>
          </label>
          <div className="btn-row">
            <button className="btn" disabled={!source} onClick={actions.centerImage}>
              가운데 정렬
            </button>
            <button
              className="btn"
              disabled={!source}
              title="원본 비율을 유지한 채 인쇄 영역이 화면을 가득 채우게 맞춥니다"
              onClick={() => {
                actions.fitImage();
                requestCover();
              }}
            >
              영역에 맞춤
            </button>
          </div>
          <div className="btn-row">
            <button className="btn" disabled={!source} onClick={() => setUi({ tool: 'crop' })}>
              크롭 편집
            </button>
            <button className="btn" disabled={!source} onClick={actions.resetCrop}>
              크롭 초기화
            </button>
          </div>
          {source && crop && (
            <dl className="info-list">
              <dt>인쇄 크기</dt>
              <dd>
                {fmtLen(placement.widthMm)} × {fmtLen(placement.heightMm)} {unit}
              </dd>
              <dt>원본</dt>
              <dd>
                {source.width} × {source.height}px{source.hasAlpha ? ' · 투명 배경' : ''}
              </dd>
              <dt>크롭</dt>
              <dd>
                {Math.round(crop.width)} × {Math.round(crop.height)}px
              </dd>
              <dt>원본 해상도</dt>
              <dd className={dpi < MIN_GOOD_DPI ? 'warn' : ''}>{Math.round(dpi)} DPI</dd>
            </dl>
          )}
          {source && dpi < MIN_GOOD_DPI && (
            <p className="note warn">
              원본 해상도가 인쇄 크기에 비해 낮습니다. 출력은 {PRINT_DPI} DPI로 생성되지만 확대된 경계가 흐릿할 수 있습니다.
            </p>
          )}
        </section>

        <section className="panel-section">
          <h2 className="section-title">목업 배경</h2>
          <div className="segmented">
            {(
              [
                ['paper', '엽서'],
                ['tshirt', '티셔츠'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={doc.preview.mockup === id ? 'active' : ''}
                onClick={() => {
                  actions.setMockup(id);
                  requestFit();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <ColorField
            label={doc.preview.mockup === 'paper' ? '엽서 색' : '티셔츠 색'}
            value={doc.preview.paperColor}
            palette={palette}
            onChange={actions.setPaperColor}
          />
        </section>
      </div>
    </aside>
  );
}

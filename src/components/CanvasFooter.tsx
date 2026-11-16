import { useDocument } from '../state/documentStore';
import { usePreview, useUi, type Tool } from '../state/uiStore';
import type { ViewMode } from '../worker/protocol';

/** Screen px per mm at 100%: physical size on a 96 dpi display. */
const ACTUAL_SIZE_ZOOM = 96 / 25.4;

const VIEWS: { id: ViewMode; label: string }[] = [
  { id: 'composite', label: '합성' },
  { id: 'layer', label: '레이어 단독' },
  { id: 'original', label: '원본' },
];

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: 'move', label: '이동', key: 'V' },
  { id: 'crop', label: '크롭', key: 'C' },
  { id: 'hand', label: '손', key: 'H' },
];

const DRAFT_BADGES: Record<ViewMode, string> = {
  composite: '미리보기 전용 · 연속톤 근사 (망점 미적용)',
  layer: '레이어 농도 맵 · 검정 = 잉크 100%',
  original: '원본 이미지 · 이미지 조정 적용',
};

const PRINT_BADGES: Record<Exclude<ViewMode, 'original'>, string> = {
  composite: '인쇄 데이터 · 300 DPI 망점 (잉크색·바탕은 미리보기용)',
  layer: '인쇄용 이진 마스크 · 300 DPI · 검정 = 잉크',
};

type BadgeKind = 'draft' | 'pending' | 'print';

function badgeFor(viewMode: ViewMode, halftone: boolean, ready: boolean): { kind: BadgeKind; text: string } {
  if (viewMode === 'original' || !halftone) return { kind: 'draft', text: DRAFT_BADGES[viewMode] };
  if (!ready) return { kind: 'pending', text: '망점 계산 중… (연속톤 근사 표시)' };
  return { kind: 'print', text: PRINT_BADGES[viewMode] };
}

interface Props {
  onFit: () => void;
  onZoom: (factor: number) => void;
}

export function CanvasFooter({ onFit, onZoom }: Props) {
  const viewMode = useUi((s) => s.viewMode);
  const tool = useUi((s) => s.tool);
  const zoom = useUi((s) => s.zoom);
  const selectedLayerId = useUi((s) => s.selectedLayerId);
  const set = useUi((s) => s.set);
  const layers = useDocument((s) => s.doc.layers);
  const hasImage = useDocument((s) => !!s.doc.source);
  const halftonePreview = useUi((s) => s.halftonePreview);
  const result = usePreview((s) => s.result);
  const print = usePreview((s) => s.print);
  const ready = usePreview((s) => !!s.print?.overview && s.print.rev === s.rev);

  const soloLayer = layers.find((l) => l.id === selectedLayerId) ?? layers[0];
  const badge = badgeFor(viewMode, halftonePreview && hasImage, ready);
  const showPrintMeta = badge.kind === 'print' && print;

  return (
    <footer className="canvas-footer">
      <div className="segmented small">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={tool === t.id ? 'active' : ''}
            disabled={t.id === 'crop' && !hasImage}
            title={`${t.label} (${t.key})`}
            onClick={() => set({ tool: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="segmented small">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={viewMode === v.id ? 'active' : ''}
            onClick={() =>
              set(v.id === 'layer' ? { viewMode: v.id, selectedLayerId: soloLayer?.id ?? null } : { viewMode: v.id })
            }
          >
            {v.label}
          </button>
        ))}
      </div>

      <label className="toggle-chip" title="300 DPI 망점으로 미리보기 (끄면 연속톤 근사만 표시)">
        <input
          type="checkbox"
          checked={halftonePreview}
          onChange={(e) => set({ halftonePreview: e.currentTarget.checked })}
        />
        망점
      </label>

      <span className={`badge badge-${badge.kind}`}>
        {badge.text}
        {viewMode === 'layer' && soloLayer ? ` · ${soloLayer.name}` : ''}
      </span>

      <div className="spacer" />

      {showPrintMeta ? (
        <span className="meta" title="망점 생성 시간 / 화면 갱신 시간">
          인쇄 {print.width}×{print.height}px · 망점 {print.maskMs.toFixed(0)}ms
        </span>
      ) : (
        result && (
          <span className="meta">
            근사 {result.width}×{result.height}px · {result.ms.toFixed(0)}ms
          </span>
        )
      )}

      <div className="zoom-controls">
        <button className="icon-btn" title="축소 (X)" onClick={() => onZoom(0.8)}>
          −
        </button>
        <span className="zoom-value" title="100% = 화면에서 실제 크기">
          {Math.round((zoom / ACTUAL_SIZE_ZOOM) * 100)}%
        </span>
        <button className="icon-btn" title="확대 (Z)" onClick={() => onZoom(1.25)}>
          +
        </button>
        <button className="btn small" title="화면에 맞춤 (⌘0)" onClick={onFit}>
          맞춤
        </button>
      </div>
    </footer>
  );
}

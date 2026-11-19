import { useState } from 'react';
import { activeFrame } from '../core/defaults';
import { downloadPreviewImage } from '../export/previewImage';
import { useDocument } from '../state/documentStore';
import { useUi, type Tool } from '../state/uiStore';
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
  const layers = useDocument((s) => activeFrame(s.doc).layers);
  const hasImage = useDocument((s) => !!activeFrame(s.doc).source);
  const halftonePreview = useUi((s) => s.halftonePreview);
  const [saving, setSaving] = useState(false);

  const savePreview = () => {
    if (saving) return;
    setSaving(true);
    void downloadPreviewImage()
      .catch((err: unknown) => {
        console.error(err);
        useDocument.setState({ error: err instanceof Error ? err.message : '미리보기 이미지를 저장하지 못했습니다.' });
      })
      .finally(() => setSaving(false));
  };

  const soloLayer = layers.find((l) => l.id === selectedLayerId) ?? layers[0];

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

      <div className="spacer" />

      <button className="btn small" disabled={saving} title="지금 보이는 목업 미리보기를 PNG로 저장" onClick={savePreview}>
        {saving ? '저장 중…' : '미리보기 저장'}
      </button>

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

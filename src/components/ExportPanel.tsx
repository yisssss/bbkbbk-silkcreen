import { useState } from 'react';
import { activeFrame } from '../core/defaults';
import { layerFileName } from '../core/exportManifest';
import { usesScreenAngle } from '../core/halftone';
import { PRINT_DPI, printPixelSize } from '../core/units';
import { downloadLayerJpg, downloadLayerPng, downloadPsd, downloadZip } from '../export/download';
import { useDocument } from '../state/documentStore';
import { usePreview, useUi } from '../state/uiStore';

type Busy = string | null;

export function ExportPanel() {
  const doc = useDocument((s) => s.doc);
  const image = activeFrame(doc);
  const inkArea = usePreview((s) => (s.print?.inkArea.length === doc.layers.length ? s.print.inkArea : null));
  const setUi = useUi((s) => s.set);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const px = printPixelSize(doc.artboard.widthMm, doc.artboard.heightMm);
  const angled = usesScreenAngle(doc.halftone);

  const run = async (what: Busy, task: () => Promise<void>) => {
    setError(null);
    setBusy(what);
    try {
      await task();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : '파일을 만들지 못했습니다.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="panel panel-left">
      <section className="panel-section">
        <div className="section-title-row">
          <h2 className="section-title">인쇄 데이터</h2>
          <button className="text-btn" onClick={() => setUi({ step: 'edit' })}>
            편집으로
          </button>
        </div>
        <p className="note">
          PNG·ZIP은 인쇄용입니다. 픽셀은 검정(잉크) 또는 투명뿐이고 300 DPI가 들어 있습니다. JPG는 흰 바탕의 호환용이라 가장자리가 회색으로 번질 수 있습니다. PSD는 색상마다 레이어 하나로 포토샵에서 열립니다.
        </p>
        <dl className="info-list">
          <dt>출력 크기</dt>
          <dd>
            {doc.artboard.widthMm} × {doc.artboard.heightMm} mm
          </dd>
          <dt>픽셀</dt>
          <dd>
            {px.width} × {px.height}
          </dd>
          <dt>해상도</dt>
          <dd>{PRINT_DPI} DPI</dd>
        </dl>
      </section>

      <section className="panel-section grow">
        <h2 className="section-title">색상별 분판</h2>
        <p className="note">{image.name} 탭을 내보냅니다. 다른 그림은 캔버스 위 탭에서 고른 뒤 저장하세요.</p>
        {!image.source && <p className="note">이미지를 열면 분판을 저장할 수 있습니다.</p>}
        <ul className="export-list">
          {doc.layers.map((l, i) => (
            <li key={l.id}>
              <span className="layer-swatch" style={{ background: l.color }} />
              <div className="export-info">
                <span className="layer-row-name">
                  {String(i + 1).padStart(2, '0')} · {l.name}
                </span>
                <span className="layer-row-meta">
                  {l.color}
                  {angled ? ` · ${l.halftone.angleDeg}°` : ''}
                  {inkArea ? ` · 망점 ${Math.round(inkArea[i] * 100)}%` : ''}
                </span>
                <span className="file-label">{layerFileName(i, l.name, l.color)}</span>
              </div>
              <div className="export-actions">
                <button className="btn small" disabled={!image.source || busy !== null} onClick={() => run(`png-${i}`, () => downloadLayerPng(i))}>
                  {busy === `png-${i}` ? '…' : 'PNG'}
                </button>
                <button className="btn small" disabled={!image.source || busy !== null} onClick={() => run(`jpg-${i}`, () => downloadLayerJpg(i))}>
                  {busy === `jpg-${i}` ? '…' : 'JPG'}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="note">숨긴 레이어도 모두 포함됩니다. 표시/숨기기는 미리보기에만 적용됩니다.</p>
        {error && <p className="note warn">{error}</p>}
        <div className="btn-row">
          <button className="btn primary" disabled={!image.source || busy !== null} onClick={() => run('zip', downloadZip)}>
            {busy === 'zip' ? '압축하는 중…' : '전체 ZIP'}
          </button>
          <button className="btn" disabled={!image.source || busy !== null} onClick={() => run('psd', downloadPsd)}>
            {busy === 'psd' ? '만드는 중…' : 'PSD'}
          </button>
        </div>
      </section>
    </aside>
  );
}

import { useRef } from 'react';
import { unpackProject } from '../export/projectFile';
import { saveProject } from '../export/project';
import { ACCEPTED_TYPES, useDocument } from '../state/documentStore';
import { useUi } from '../state/uiStore';

export function TopBar() {
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const source = useDocument((s) => s.doc.source);
  const loading = useDocument((s) => s.loading);
  const loadImage = useDocument((s) => s.loadImage);
  const openProject = useDocument((s) => s.openProject);
  const clearImage = useDocument((s) => s.clearImage);
  const step = useUi((s) => s.step);
  const setUi = useUi((s) => s.set);
  const requestFit = useUi((s) => s.requestFit);
  const viewMode = useUi((s) => s.viewMode);

  const openExport = () => setUi({ step: 'export', halftonePreview: true, ...(viewMode === 'original' ? { viewMode: 'composite' } : {}) });

  return (
    <header className="topbar">
      <div className="brand">
        빽빽 <span>SILKSCREEN</span>
      </div>

      <div className="topbar-group">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          hidden
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (file) {
              await loadImage(file);
              requestFit();
            }
          }}
        />
        <button className="btn primary" disabled={loading} onClick={() => fileRef.current?.click()}>
          {loading ? '불러오는 중…' : source ? '이미지 교체' : '이미지 열기'}
        </button>
        <button
          className="btn"
          disabled={!source}
          onClick={() => window.confirm('이미지를 제거할까요? 색상 및 분판 설정은 유지됩니다.') && clearImage()}
        >
          이미지 제거
        </button>
        {source && (
          <span className="file-name" title={source.fileName}>
            {source.fileName}
          </span>
        )}
      </div>

      <nav className="steps">
        <button className={step === 'edit' ? 'active' : ''} onClick={() => setUi({ step: 'edit' })}>
          <b>1</b> 편집 · 분판
        </button>
        <button className={step === 'export' ? 'active' : ''} disabled={!source} onClick={() => openExport()}>
          <b>2</b> 인쇄 데이터 · 출력
        </button>
      </nav>

      <div className="topbar-group right">
        <input
          ref={projectRef}
          type="file"
          accept=".bbk,application/zip"
          hidden
          onChange={async (e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            if (!file) return;
            try {
              const unpacked = unpackProject(new Uint8Array(await file.arrayBuffer()));
              const bytes = unpacked.source;
              const blob = bytes
                ? new Blob([bytes.slice().buffer as ArrayBuffer], { type: unpacked.doc.source?.mimeType ?? 'application/octet-stream' })
                : null;
              await openProject(unpacked.doc, blob);
              requestFit();
            } catch (err) {
              console.error(err);
              useDocument.setState({ error: err instanceof Error ? err.message : '프로젝트를 열지 못했습니다.' });
            }
          }}
        />
        <button className="btn" disabled={loading} onClick={() => projectRef.current?.click()}>
          프로젝트 열기
        </button>
        <button
          className="btn"
          disabled={loading}
          onClick={() => {
            void saveProject().catch((err: unknown) => {
              console.error(err);
              useDocument.setState({ error: err instanceof Error ? err.message : '프로젝트를 저장하지 못했습니다.' });
            });
          }}
        >
          프로젝트 저장
        </button>
        <button className="btn primary" disabled={!source} onClick={() => openExport()}>
          내보내기
        </button>
      </div>
    </header>
  );
}

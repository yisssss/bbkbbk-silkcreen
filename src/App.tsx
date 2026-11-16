import { CanvasView } from './components/CanvasView';
import { ExportPanel } from './components/ExportPanel';
import { LeftPanel } from './components/LeftPanel';
import { RightPanel } from './components/RightPanel';
import { TopBar } from './components/TopBar';
import { usePreviewPipeline } from './hooks/usePreviewPipeline';
import { useDocument } from './state/documentStore';
import { useUi } from './state/uiStore';

export default function App() {
  usePreviewPipeline();
  const error = useDocument((s) => s.error);
  const dismissError = useDocument((s) => s.dismissError);
  const step = useUi((s) => s.step);

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        {step === 'export' ? <ExportPanel /> : <LeftPanel />}
        <CanvasView />
        <RightPanel />
      </div>
      {error && (
        <div className="toast" role="alert">
          {error}
          <button className="icon-btn" onClick={dismissError} aria-label="닫기">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

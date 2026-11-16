import { create } from 'zustand';
import type { LengthUnit } from '../core/types';
import type { PrintTile, PrintViewResult, RenderResult, ViewMode } from '../worker/protocol';

export type Tool = 'move' | 'crop' | 'hand';
export type Step = 'edit' | 'export';

interface UiState {
  step: Step;
  tool: Tool;
  viewMode: ViewMode;
  selectedLayerId: string | null;
  unit: LengthUnit;
  /** Show 300 DPI halftone dots instead of the continuous-tone draft once they are ready. */
  halftonePreview: boolean;
  /** Screen CSS pixels per millimetre of artboard. */
  zoom: number;
  panX: number;
  panY: number;
  /** Canvas viewport size in CSS pixels. */
  viewportW: number;
  viewportH: number;
  /** Bumped to ask the canvas to fit the artboard inside the viewport. */
  fitRequest: number;
  /** Bumped to ask the canvas to fill the viewport with the artboard. */
  coverRequest: number;

  set(patch: Partial<Omit<UiState, 'set' | 'requestFit' | 'requestCover'>>): void;
  requestFit(): void;
  requestCover(): void;
}

export const useUi = create<UiState>((set) => ({
  step: 'edit',
  tool: 'move',
  viewMode: 'composite',
  selectedLayerId: null,
  unit: 'mm',
  halftonePreview: true,
  zoom: 1,
  panX: 0,
  panY: 0,
  viewportW: 0,
  viewportH: 0,
  fitRequest: 0,
  coverRequest: 0,
  set: (patch) => set(patch),
  requestFit: () => set((s) => ({ fitRequest: s.fitRequest + 1 })),
  requestCover: () => set((s) => ({ coverRequest: s.coverRequest + 1 })),
}));

export interface PrintPreview {
  rev: number;
  width: number;
  height: number;
  overview: PrintTile | null;
  detail: PrintTile | null;
  /** Revision the detail tile was rendered for; it may lag the overview. */
  detailRev: number;
  inkArea: number[];
  maskMs: number;
  ms: number;
}

interface PreviewState {
  /** Bumped on every change that alters what the canvas should show. */
  rev: number;
  result: RenderResult | null;
  print: PrintPreview | null;
  bumpRev(): number;
  setResult(result: RenderResult): void;
  setPrint(result: PrintViewResult): void;
}

export const usePreview = create<PreviewState>((set, get) => ({
  rev: 0,
  result: null,
  print: null,
  bumpRev() {
    const rev = get().rev + 1;
    set({ rev });
    return rev;
  },
  setResult(result) {
    const prev = get().result;
    set({ result });
    prev?.bitmap.close();
  },
  setPrint(r) {
    const prev = get().print;
    const overview = r.overview ?? (prev?.rev === r.rev ? prev.overview : null);
    const next: PrintPreview = {
      rev: r.overview ? r.rev : (prev?.rev ?? r.rev),
      width: r.width,
      height: r.height,
      overview,
      detail: r.detail,
      detailRev: r.rev,
      inkArea: r.inkArea,
      maskMs: r.maskMs || (prev?.maskMs ?? 0),
      ms: r.ms,
    };
    set({ print: next });
    if (prev?.overview && prev.overview !== overview) prev.overview.bitmap.close();
    if (prev?.detail && prev.detail !== next.detail) prev.detail.bitmap.close();
  },
}));

/** True when the canvas should show 300 DPI dots for the current revision. */
export function printPreviewReady(): boolean {
  const { print, rev } = usePreview.getState();
  return !!print?.overview && print.rev === rev;
}

import type {
  Artboard,
  HalftoneSettings,
  Hex,
  ImageAdjust,
  LayerTone,
  Placement,
  QuarterTurn,
  Rect,
  SeparationSettings,
} from '../core/types';

export type ViewMode = 'composite' | 'layer' | 'original';

/** Longest side of the whole-artboard halftone overview tile, in pixels. */
export const OVERVIEW_LONG_SIDE = 2400;

export const overviewScale = (width: number, height: number) =>
  Math.max(1, Math.ceil(Math.max(width, height) / OVERVIEW_LONG_SIDE));

export interface RenderLayer {
  id: string;
  color: Hex;
  tone: LayerTone;
  visible: boolean;
}

export interface RenderRequest {
  imageId: string | null;
  crop: Rect | null;
  artboard: Artboard;
  placement: Placement;
  rotation: QuarterTurn;
  /** Raster resolution for this render, in pixels per millimetre. */
  pxPerMm: number;
  layers: RenderLayer[];
  adjust: ImageAdjust;
  separation: SeparationSettings;
  view: ViewMode;
  soloLayerId: string | null;
  paperColor: Hex;
  /** Unprinted pixels are transparent so a mockup shows through. Layer view ignores this. */
  transparentPaper: boolean;
  thumbWidth: number;
}

export interface LayerThumb {
  id: string;
  bitmap: ImageBitmap;
  /** Share of the artboard carrying any ink, 0..1. */
  inkArea: number;
}

export interface RenderResult {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  pxPerMm: number;
  thumbs: LayerThumb[];
  ms: number;
}

export interface SourceMeta {
  width: number;
  height: number;
  hasAlpha: boolean;
}

export interface PipelineApi {
  setSource(id: string, blob: Blob): Promise<SourceMeta>;
  removeSource(id: string): void;
  render(req: RenderRequest): Promise<RenderResult>;
}

/** Everything that determines the 300 DPI print masks. Ink colours are deliberately absent. */
export interface PrintJob {
  imageId: string | null;
  crop: Rect | null;
  artboard: Artboard;
  placement: Placement;
  rotation: QuarterTurn;
  layers: { id: string; tone: LayerTone; angleDeg: number }[];
  adjust: ImageAdjust;
  separation: SeparationSettings;
  halftone: HalftoneSettings;
}

/** A rectangle of the print raster (300 DPI pixels), shown at 1/k scale. */
export interface PrintRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  k: number;
}

export interface PrintViewRequest {
  job: PrintJob;
  /** Document revision this request was built from; echoed back so stale results can be dropped. */
  rev: number;
  view: 'composite' | 'layer';
  soloLayerId: string | null;
  paperColor: Hex;
  transparentPaper: boolean;
  colors: Hex[];
  visible: boolean[];
  overview: boolean;
  detail: PrintRegion | null;
}

export interface PrintTile {
  bitmap: ImageBitmap;
  region: PrintRegion;
}

export interface PrintViewResult {
  rev: number;
  width: number;
  height: number;
  overview: PrintTile | null;
  detail: PrintTile | null;
  /** Share of the artboard each final mask inks, 0..1. */
  inkArea: number[];
  /** Time spent producing masks; 0 when they came from cache. */
  maskMs: number;
  ms: number;
}

export interface PngPlate {
  index: number;
  /** PNG bytes: black = ink, transparent = no ink, alpha only 0 or 255, 300 DPI pHYs. */
  bytes: Uint8Array;
}

export interface PngExport {
  width: number;
  height: number;
  plates: PngPlate[];
}

export interface PrintApi {
  setSource(id: string, blob: Blob): Promise<SourceMeta>;
  removeSource(id: string): void;
  render(req: PrintViewRequest): Promise<PrintViewResult>;
  /** Encodes the cached 300 DPI masks. Same data the halftone preview shows. */
  exportPngs(job: PrintJob, layerIndexes: number[]): Promise<PngExport>;
}

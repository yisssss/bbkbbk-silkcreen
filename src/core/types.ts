export type Hex = string;
export type RGB = [number, number, number];

export type LengthUnit = 'mm' | 'cm';
export type ColorCount = 1 | 2 | 3;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Which tones a layer carries, as darkness in % (0 = paper white, 100 = full black).
 * Between solidLo and solidHi the ink is 100%. Outside that, it fades to the
 * neighbouring ink (or to paper).
 */
export interface LayerTone {
  solidLo: number;
  solidHi: number;
}

/** Global adjustment applied to the source before separation. brightness / contrast: -100..100, gamma: 0.1..3. */
export interface ImageAdjust {
  brightness: number;
  contrast: number;
  gamma: number;
}

export interface LayerHalftone {
  angleDeg: number;
}

export type HalftonePattern = 'ordered' | 'floyd-steinberg' | 'stochastic';
export type DotShape = 'round';

/** Shared by every layer; only the screen angle is per layer. */
export interface HalftoneSettings {
  pattern: HalftonePattern;
  shape: DotShape;
  /** Screen ruling for the ordered (AM) pattern. */
  lpi: number;
  /** Coverage below this prints nothing (dots too small for the mesh), in %. */
  minDotPct: number;
  /** Coverage above this prints solid (holes too small to stay open), in %. */
  maxDotPct: number;
  /** Grain edge length for FM patterns, in 300 DPI pixels. */
  fmGrainPx: number;
}

/** 'underbase' is reserved for dark-shirt printing; not produced yet. */
export type LayerKind = 'ink' | 'underbase';

export interface InkLayer {
  id: string;
  kind: LayerKind;
  name: string;
  color: Hex;
  tone: LayerTone;
  halftone: LayerHalftone;
  visible: boolean;
}

export interface SourceInfo {
  imageId: string;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

/** Physical print area. All print-space geometry is in millimetres. */
export interface Artboard {
  widthMm: number;
  heightMm: number;
}

/** Where the cropped image sits inside the artboard, in millimetres. */
export interface Placement {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

export interface SeparationSettings {
  /** Lighter inks keep printing under every darker tone instead of being knocked out. */
  overprint: boolean;
  /** Tones lighter than this stay paper. */
  whitePoint: number;
}

export type MockupKind = 'tshirt' | 'paper';

export interface PreviewSettings {
  paperColor: Hex;
  /** Backdrop photo. Preview only; never enters the print masks. */
  mockup: MockupKind;
}

export interface ProjectDoc {
  version: 1;
  source: SourceInfo | null;
  /** Crop rectangle in source pixels. */
  crop: Rect | null;
  artboard: Artboard;
  placement: Placement;
  lockRatio: boolean;
  adjust: ImageAdjust;
  separation: SeparationSettings;
  halftone: HalftoneSettings;
  layers: InkLayer[];
  preview: PreviewSettings;
}

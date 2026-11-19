export type Hex = string;
/** Clockwise quarter turns of one picture. The stored file itself stays untouched. */
export type QuarterTurn = 0 | 90 | 180 | 270;
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

/** Adjustment applied to one image before separation. brightness / contrast: -100..100, gamma: 0.1..3. */
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

/** Shared by every layer of one picture; only the screen angle is per layer. */
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
  /** Backdrop photo. Preview only; never enters the print masks. Shared by every tab. */
  mockup: MockupKind;
}

/** One uploaded picture, plus the print setup that belongs only to it. */
export interface ImageFrame {
  id: string;
  /** Tab label. Usually the file name without its extension. */
  name: string;
  source: SourceInfo | null;
  /** Crop rectangle in source pixels. */
  crop: Rect | null;
  placement: Placement;
  lockRatio: boolean;
  /** Clockwise. Crop and placement are stored in this orientation. */
  rotation: QuarterTurn;
  adjust: ImageAdjust;
  artboard: Artboard;
  separation: SeparationSettings;
  halftone: HalftoneSettings;
  layers: InkLayer[];
  /** Mockup tint. Preview only; never enters the print masks. */
  paperColor: Hex;
}

/** A swatch the user saved and can apply to an ink or the mockup. */
export interface PaletteColor {
  id: string;
  name: string;
  color: Hex;
}

export interface ProjectDoc {
  version: 1;
  /** Pictures, in tab order. There is always at least one. */
  images: ImageFrame[];
  activeImageId: string;
  preview: PreviewSettings;
  /** Saved colours. Empty is allowed; missing means "use the defaults" on load. */
  palette: PaletteColor[];
}

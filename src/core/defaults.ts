import type {
  Artboard,
  ColorCount,
  HalftoneSettings,
  ImageAdjust,
  ImageFrame,
  InkLayer,
  LayerTone,
  PaletteColor,
  Placement,
  ProjectDoc,
} from './types';

/** Default ink palettes, ordered from lightest tone band to darkest. */
export const DEFAULT_PALETTES: Record<ColorCount, string[]> = {
  1: ['#1C1C1C'],
  2: ['#E8432E', '#1C1C1C'],
  3: ['#F2C230', '#E8432E', '#1C1C1C'],
};

/** Spot-colour screen angles spaced 30° apart to limit moiré. */
export const DEFAULT_ANGLES = [22.5, 52.5, 82.5];

export const DEFAULT_ARTBOARD: Artboard = { widthMm: 300, heightMm: 400 };

export const ARTBOARD_PRESETS: { label: string; artboard: Artboard }[] = [
  { label: 'A4 (210 × 297)', artboard: { widthMm: 210, heightMm: 297 } },
  { label: 'A3 (297 × 420)', artboard: { widthMm: 297, heightMm: 420 } },
  { label: '가슴 로고 (100 × 100)', artboard: { widthMm: 100, heightMm: 100 } },
  { label: '앞판 표준 (300 × 400)', artboard: { widthMm: 300, heightMm: 400 } },
];

export const defaultLayerName = (index: number) => `잉크 ${index + 1}`;

/**
 * Each ink owns an equal slice of the darkness axis.
 * The first 40% of the slice fades in; the rest is solid ink.
 */
export function defaultTone(index: number, count: number): LayerTone {
  const round = (v: number) => Math.round(v * 10) / 10;
  const slice = 100 / count;
  const start = index * slice;
  return {
    solidLo: round(start + slice * 0.4),
    solidHi: round(start + slice),
  };
}

export const DEFAULT_ADJUST: ImageAdjust = { brightness: 0, contrast: 0, gamma: 1 };

/** How many pictures can sit in the tab strip. */
export const MAX_IMAGES = 12;
/** How many swatches the colour library keeps. */
export const MAX_PALETTE = 24;

/** Starter inks. The user can rename, recolour, or delete every one. */
export const DEFAULT_PALETTE: { name: string; color: string }[] = [
  { name: '검정', color: '#1C1C1C' },
  { name: '하양', color: '#FFFFFF' },
  { name: '빨강', color: '#E8432E' },
  { name: '노랑', color: '#F2C230' },
  { name: '파랑', color: '#2F5BFF' },
  { name: '초록', color: '#1F8A4C' },
];

export const DEFAULT_WHITE_POINT = 0;

export const DEFAULT_HALFTONE: HalftoneSettings = {
  pattern: 'ordered',
  shape: 'round',
  lpi: 45,
  minDotPct: 5,
  maxDotPct: 95,
  fmGrainPx: 2,
};

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export function createDefaultPalette(): PaletteColor[] {
  return DEFAULT_PALETTE.map((swatch) => ({ id: newId(), name: swatch.name, color: swatch.color }));
}

function cloneLayers(layers: InkLayer[]): InkLayer[] {
  return layers.map((layer) => ({
    ...layer,
    id: newId(),
    tone: { ...layer.tone },
    halftone: { ...layer.halftone },
  }));
}

/**
 * An empty tab. Pass another picture to start from a copy of its print setup
 * (size, inks, halftone, background). The copy can then be edited on its own.
 */
export function createFrame(index: number, from?: ImageFrame): ImageFrame {
  const artboard = from ? { ...from.artboard } : { ...DEFAULT_ARTBOARD };
  return {
    id: newId(),
    name: `이미지 ${index + 1}`,
    source: null,
    crop: null,
    placement: fitPlacement(artboard, 3, 4),
    lockRatio: true,
    adjust: { ...DEFAULT_ADJUST },
    artboard,
    separation: from ? { ...from.separation } : { overprint: true, whitePoint: DEFAULT_WHITE_POINT },
    halftone: from ? { ...from.halftone } : { ...DEFAULT_HALFTONE },
    layers: from ? cloneLayers(from.layers) : [createLayer(0, 1)],
    paperColor: from?.paperColor ?? '#FFFFFF',
  };
}

export function activeFrame(doc: ProjectDoc): ImageFrame {
  return doc.images.find((img) => img.id === doc.activeImageId) ?? doc.images[0];
}

export function createLayer(index: number, count: ColorCount): InkLayer {
  return {
    id: newId(),
    kind: 'ink',
    name: defaultLayerName(index),
    color: DEFAULT_PALETTES[count][index],
    tone: defaultTone(index, count),
    halftone: { angleDeg: DEFAULT_ANGLES[index] ?? 22.5 },
    visible: true,
  };
}

/**
 * Rebuilds the layer list for a new colour count. Tone bands are redistributed;
 * names and colours the user changed are kept, untouched defaults follow the new palette.
 */
export function relayoutLayers(prev: InkLayer[], count: ColorCount): InkLayer[] {
  const prevCount = prev.length as ColorCount;
  return Array.from({ length: count }, (_, i) => {
    const fresh = createLayer(i, count);
    const old = prev[i];
    if (!old) return fresh;
    const colorIsDefault = old.color === DEFAULT_PALETTES[prevCount]?.[i];
    const nameIsDefault = old.name === defaultLayerName(i);
    return {
      ...old,
      name: nameIsDefault ? fresh.name : old.name,
      color: colorIsDefault ? fresh.color : old.color,
      tone: fresh.tone,
    };
  });
}

/**
 * Scales an image so it covers the whole artboard, centred.
 * Aspect is kept, so one axis overflows and the print crops it.
 */
export function coverPlacement(artboard: Artboard, imgW: number, imgH: number): Placement {
  const scale = Math.max(artboard.widthMm / imgW, artboard.heightMm / imgH);
  const widthMm = imgW * scale;
  const heightMm = imgH * scale;
  return {
    xMm: (artboard.widthMm - widthMm) / 2,
    yMm: (artboard.heightMm - heightMm) / 2,
    widthMm,
    heightMm,
  };
}

/** Fits an image of the given pixel aspect inside the artboard (90%), centred. */
export function fitPlacement(artboard: Artboard, imgW: number, imgH: number, fill = 0.9): Placement {
  const scale = Math.min((artboard.widthMm * fill) / imgW, (artboard.heightMm * fill) / imgH);
  const widthMm = imgW * scale;
  const heightMm = imgH * scale;
  return {
    xMm: (artboard.widthMm - widthMm) / 2,
    yMm: (artboard.heightMm - heightMm) / 2,
    widthMm,
    heightMm,
  };
}

export function createEmptyDoc(): ProjectDoc {
  const first = createFrame(0);
  return {
    version: 1,
    images: [first],
    activeImageId: first.id,
    preview: { mockup: 'paper' },
    palette: createDefaultPalette(),
  };
}

import { normalizeHex } from './color';
import {
  createDefaultPalette,
  createFrame,
  createLayer,
  DEFAULT_ADJUST,
  DEFAULT_ANGLES,
  DEFAULT_ARTBOARD,
  DEFAULT_HALFTONE,
  DEFAULT_WHITE_POINT,
  fitPlacement,
  MAX_IMAGES,
  MAX_PALETTE,
} from './defaults';
import { migrateLayerTone } from './separation';
import type {
  Artboard,
  ColorCount,
  HalftoneSettings,
  ImageAdjust,
  ImageFrame,
  InkLayer,
  PaletteColor,
  Placement,
  ProjectDoc,
  QuarterTurn,
  Rect,
  SeparationSettings,
  SourceInfo,
} from './types';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Print setup stored once for the whole file, before each tab kept its own. */
interface SharedPrint {
  artboard?: Artboard;
  separation?: SeparationSettings & { mode?: string };
  halftone?: HalftoneSettings;
  layers?: InkLayer[];
  preview?: { paperColor?: string; mockup?: string };
}

/** Fields written by projects saved before pictures became tabs. */
interface LegacyDoc extends SharedPrint {
  version?: number;
  images?: unknown;
  activeImageId?: string;
  palette?: unknown;
  source?: SourceInfo | null;
  crop?: Rect | null;
  placement?: Placement;
  lockRatio?: boolean;
  rotation?: unknown;
  adjust?: ImageAdjust;
}

interface PrintSetup {
  artboard: Artboard;
  separation: SeparationSettings;
  halftone: HalftoneSettings;
  layers: InkLayer[];
  paperColor: string;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function sanitizeSource(raw: unknown): SourceInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as SourceInfo;
  if (typeof s.imageId !== 'string' || !s.imageId) return null;
  if (typeof s.fileName !== 'string' || !s.fileName) return null;
  if (s.mimeType !== 'image/png' && s.mimeType !== 'image/jpeg') return null;
  return {
    imageId: s.imageId,
    fileName: s.fileName,
    mimeType: s.mimeType,
    width: finite(s.width) ? s.width : 0,
    height: finite(s.height) ? s.height : 0,
    hasAlpha: !!s.hasAlpha,
  };
}

function sanitizeCrop(raw: unknown): Rect | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Rect;
  if (![c.x, c.y, c.width, c.height].every(finite) || c.width <= 0 || c.height <= 0) return null;
  return { x: c.x, y: c.y, width: c.width, height: c.height };
}

function sanitizePlacement(raw: unknown, artboard: Artboard): Placement {
  if (raw && typeof raw === 'object') {
    const p = raw as Placement;
    if ([p.xMm, p.yMm, p.widthMm, p.heightMm].every(finite)) {
      return { xMm: p.xMm, yMm: p.yMm, widthMm: Math.max(1, p.widthMm), heightMm: Math.max(1, p.heightMm) };
    }
  }
  return fitPlacement(artboard, 3, 4);
}

function sanitizeAdjust(raw: unknown): ImageAdjust {
  const a = (raw ?? {}) as Partial<ImageAdjust>;
  return {
    brightness: finite(a.brightness) ? a.brightness : DEFAULT_ADJUST.brightness,
    contrast: finite(a.contrast) ? a.contrast : DEFAULT_ADJUST.contrast,
    gamma: finite(a.gamma) ? a.gamma : DEFAULT_ADJUST.gamma,
  };
}

function sanitizeArtboard(raw: unknown, fallback: Artboard): Artboard {
  if (raw && typeof raw === 'object') {
    const a = raw as Artboard;
    if (finite(a.widthMm) && finite(a.heightMm) && a.widthMm > 0 && a.heightMm > 0) {
      return { widthMm: a.widthMm, heightMm: a.heightMm };
    }
  }
  return { ...fallback };
}

function sanitizeSeparation(raw: unknown): SeparationSettings {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<SeparationSettings>;
  return {
    overprint: !!s.overprint,
    whitePoint: finite(s.whitePoint) ? s.whitePoint : DEFAULT_WHITE_POINT,
  };
}

function sanitizeHalftone(raw: unknown): HalftoneSettings {
  const h = (raw && typeof raw === 'object' ? raw : {}) as Partial<HalftoneSettings>;
  const pattern =
    h.pattern === 'ordered' || h.pattern === 'floyd-steinberg' || h.pattern === 'stochastic'
      ? h.pattern
      : DEFAULT_HALFTONE.pattern;
  return {
    pattern,
    shape: 'round',
    lpi: finite(h.lpi) ? h.lpi : DEFAULT_HALFTONE.lpi,
    minDotPct: finite(h.minDotPct) ? h.minDotPct : DEFAULT_HALFTONE.minDotPct,
    maxDotPct: finite(h.maxDotPct) ? h.maxDotPct : DEFAULT_HALFTONE.maxDotPct,
    fmGrainPx: finite(h.fmGrainPx) ? h.fmGrainPx : DEFAULT_HALFTONE.fmGrainPx,
  };
}

function copyLayers(layers: InkLayer[]): InkLayer[] {
  return layers.map((layer) => ({
    ...layer,
    tone: { ...layer.tone },
    halftone: { ...layer.halftone },
  }));
}

function sanitizeLayers(raw: unknown, mode?: string): InkLayer[] {
  if (!Array.isArray(raw) || raw.length === 0) return [createLayer(0, 1)];
  const items = raw.slice(0, 3);
  const count = items.length as ColorCount;
  const layers: InkLayer[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const layer = item as InkLayer;
    const index = layers.length;
    const fallback = createLayer(index, count);
    layers.push({
      id: typeof layer.id === 'string' && layer.id ? layer.id : fallback.id,
      kind: layer.kind === 'underbase' ? 'underbase' : 'ink',
      name: typeof layer.name === 'string' && layer.name.trim() ? layer.name : fallback.name,
      color: normalizeHex(String(layer.color ?? '')) ?? fallback.color,
      tone: migrateLayerTone(layer.tone, mode),
      halftone: {
        angleDeg: finite(layer.halftone?.angleDeg) ? layer.halftone.angleDeg : (DEFAULT_ANGLES[index] ?? 22.5),
      },
      visible: layer.visible !== false,
    });
  }
  return layers.length ? layers : [createLayer(0, 1)];
}

function sanitizePaper(raw: unknown, fallback: string): string {
  return normalizeHex(typeof raw === 'string' ? raw : '') ?? fallback;
}

function sanitizeRotation(raw: unknown): QuarterTurn {
  return raw === 90 || raw === 180 || raw === 270 ? raw : 0;
}

function sharedPrint(input: SharedPrint): PrintSetup {
  const separation = input.separation;
  return {
    artboard: sanitizeArtboard(input.artboard, DEFAULT_ARTBOARD),
    separation: sanitizeSeparation(separation),
    halftone: sanitizeHalftone(input.halftone),
    layers: sanitizeLayers(input.layers, separation?.mode),
    paperColor: sanitizePaper(input.preview?.paperColor, '#FFFFFF'),
  };
}

function printOf(item: Partial<ImageFrame> & { separation?: SeparationSettings & { mode?: string } }, shared: PrintSetup): PrintSetup {
  const own = !!item.artboard && Array.isArray(item.layers);
  if (!own) {
    return {
      artboard: { ...shared.artboard },
      separation: { ...shared.separation },
      halftone: { ...shared.halftone },
      layers: copyLayers(shared.layers),
      paperColor: shared.paperColor,
    };
  }
  return {
    artboard: sanitizeArtboard(item.artboard, shared.artboard),
    separation: sanitizeSeparation(item.separation),
    halftone: sanitizeHalftone(item.halftone),
    layers: sanitizeLayers(item.layers, item.separation?.mode),
    paperColor: sanitizePaper(item.paperColor, shared.paperColor),
  };
}

function sanitizeFrame(raw: unknown, index: number, shared: PrintSetup, usedIds: Set<string>): ImageFrame {
  const item = (raw ?? {}) as Partial<ImageFrame> & { separation?: SeparationSettings & { mode?: string } };
  let id = typeof item.id === 'string' && item.id && !usedIds.has(item.id) ? item.id : newId();
  usedIds.add(id);
  const print = printOf(item, shared);
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : `이미지 ${index + 1}`;
  return {
    id,
    name,
    source: sanitizeSource(item.source),
    crop: sanitizeCrop(item.crop),
    placement: sanitizePlacement(item.placement, print.artboard),
    lockRatio: item.lockRatio !== false,
    rotation: sanitizeRotation(item.rotation),
    adjust: sanitizeAdjust(item.adjust),
    ...print,
  };
}

function legacyFrame(legacy: LegacyDoc, shared: PrintSetup): ImageFrame {
  const frame = createFrame(0);
  const print = printOf({}, shared);
  return {
    ...frame,
    ...print,
    name: legacy.source?.fileName.replace(/\.[^.]+$/, '') || frame.name,
    source: sanitizeSource(legacy.source),
    crop: sanitizeCrop(legacy.crop),
    placement: sanitizePlacement(legacy.placement, print.artboard),
    lockRatio: legacy.lockRatio !== false,
    rotation: sanitizeRotation(legacy.rotation),
    adjust: sanitizeAdjust(legacy.adjust),
  };
}

function sanitizePalette(raw: unknown): PaletteColor[] {
  if (!Array.isArray(raw)) return createDefaultPalette();
  const colors: PaletteColor[] = [];
  const used = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as PaletteColor;
    const color = normalizeHex(String(entry.color ?? ''));
    if (!color) continue;
    let id = typeof entry.id === 'string' && entry.id && !used.has(entry.id) ? entry.id : newId();
    used.add(id);
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 40) : color;
    colors.push({ id, name, color });
    if (colors.length >= MAX_PALETTE) break;
  }
  return colors;
}

/** Turns a saved document, including ones from before image tabs, into the current shape. */
export function normalizeDoc(input: ProjectDoc): ProjectDoc {
  const legacy = input as ProjectDoc & LegacyDoc;
  const shared = sharedPrint(legacy);
  const usedIds = new Set<string>();
  const images = Array.isArray(legacy.images) && legacy.images.length
    ? legacy.images.slice(0, MAX_IMAGES).map((img, i) => sanitizeFrame(img, i, shared, usedIds))
    : [legacyFrame(legacy, shared)];
  const activeImageId = images.some((img) => img.id === legacy.activeImageId) ? legacy.activeImageId! : images[0].id;
  const mockup = legacy.preview?.mockup === 'tshirt' ? 'tshirt' : 'paper';
  return {
    version: 1,
    images,
    activeImageId,
    preview: { mockup },
    palette: sanitizePalette(legacy.palette),
  };
}

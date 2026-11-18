import { normalizeHex } from './color';
import {
  createDefaultPalette,
  createFrame,
  DEFAULT_ADJUST,
  DEFAULT_ARTBOARD,
  DEFAULT_HALFTONE,
  DEFAULT_WHITE_POINT,
  fitPlacement,
  MAX_IMAGES,
  MAX_PALETTE,
} from './defaults';
import type { ImageAdjust, ImageFrame, PaletteColor, Placement, ProjectDoc, Rect, SourceInfo } from './types';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Fields written by projects saved before pictures became tabs. */
interface LegacyDoc extends ProjectDoc {
  source?: SourceInfo | null;
  crop?: Rect | null;
  placement?: Placement;
  lockRatio?: boolean;
  adjust?: ImageAdjust;
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

function sanitizePlacement(raw: unknown, artboard: ProjectDoc['artboard']): Placement {
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

function sanitizeFrame(raw: unknown, index: number, artboard: ProjectDoc['artboard'], usedIds: Set<string>): ImageFrame {
  const item = (raw ?? {}) as Partial<ImageFrame>;
  let id = typeof item.id === 'string' && item.id && !usedIds.has(item.id) ? item.id : newId();
  usedIds.add(id);
  const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : `이미지 ${index + 1}`;
  return {
    id,
    name,
    source: sanitizeSource(item.source),
    crop: sanitizeCrop(item.crop),
    placement: sanitizePlacement(item.placement, artboard),
    lockRatio: item.lockRatio !== false,
    adjust: sanitizeAdjust(item.adjust),
  };
}

function legacyFrame(legacy: LegacyDoc, artboard: ProjectDoc['artboard']): ImageFrame {
  const frame = createFrame(0, artboard);
  return {
    ...frame,
    name: legacy.source?.fileName.replace(/\.[^.]+$/, '') || frame.name,
    source: sanitizeSource(legacy.source),
    crop: sanitizeCrop(legacy.crop),
    placement: sanitizePlacement(legacy.placement, artboard),
    lockRatio: legacy.lockRatio !== false,
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
  const legacy = input as LegacyDoc;
  const artboard = {
    widthMm: finite(input.artboard?.widthMm) ? input.artboard.widthMm : DEFAULT_ARTBOARD.widthMm,
    heightMm: finite(input.artboard?.heightMm) ? input.artboard.heightMm : DEFAULT_ARTBOARD.heightMm,
  };
  const usedIds = new Set<string>();
  const images = Array.isArray(input.images) && input.images.length
    ? input.images.slice(0, MAX_IMAGES).map((img, i) => sanitizeFrame(img, i, artboard, usedIds))
    : [legacyFrame(legacy, artboard)];
  const activeImageId = images.some((img) => img.id === input.activeImageId) ? input.activeImageId : images[0].id;
  const mockupRaw = input.preview?.mockup as string | undefined;
  const mockup = mockupRaw === 'tshirt' ? 'tshirt' : 'paper';
  return {
    version: 1,
    images,
    activeImageId,
    artboard,
    separation: {
      overprint: !!input.separation?.overprint,
      whitePoint: finite(input.separation?.whitePoint) ? input.separation.whitePoint : DEFAULT_WHITE_POINT,
    },
    halftone: input.halftone ?? { ...DEFAULT_HALFTONE },
    layers: input.layers ?? [],
    preview: {
      paperColor: normalizeHex(input.preview?.paperColor ?? '') ?? '#FFFFFF',
      mockup,
    },
    palette: sanitizePalette(legacy.palette),
  };
}

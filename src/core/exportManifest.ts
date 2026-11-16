import type { ProjectDoc } from './types';
import { PRINT_DPI, printPixelSize } from './units';

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

/** File-safe slug; Korean and spaces survive, path characters do not. */
export function fileSlug(name: string, fallback: string): string {
  const slug = name.trim().replace(ILLEGAL, '').replace(/\s+/g, '_');
  return slug || fallback;
}

/** `01_잉크1_F2C230.png` — name and ink colour travel with the file itself. */
export function layerFileName(index: number, name: string, color: string): string {
  const nn = String(index + 1).padStart(2, '0');
  return `${nn}_${fileSlug(name, `잉크${nn}`)}_${color.replace('#', '')}.png`;
}

export function zipFileName(sourceName: string | undefined): string {
  if (!sourceName) return '분판.zip';
  return `${fileSlug(sourceName.replace(/\.[^.]+$/, ''), '분판')}_분판.zip`;
}

/** Photoshop layer name. The ink colour stays in the name because the pixels are black. */
export function psdLayerName(index: number, name: string, color: string): string {
  return `Layer ${String(index + 1).padStart(2, '0')} - ${name} ${color}`;
}

export function psdFileName(sourceName: string | undefined): string {
  if (!sourceName) return '분판.psd';
  return `${fileSlug(sourceName.replace(/\.[^.]+$/, ''), '분판')}_분판.psd`;
}

export interface ExportManifest {
  app: 'bbaekbbaek';
  dpi: number;
  pixels: { width: number; height: number };
  artboardMm: { widthMm: number; heightMm: number };
  separation: ProjectDoc['separation'];
  halftone: ProjectDoc['halftone'];
  layers: {
    file: string;
    name: string;
    color: string;
    angleDeg: number;
    inkArea: number | null;
  }[];
}

/** Sidecar describing every plate. Ink colour lives here, never in the pixel values. */
export function buildManifest(doc: ProjectDoc, inkArea: number[] | null): ExportManifest {
  return {
    app: 'bbaekbbaek',
    dpi: PRINT_DPI,
    pixels: printPixelSize(doc.artboard.widthMm, doc.artboard.heightMm),
    artboardMm: { ...doc.artboard },
    separation: doc.separation,
    halftone: doc.halftone,
    layers: doc.layers.map((l, i) => ({
      file: layerFileName(i, l.name, l.color),
      name: l.name,
      color: l.color,
      angleDeg: l.halftone.angleDeg,
      inkArea: inkArea ? inkArea[i] : null,
    })),
  };
}

import { activeFrame } from '../core/defaults';
import type { ProjectDoc } from '../core/types';
import type { PrintJob } from '../worker/protocol';

/** The print-mask inputs for the picture currently open. Ink colours are intentionally left out. */
export function printJobFromDoc(doc: ProjectDoc): PrintJob {
  const image = activeFrame(doc);
  return {
    imageId: image.source?.imageId ?? null,
    crop: image.crop,
    artboard: doc.artboard,
    placement: image.placement,
    layers: doc.layers.map((l) => ({ id: l.id, tone: l.tone, angleDeg: l.halftone.angleDeg })),
    adjust: image.adjust,
    separation: doc.separation,
    halftone: { ...doc.halftone, pattern: 'ordered' },
  };
}

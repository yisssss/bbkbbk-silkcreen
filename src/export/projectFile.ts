import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { fileSlug } from '../core/exportManifest';
import { normalizeDoc } from '../core/normalizeDoc';
import { migrateSeparation } from '../core/separation';
import type { ProjectDoc } from '../core/types';

const PROJECT_JSON = 'project.json';

export function sourceEntryName(mimeType: string): string {
  return mimeType === 'image/png' ? 'source.png' : 'source.jpg';
}

/** One original per picture. The id is kept so a re-opened project finds the same bitmap. */
export function imageEntryName(imageId: string, mimeType: string): string {
  const safe = imageId.replace(/[^a-zA-Z0-9_-]/g, '') || 'image';
  return `images/${safe}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

export function projectFileName(sourceName: string | undefined): string {
  if (!sourceName) return '프로젝트.bbk';
  return `${fileSlug(sourceName.replace(/\.[^.]+$/, ''), '프로젝트')}.bbk`;
}

/** A .bbk file is a zip of the settings plus every untouched original image. */
export function packProject(doc: ProjectDoc, sources: Record<string, Uint8Array>): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [PROJECT_JSON]: strToU8(JSON.stringify(doc)),
  };
  for (const img of doc.images) {
    if (!img.source) continue;
    const bytes = sources[img.source.imageId];
    if (bytes) entries[imageEntryName(img.source.imageId, img.source.mimeType)] = bytes;
  }
  return zipSync(entries, { level: 0 });
}

export interface UnpackedSource {
  imageId: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface UnpackedProject {
  doc: ProjectDoc;
  sources: UnpackedSource[];
}

export function unpackProject(bytes: Uint8Array): UnpackedProject {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('프로젝트 파일을 열 수 없습니다.');
  }
  const raw = files[PROJECT_JSON];
  if (!raw) throw new Error('프로젝트 설정이 없는 파일입니다.');
  const parsed = JSON.parse(strFromU8(raw)) as ProjectDoc & { artboard?: unknown; images?: unknown };
  const hasImages = Array.isArray(parsed?.images) && parsed.images.length > 0;
  if (parsed?.version !== 1 || (!hasImages && !parsed.artboard)) {
    throw new Error('이 버전의 프로젝트 파일이 아닙니다.');
  }
  const doc = normalizeDoc(migrateSeparation(parsed));
  const used = new Set<string>();
  const take = (key: string) => {
    if (used.has(key) || !files[key]) return undefined;
    used.add(key);
    return files[key];
  };
  const sources: UnpackedSource[] = [];
  for (const img of doc.images) {
    if (!img.source) continue;
    const bytesForImage =
      take(imageEntryName(img.source.imageId, img.source.mimeType)) ?? take(sourceEntryName(img.source.mimeType));
    if (!bytesForImage) throw new Error(`「${img.name}」 원본 이미지가 프로젝트에 없습니다.`);
    sources.push({ imageId: img.source.imageId, mimeType: img.source.mimeType, bytes: bytesForImage });
  }
  return { doc, sources };
}

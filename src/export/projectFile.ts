import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { fileSlug } from '../core/exportManifest';
import { migrateSeparation } from '../core/separation';
import type { ProjectDoc } from '../core/types';

const PROJECT_JSON = 'project.json';

export function sourceEntryName(mimeType: string): string {
  return mimeType === 'image/png' ? 'source.png' : 'source.jpg';
}

export function projectFileName(sourceName: string | undefined): string {
  if (!sourceName) return '프로젝트.bbk';
  return `${fileSlug(sourceName.replace(/\.[^.]+$/, ''), '프로젝트')}.bbk`;
}

/** A .bbk file is a zip of the settings plus the untouched original image. */
export function packProject(doc: ProjectDoc, source: Uint8Array | null): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    [PROJECT_JSON]: strToU8(JSON.stringify(doc)),
  };
  if (doc.source && source) entries[sourceEntryName(doc.source.mimeType)] = source;
  return zipSync(entries, { level: 0 });
}

export interface UnpackedProject {
  doc: ProjectDoc;
  source: Uint8Array | null;
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
  const doc = migrateSeparation(JSON.parse(strFromU8(raw)) as ProjectDoc);
  if (doc?.version !== 1 || !Array.isArray(doc.layers) || !doc.artboard) {
    throw new Error('이 버전의 프로젝트 파일이 아닙니다.');
  }
  if (!doc.source) return { doc, source: null };
  const source = files[sourceEntryName(doc.source.mimeType)];
  if (!source) throw new Error('프로젝트에 원본 이미지가 없습니다.');
  return { doc, source };
}

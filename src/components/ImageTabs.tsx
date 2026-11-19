import { useRef } from 'react';
import { activeFrame, MAX_IMAGES } from '../core/defaults';
import type { ImageFrame } from '../core/types';
import { useDocument } from '../state/documentStore';

export function ImageTabs() {
  const fileRef = useRef<HTMLInputElement>(null);
  const doc = useDocument((s) => s.doc);
  const loading = useDocument((s) => s.loading);
  const addImages = useDocument((s) => s.addImages);
  const selectImage = useDocument((s) => s.selectImage);
  const removeImage = useDocument((s) => s.removeImage);
  const active = activeFrame(doc);
  const full = doc.images.length >= MAX_IMAGES && !!active.source;

  const closeTab = (img: ImageFrame) => {
    if (img.source && !window.confirm(`「${img.name}」 탭을 없앨까요? 이 그림의 색상, 망점, 출력 설정도 함께 사라집니다.`)) return;
    removeImage(img.id);
  };

  return (
    <div className="image-tabs" role="tablist" aria-label="이미지 탭">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])];
          e.currentTarget.value = '';
          if (files.length) void addImages(files);
        }}
      />
      {doc.images.map((img) => {
        const selected = img.id === doc.activeImageId;
        const label = img.source ? img.name : '빈 이미지';
        return (
          <div
            key={img.id}
            role="tab"
            aria-selected={selected}
            tabIndex={0}
            className={`image-tab ${selected ? 'active' : ''} ${img.source ? '' : 'empty'}`}
            title={img.source?.fileName ?? '이미지를 올리면 이 탭에서 조정합니다'}
            onClick={() => selectImage(img.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectImage(img.id);
              }
            }}
          >
            <span className="image-tab-label">{label}</span>
            {doc.images.length > 1 && (
              <button
                type="button"
                className="tab-close"
                aria-label={`${label} 탭 닫기`}
                disabled={loading}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(img);
                }}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        className="tab-add"
        disabled={loading || full}
        title={full ? `이미지는 최대 ${MAX_IMAGES}개까지입니다` : '이미지 추가'}
        onClick={() => fileRef.current?.click()}
      >
        +
      </button>
    </div>
  );
}

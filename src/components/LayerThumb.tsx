import { useEffect, useRef } from 'react';

export function LayerThumb({ bitmap }: { bitmap: ImageBitmap | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !bitmap) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  }, [bitmap]);
  return <canvas ref={ref} className="layer-thumb" />;
}

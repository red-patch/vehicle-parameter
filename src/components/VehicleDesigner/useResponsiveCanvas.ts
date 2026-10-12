import { useState, useEffect, useRef } from 'react';

export const useResponsiveCanvas = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewDimensions, setViewDimensions] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setViewDimensions({ width, height });
        }
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  return { containerRef, viewDimensions };
};
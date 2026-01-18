import { useCallback, useEffect, useRef, useState } from 'react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getStoredWidth = (storageKey, fallback) => {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return fallback;
  const parsed = Number.parseInt(stored, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const useResizable = ({
  storageKey = 'rightPanelWidth',
  defaultWidth = 350,
  minWidth = 250,
  maxWidth = 800
} = {}) => {
  const [width, setWidth] = useState(() => getStoredWidth(storageKey, defaultWidth));
  const isResizingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(width);
  const frameRef = useRef(null);
  const pendingWidthRef = useRef(width);

  useEffect(() => {
    startWidthRef.current = width;
    pendingWidthRef.current = width;
    window.localStorage.setItem(storageKey, String(width));
  }, [width, storageKey]);

  const handleMouseMove = useCallback((event) => {
    if (!isResizingRef.current) return;
    const delta = startXRef.current - event.clientX;
    const nextWidth = clamp(startWidthRef.current + delta, minWidth, maxWidth);
    pendingWidthRef.current = nextWidth;

    if (frameRef.current) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setWidth(pendingWidthRef.current);
    });
  }, [minWidth, maxWidth]);

  const stopResize = useCallback(() => {
    if (!isResizingRef.current) return;
    isResizingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopResize);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [handleMouseMove, stopResize]);

  const handleMouseDown = useCallback((event) => {
    event.preventDefault();
    isResizingRef.current = true;
    startXRef.current = event.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [width]);

  return { width, handleMouseDown };
};

export default useResizable;
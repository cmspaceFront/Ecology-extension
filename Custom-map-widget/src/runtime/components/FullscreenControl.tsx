/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useState, useEffect, useCallback, useRef } from 'react';

interface FullscreenControlProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewRef: React.RefObject<__esri.MapView | null>;
  /** minZoom в обычном режиме (зависит от базовой карты). */
  minZoomNotFullscreen: number;
  /** minZoom в полноэкранном режиме (зависит от базовой карты). */
  minZoomFullscreen: number;
}

const FullscreenControl = ({ containerRef, viewRef, minZoomNotFullscreen, minZoomFullscreen }: FullscreenControlProps) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isFullscreenRef = useRef(false);

  const refreshView = useCallback(() => {
    const view = viewRef.current;
    if (view && !view.destroyed) {
      try {
        view.resize();
      } catch {
        // ignore
      }
    }
  }, [viewRef]);

  const handleFullscreenChange = useCallback(() => {
    const doc = document as Document & { fullscreenElement?: Element; webkitFullscreenElement?: Element };
    const fullscreenEl = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
    const active = fullscreenEl === containerRef.current;
    isFullscreenRef.current = active;
    setIsFullscreen(active);
    containerRef.current?.classList.toggle('is-fullscreen', active);
    const view = viewRef.current;
    if (view && !view.destroyed) {
      const target = active ? minZoomFullscreen : minZoomNotFullscreen;
      view.constraints.minZoom = target;
      const z = view.zoom ?? target;
      if (z < target) {
        view.goTo({ zoom: target }, { duration: 200, easing: 'ease-out' }).catch(() => {});
      }
    }
    refreshView();
  }, [containerRef, viewRef, refreshView, minZoomNotFullscreen, minZoomFullscreen]);

  useEffect(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [handleFullscreenChange]);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const doc = document as Document & {
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void>;
      fullscreenElement?: Element;
      webkitFullscreenElement?: Element;
    };

    if (isFullscreenRef.current) {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      return;
    }

    const el = container as HTMLElement & { requestFullscreen?: () => Promise<void>; webkitRequestFullscreen?: () => Promise<void> };
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }, [containerRef]);

  return (
    <div className="fullscreen-control">
      <button
        type="button"
        className="zoom-btn fullscreen-btn"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Полный экран'}
      >
        {isFullscreen ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 4H4v2M16 4h2v2M16 16h2v-2M6 16H4v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 6V2h4M18 6V2h-4M18 14v4h-4M2 14v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default FullscreenControl;

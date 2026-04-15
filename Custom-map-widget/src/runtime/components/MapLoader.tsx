/** @jsx jsx */
import { jsx } from 'jimu-core';
import React, { memo } from 'react';
import { useLocale } from './hooks/useLocale';

interface MapLoaderProps {
  isProcessing?: boolean;
  visible?: boolean;
  progress?: number; // 0..100
}

// Красивый анимированный лоадер карты с локализацией
const MapLoader = memo(({ isProcessing = false, visible = true, progress }: MapLoaderProps) => {
  const { t } = useLocale();
  const safeProgress =
    typeof progress === 'number' && isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : null;

  return (
    <div className={`map-loader ${visible ? 'map-loader--visible' : 'map-loader--hidden'}`}>
      <div className="map-loader__background">
        <div className="map-loader__grid"></div>
        <div className="map-loader__gradient"></div>
      </div>
      <div className="map-loader__content">
        <div className="map-loader__globe-container">
          <div className="map-loader__globe">
            <div className="map-loader__globe-inner">
              <div className="map-loader__globe-ring map-loader__globe-ring--1"></div>
              <div className="map-loader__globe-ring map-loader__globe-ring--2"></div>
              <div className="map-loader__globe-ring map-loader__globe-ring--3"></div>
              <div className="map-loader__globe-core">
                <div className="map-loader__globe-core-inner"></div>
              </div>
            </div>
            <div className="map-loader__pulse map-loader__pulse--1"></div>
            <div className="map-loader__pulse map-loader__pulse--2"></div>
            <div className="map-loader__pulse map-loader__pulse--3"></div>
          </div>
          <div className="map-loader__particles">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="map-loader__particle" style={{ '--i': i } as React.CSSProperties}></div>
            ))}
          </div>
        </div>
        <div className="map-loader__text">
          <span className="map-loader__text-main">
            {t('loader.loading')}
          </span>
          <span className="map-loader__dots">
            <span className="map-loader__dot">.</span>
            <span className="map-loader__dot">.</span>
            <span className="map-loader__dot">.</span>
          </span>
        </div>
        <div className="map-loader__progress">
          <div
            className={`map-loader__progress-bar ${safeProgress != null ? 'map-loader__progress-bar--determinate' : ''}`}
            style={safeProgress != null ? ({ width: `${safeProgress}%` } as React.CSSProperties) : undefined}
          ></div>
        </div>
        {safeProgress != null && (
          <div className="map-loader__percent" aria-label="Loading percent">
            {safeProgress}%
          </div>
        )}
      </div>
    </div>
  );
});

MapLoader.displayName = 'MapLoader';

export default MapLoader;


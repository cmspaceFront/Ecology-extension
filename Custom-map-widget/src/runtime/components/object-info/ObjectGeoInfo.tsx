/** @jsx jsx */
/** @jsxFrag React.Fragment */
import React, { useRef, useCallback, useState, useEffect, memo } from 'react';
import { jsx } from 'jimu-core';
import ZoomControls from './ZoomControls';
import BasemapGallery from './BasemapGallery';
import Legend from './Legend';
import { useRegionData } from './hooks/use-region-data';
import { useMapMask } from './hooks/use-map-mask';
import MapPopup from './MapPopup';
import CustomModal from './CustomModal';
import { useLocale } from './hooks/useLocale';
import { useFilters } from './hooks/use-filters';

interface PolygonData {
  viloyat?: string;
  tuman?: string;
  mfy?: string;
  maydon?: number;
  tur?: string;
  latitude?: number;
  longitude?: number;
  yil?: string;
  'Yer toifa'?: string;
  natija?: string;
  GlobalID?: string;
  Inspektor?: string;
  Jarima_qollanildi?: string;
  Hisoblangan_zarar?: string;
  Holat_bartaraf_etildi?: string;
  buzilish?: string;
}

interface ObjectGeoInfoProps {
  assetBasePath?: string;
}

// Красивый анимированный лоадер карты с локализацией
const MapLoader = memo(({ isProcessingRegion = false }: { isProcessingRegion?: boolean }) => {
  const { t } = useLocale();

  return (
    <div className="map-loader">
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
            {isProcessingRegion ? 'Обработка данных региона...' : t('loader.loading')}
          </span>
          <span className="map-loader__dots">
            <span className="map-loader__dot">.</span>
            <span className="map-loader__dot">.</span>
            <span className="map-loader__dot">.</span>
          </span>
        </div>
        <div className="map-loader__progress">
          <div className="map-loader__progress-bar"></div>
        </div>
      </div>
    </div>
  );
});

const ObjectGeoInfo = ({ assetBasePath }: ObjectGeoInfoProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [polygonData, setPolygonData] = useState<PolygonData | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);

  // Load basemap from local storage on mount
  const [currentBasemap, setCurrentBasemap] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('custom-map-widget-basemap');
      return saved || 'hybrid';
    } catch {
      return 'hybrid';
    }
  });

  const {
    geoJSONData,
    districtGeoJSON,
    selectedRegion,
    selectedDistrict,
    selectionRevision
  } = useRegionData(assetBasePath);

  const { filters, filtersRevision } = useFilters();

  const openPopup = useCallback((data: PolygonData, position: { x: number; y: number }) => {
    setPolygonData(data);
    setPopupPosition(position);
    setIsPopupOpen(true);
  }, []);

  const closePopup = useCallback(() => {
    setIsPopupOpen(false);
    setPopupPosition(null);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
    setIsPopupOpen(false);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const { handleZoomIn, handleZoomOut, isMapReady, isProcessingRegion, changeBasemap, toggleImageServiceLayer } = useMapMask({
    mapRef,
    geoJSONData,
    districtGeoJSON,
    selectedRegion,
    selectedDistrict,
    selectionRevision,
    filters,
    filtersRevision,
    onShowPopup: openPopup
  });

  const handleBasemapChange = async (basemapId: string) => {
    await changeBasemap(basemapId);
    setCurrentBasemap(basemapId);
    // Save to local storage
    try {
      localStorage.setItem('custom-map-widget-basemap', basemapId);
    } catch (error) {
      // Silently fail if localStorage is not available
    }
  };

  // Apply saved basemap when map is ready (only once on initial load)
  const hasAppliedBasemapRef = useRef(false);
  useEffect(() => {
    if (isMapReady && currentBasemap && !hasAppliedBasemapRef.current) {
      changeBasemap(currentBasemap);
      hasAppliedBasemapRef.current = true;
    }
  }, [isMapReady, currentBasemap, changeBasemap]);

  // Минимальное время показа лоадера (чтобы не мигал)
  const [minLoadTimePassed, setMinLoadTimePassed] = useState(false);
  const loadStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    const minLoadDuration = 1500; // Минимум 1.5 секунды
    const elapsed = Date.now() - loadStartTimeRef.current;
    const remaining = Math.max(0, minLoadDuration - elapsed);

    const timer = setTimeout(() => {
      setMinLoadTimePassed(true);
    }, remaining);

    return () => clearTimeout(timer);
  }, []);

  // Показываем лоадер пока данные не загружены, карта не готова или не прошло минимальное время
  const isLoading = !geoJSONData || !isMapReady || !minLoadTimePassed || isProcessingRegion;

  return (
    <div className="geo-info">
      {isLoading && <MapLoader isProcessingRegion={isProcessingRegion} />}
      <div
        ref={mapRef}
        className="map-container"
        style={{ opacity: isLoading ? 0 : 1, transition: 'opacity 0.5s ease' }}
      >
        <MapPopup
          isOpen={isPopupOpen}
          onClose={closePopup}
          polygonData={polygonData}
          position={popupPosition}
          uploadedFiles={[]}
          photos={[]}
          onEdit={openModal}
        />
      </div>
      {!isLoading && (
        <>
          <ZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
          <BasemapGallery
            onChangeBasemap={handleBasemapChange}
            currentBasemap={currentBasemap}
            onToggleImageService={toggleImageServiceLayer}
          />
          <Legend />
        </>
      )}
      <CustomModal isOpen={isModalOpen} onClose={closeModal} polygonData={polygonData} />
    </div>
  );
};

export default memo(ObjectGeoInfo);

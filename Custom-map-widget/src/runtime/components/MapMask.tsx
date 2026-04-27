/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useRef, useState } from 'react';
import { useFilters } from './hooks/useFilters';
import BorderMask from './masks/BorderMask';
import RegionMask from './masks/RegionMask';
import DistrictMask from './masks/DistrictMask';

export interface MapMaskProps {
  map: __esri.Map | null;
  view: __esri.MapView | null;
  isMapReady: boolean;
}

/**
 * Основной компонент для создания масок карты
 * Роутер, который выбирает нужный компонент маски в зависимости от selectedSoato
 */
const MapMask = ({ map, view, isMapReady }: MapMaskProps) => {
  const maskLayerRef = useRef<__esri.GraphicsLayer | null>(null);
  const { filters } = useFilters();
  const selectedSoato = (filters as any).selectedSoato;
  const [isMaskInitialized, setIsMaskInitialized] = useState(false);

  // Определяем тип маски на основе selectedSoato
  const getMaskType = () => {
    // Если selectedSoato отсутствует, пустой, или равен 'all', используем border маску
    if (!selectedSoato || selectedSoato.trim() === '' || selectedSoato === 'all') {
      return 'border';
    }
    
    const soatoLength = selectedSoato.length;
    if (soatoLength === 4) {
      return 'region';
    } else if (soatoLength === 7) {
      return 'district';
    }
    
    // Для других длин возвращаем border (по умолчанию)
    return 'border';
  };

  const maskType = getMaskType();

  // Рендерим соответствующий компонент маски
  if (!maskType) {
    return null;
  }

  if (maskType === 'border') {
    return (
      <BorderMask
        map={map}
        view={view}
        isMapReady={isMapReady}
        maskLayerRef={maskLayerRef}
        setIsMaskInitialized={setIsMaskInitialized}
      />
    );
  }

  if (maskType === 'region') {
    return (
      <RegionMask
        map={map}
        view={view}
        isMapReady={isMapReady}
        selectedSoato={selectedSoato}
        maskLayerRef={maskLayerRef}
        setIsMaskInitialized={setIsMaskInitialized}
      />
    );
  }

  if (maskType === 'district') {
    return (
      <DistrictMask
        map={map}
        view={view}
        isMapReady={isMapReady}
        selectedSoato={selectedSoato}
        maskLayerRef={maskLayerRef}
        setIsMaskInitialized={setIsMaskInitialized}
      />
    );
  }

  return null;
};

export default MapMask;

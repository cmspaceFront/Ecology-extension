import { RefObject } from 'react';
import { FiltersState } from './use-filters';

export interface PolygonData {
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
  Tekshiruv_natijasi?: string;
  gid?: number;
  globalid?: string | number;
  sana?: string;
  yer_toifa?: string;
  district?: string;
  region?: number;
  mahalla_id?: number;
  tekshirish?: string | null;
  [key: string]: any;
}

export interface UseMapMaskParams {
  mapRef: RefObject<HTMLDivElement>;
  geoJSONData: any | null;
  districtGeoJSON: any | null;
  selectedRegion: string;
  selectedDistrict: string | null;
  selectionRevision: number;
  filters: FiltersState;
  filtersRevision: number;
  onShowPopup?: (data: PolygonData, position: { x: number; y: number }) => void;
}

export interface UseMapMaskResult {
  handleZoomIn: () => Promise<void>;
  handleZoomOut: () => Promise<void>;
  isMapReady: boolean;
  isProcessingRegion: boolean;
  changeBasemap: (basemapId: string) => Promise<void>;
  toggleImageServiceLayer: (enabled: boolean) => Promise<void>;
}

export interface GeometryModules {
  geometryEngine: typeof __esri.geometryEngine;
  Polygon: typeof __esri.Polygon;
  SpatialReference: typeof __esri.SpatialReference;
  Graphic: typeof __esri.Graphic;
  webMercatorUtils: typeof __esri.webMercatorUtils;
  projection?: any;
}

export interface CachedPolygons {
  [key: string]: {
    graphics: __esri.Graphic[];
    timestamp: number;
    featureCount: number;
  };
}

export interface RegionAndDistrict {
  region: string;
  district: string | null;
}










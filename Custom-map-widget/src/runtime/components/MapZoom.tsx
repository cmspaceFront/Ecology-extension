/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useEffect, useRef } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { useFilters } from './hooks/useFilters';
import { DISTRICT_FEATURE_SERVER_URL, REGION_FEATURE_SERVER_URL } from './masks/constants';
import { zoomState, notifyZoomStateChange } from './masks/zoomState';

export interface MapZoomProps {
  map: __esri.Map | null;
  view: __esri.MapView | null;
  isMapReady: boolean;
  /** Увеличить при очистке searchValue — повторить зум к текущему selectedSoato */
  soatoZoomSignal?: number;
}

/**
 * Компонент для плавного зума к выбранному региону/району.
 * Region FeatureServer: parent_cod (Integer)
 * Districts FeatureServer: district (String)
 */
const extentCache = new Map<string, { extent: __esri.Extent; timestamp: number }>();
const EXTENT_CACHE_DURATION = 10 * 60 * 1000;

const MapZoom = ({ map, view, isMapReady, soatoZoomSignal = 0 }: MapZoomProps) => {
  const { filters } = useFilters();
  const selectedSoato = (filters as any).selectedSoato;
  const abortControllerRef = useRef<AbortController | null>(null);
  const isZoomingRef = useRef(false);
  const lastSelectedSoatoRef = useRef<string | null>(null);
  const lastAppliedSignalRef = useRef<number>(-1);

  useEffect(() => {
    if (!map || !view || !isMapReady) return;

    const forceRepeat = soatoZoomSignal !== lastAppliedSignalRef.current;
    if (!forceRepeat && lastSelectedSoatoRef.current === selectedSoato) return;

    lastAppliedSignalRef.current = soatoZoomSignal;

    const previousSoato = lastSelectedSoatoRef.current;
    lastSelectedSoatoRef.current = selectedSoato;

    const noSoato =
      !selectedSoato ||
      selectedSoato === 'all' ||
      String(selectedSoato).trim() === '';

    if (noSoato) {
      const hadSpecificSelection =
        previousSoato !== null && previousSoato !== '' && previousSoato !== 'all';
      // Без выбранного SOATO: при очистке searchValue (forceRepeat) — всегда дефолтный зум
      if (!forceRepeat && !hadSpecificSelection) return;

      const resetToInitialZoom = async () => {
        if (!view || isZoomingRef.current) return;
        isZoomingRef.current = true;
        zoomState.isZooming = true;
        notifyZoomStateChange();
        try {
          const [Point, SpatialReference] = await loadArcGISJSAPIModules([
            'esri/geometry/Point',
            'esri/geometry/SpatialReference',
          ]);
          const initialCenter = new Point({
            longitude: 64.0,
            latitude: 41.0,
            spatialReference: new SpatialReference({ wkid: 4326 }),
          });
          const minZ = view.constraints?.minZoom ?? 6;
          await view.goTo({ center: initialCenter, zoom: minZ }, { duration: 300, easing: 'ease-in-out' });
        } catch {
          // goto-interrupted
        } finally {
          isZoomingRef.current = false;
          zoomState.isZooming = false;
          notifyZoomStateChange();
        }
      };

      resetToInitialZoom();
      return;
    }

    const soatoLength = selectedSoato.length;

    let featureServerUrl: string;
    let whereClause: string;

    if (soatoLength === 4) {
      // Регион — parent_cod is Integer (как раньше)
      featureServerUrl = REGION_FEATURE_SERVER_URL;
      whereClause = `parent_cod = ${selectedSoato}`;
    } else if (soatoLength === 7) {
      // Район — используем сервис из ArcGIS Map Viewer
      featureServerUrl = DISTRICT_FEATURE_SERVER_URL;
      whereClause = `district = '${String(selectedSoato).replace(/'/g, "''")}'`;
    } else {
      return;
    }

    let isMounted = true;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const performZoom = async () => {
      if (isZoomingRef.current) return;

      try {
        isZoomingRef.current = true;
        zoomState.isZooming = true;
        notifyZoomStateChange();

        const [SpatialReference, Extent, FeatureLayer] = await loadArcGISJSAPIModules([
          'esri/geometry/SpatialReference',
          'esri/geometry/Extent',
          'esri/layers/FeatureLayer',
        ]);

        const sr = new SpatialReference({ wkid: 3857 });

        // Проверяем кэш
        const cacheKey = `${soatoLength === 4 ? 'region' : 'district'}_${selectedSoato}`;
        const cached = extentCache.get(cacheKey);
        const now = Date.now();

        if (cached && now - cached.timestamp < EXTENT_CACHE_DURATION) {
          let extent = cached.extent;
          const extentWkid = extent.spatialReference?.wkid;
          if (
            (Math.abs(extent.xmin) > 1000 || Math.abs(extent.xmax) > 1000) &&
            (extentWkid === 4326 || extentWkid === 4269)
          ) {
            extent = new Extent({
              xmin: extent.xmin, ymin: extent.ymin,
              xmax: extent.xmax, ymax: extent.ymax,
              spatialReference: sr,
            });
          }
          await view.goTo(extent.expand(1.2), { duration: 400, easing: 'ease-out' });
          return;
        }

        // Запрос к ArcGIS FeatureServer через ArcGIS JS API (автоматически подставляет токен)
        const layer = new FeatureLayer({
          url: featureServerUrl,
          outFields: [],
        });

        let featureSet: __esri.FeatureSet | null = null;
        try {
          featureSet = await layer.queryFeatures({
            where: whereClause,
            returnGeometry: true,
            outSpatialReference: sr,
            // Не оставляем outFields пустым: иначе Esri иногда возвращает FeatureSet
            // в PBF без схемы/полей, и парсер может упасть (как у тебя в консоли).
            outFields: ['*'],
            num: 1,
          } as any);
        } catch (e) {
          return;
        }

        const features = featureSet?.features ?? [];
        if (!features.length) {
          return;
        }

        const geom = features[0]?.geometry as __esri.Geometry | null;
        const extent = (geom as any)?.extent as __esri.Extent | null;
        if (!extent) {
          return;
        }

        extentCache.set(cacheKey, { extent, timestamp: Date.now() });

        const expandedExtent = extent.expand(1.2);

        await view.goTo(expandedExtent, { duration: 400, easing: 'ease-out' });

        const minZ = view.constraints?.minZoom ?? 6;
        if ((view.zoom ?? minZ) < minZ) {
          await view.goTo({ zoom: minZ }, { duration: 200, easing: 'ease-out' });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
      } finally {
        isZoomingRef.current = false;
        zoomState.isZooming = false;
        notifyZoomStateChange();
      }
    };

    performZoom();

    return () => {
      isMounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isZoomingRef.current = false;
      zoomState.isZooming = false;
      notifyZoomStateChange();
    };
  }, [map, view, isMapReady, selectedSoato, soatoZoomSignal]);

  return null;
};

export default MapZoom;

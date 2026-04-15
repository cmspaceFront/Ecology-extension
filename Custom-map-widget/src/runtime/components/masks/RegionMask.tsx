/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useEffect, useRef, useState } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { useLocale } from '../hooks/useLocale';
import {
  WEB_MERCATOR_EXTENT,
  regionGeometryCache,
  REGION_CACHE_DURATION,
  REGION_FEATURE_SERVER_URL
} from './constants';
import { zoomState, subscribeToZoomState } from './zoomState';

export interface RegionMaskProps {
  map: __esri.Map | null;
  view: __esri.MapView | null;
  isMapReady: boolean;
  selectedSoato: string;
  maskLayerRef: React.MutableRefObject<__esri.GraphicsLayer | null>;
  setIsMaskInitialized: (value: boolean) => void;
}

/**
 * Компонент для создания маски региона
 * Затемняет все области кроме выбранного региона
 */
const RegionMask = ({
  map,
  view,
  isMapReady,
  selectedSoato,
  maskLayerRef,
  setIsMaskInitialized
}: RegionMaskProps) => {
  const { t } = useLocale();
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastSelectedSoatoRef = useRef<string | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Подписываемся на изменения состояния зума
  useEffect(() => {
    const unsubscribe = subscribeToZoomState(() => {
      setIsZooming(zoomState.isZooming);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!map || !view || !isMapReady || !selectedSoato) {
      return;
    }

    // Пропускаем если selectedSoato не изменился
    if (lastSelectedSoatoRef.current === selectedSoato) {
      return;
    }
    lastSelectedSoatoRef.current = selectedSoato;

    // Очищаем предыдущий таймер
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
      updateTimeoutRef.current = null;
    }

    let isMounted = true;

    // Отменяем предыдущий запрос, если он еще выполняется
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const initMask = async () => {
      const startedAt = performance.now();
      try {
        // Проверяем кэш региона
        const cacheKey = `region_${selectedSoato}`;
        const cached = regionGeometryCache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < REGION_CACHE_DURATION) {
          // Используем кэшированную геометрию
          if (!maskLayerRef.current) {
            const [GraphicsLayer] = await loadArcGISJSAPIModules(['esri/layers/GraphicsLayer']);
            const newMaskLayer = new GraphicsLayer({
              title: t('layers.mapMask'),
              opacity: 1,
              visible: true,
            });
            map.add(newMaskLayer, 0);
            maskLayerRef.current = newMaskLayer;
          }

          const [Graphic] = await loadArcGISJSAPIModules([
            'esri/Graphic',
          ]);
          const maskGeometry = cached.geometry as __esri.Polygon;

          if (maskGeometry && maskLayerRef.current) {
            const maskGraphic = new Graphic({
              geometry: maskGeometry,
              symbol: {
                type: 'simple-fill',
                color: [0, 0, 0, 0],
                outline: { color: [0, 0, 0, 0.85], width: 2 }
              } as any
            });

            requestAnimationFrame(() => {
              if (!isMounted || !maskLayerRef.current) return;
              maskLayerRef.current.removeAll();
              maskLayerRef.current.add(maskGraphic);
              setIsMaskInitialized(true);

            });
          }
          return;
        }

        // Загружаем модули параллельно
        const [
          GraphicsLayer,
          FeatureLayer,
          Polygon,
          SpatialReference,
          Graphic,
          Query
        ] = await loadArcGISJSAPIModules([
          'esri/layers/GraphicsLayer',
          'esri/layers/FeatureLayer',
          'esri/geometry/Polygon',
          'esri/geometry/SpatialReference',
          'esri/Graphic',
          'esri/rest/support/Query'
        ]);

        if (!isMounted || !map || !view) {
          return;
        }

        if (!maskLayerRef.current) {
          const newMaskLayer = new GraphicsLayer({
            title: t('layers.mapMask'),
            opacity: 1,
            visible: true,
          });
          map.add(newMaskLayer, 0);
          maskLayerRef.current = newMaskLayer;
        }

        const maskLayer = maskLayerRef.current;

        // Создаем FeatureLayer для загрузки данных
        const featureLayer = new FeatureLayer({
          url: REGION_FEATURE_SERVER_URL,
          outFields: ['*'],
          visible: false,
        });

        map.add(featureLayer);
        const featureLayerRef = { current: featureLayer };

        // Оптимизация: используем известное поле напрямую
        // Для региона используем ключевое поле как раньше: parent_cod
        const soatoFieldName = 'parent_cod';
        const isStringField = false;

        // Оптимизированный запрос через REST API
        let queryResult: __esri.FeatureSet | null = null;

        if (soatoFieldName) {
          try {
            const whereClause = isStringField
              ? `${soatoFieldName} = '${selectedSoato}'`
              : `${soatoFieldName} = ${selectedSoato}`;

            const queryUrl = `${REGION_FEATURE_SERVER_URL}/query?where=${encodeURIComponent(whereClause)}&f=json&outSR=3857&returnGeometry=true&outFields=&maxRecordCount=1`;

            const restStartedAt = performance.now();

            const response = await fetch(queryUrl, {
              signal: abortControllerRef.current?.signal
            });

            if (response.ok && !abortControllerRef.current?.signal.aborted) {
              const jsonData = await response.json();

              if (!jsonData.error && jsonData.features && jsonData.features.length > 0) {
                const graphics = jsonData.features.map((f: any) => Graphic.fromJSON(f));

                queryResult = {
                  features: graphics,
                  fields: jsonData.fields || [],
                  geometryType: jsonData.geometryType
                } as __esri.FeatureSet;

              }
            }
          } catch (error) {
          }
        }

        // Если REST API не сработал, пробуем через FeatureLayer (fallback)
        if (!queryResult && featureLayer) {
          try {
            await featureLayer.when();

            const whereClause = isStringField
              ? `${soatoFieldName} = '${selectedSoato}'`
              : `${soatoFieldName} = ${selectedSoato}`;

            const query = new Query({
              where: whereClause,
              returnGeometry: true,
              outSpatialReference: { wkid: 3857 },
              outFields: [],
            });

            const featureSet = await featureLayer.queryFeatures(query);

            if (featureSet.features && featureSet.features.length > 0) {
              queryResult = featureSet;
            }
          } catch (error) {
            // Игнорируем ошибки
          }
        }

        if (!isMounted || abortControllerRef.current?.signal.aborted) {
          return;
        }

        if (!queryResult || !queryResult.features || queryResult.features.length === 0) {
          if (maskLayerRef.current) {
            maskLayerRef.current.removeAll();
          }
          setIsMaskInitialized(false);

          return;
        }

        // Получаем геометрию выбранного региона
        const selectedFeature = queryResult.features[0];
        const selectedGeometry = selectedFeature.geometry as __esri.Polygon;

        if (!selectedGeometry) {
          if (maskLayerRef.current) {
            maskLayerRef.current.removeAll();
          }
          setIsMaskInitialized(false);

          return;
        }

        const polygonForMask = selectedGeometry;

        if (!isMounted || abortControllerRef.current?.signal.aborted) {
          return;
        }

        // Сохраняем геометрию в кэш
        regionGeometryCache.set(cacheKey, {
          geometry: polygonForMask,
          timestamp: Date.now()
        });

        // Рисуем только границу выбранного региона (без затемнения)
        const maskGeometry = polygonForMask;

        if (maskGeometry && maskLayer) {
          const maskGraphic = new Graphic({
            geometry: maskGeometry,
            symbol: {
              type: 'simple-fill',
              color: [0, 0, 0, 0],
              outline: {
                color: [0, 0, 0, 0.85],
                width: 2
              }
            } as any
          });

          // Обновляем маску через requestAnimationFrame для плавности
          if (!isMounted || abortControllerRef.current?.signal.aborted || !maskLayer) {
            return;
          }

          requestAnimationFrame(() => {
            if (!isMounted || abortControllerRef.current?.signal.aborted || !maskLayer) {
              return;
            }
            maskLayer.removeAll();
            maskLayer.add(maskGraphic);
            setIsMaskInitialized(true);

          });
        }

        // Удаляем FeatureLayer
        try {
          // Проверяем, что map и layers существуют и не уничтожены
          if (map && !map.destroyed && map.layers) {
            try {
              // Проверяем, что слой действительно в коллекции перед удалением
              if (map.layers.includes(featureLayer)) {
                map.layers.remove(featureLayer);
              }
            } catch (error) {
              // Слой уже удален или произошла ошибка
            }
          }
          // Уничтожаем слой, если он еще существует
          if (featureLayer && !featureLayer.destroyed) {
            try {
              featureLayer.destroy();
            } catch (error) {
              // Слой уже уничтожен
            }
          }
        } catch (error) {
          // Игнорируем ошибки
        }
      } catch (error) {
        if (maskLayerRef.current) {
          maskLayerRef.current.removeAll();
        }
        setIsMaskInitialized(false);

      }
    };

    // Запускаем обновление маски сразу
    initMask();

    return () => {
      isMounted = false;

      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [map, view, isMapReady, selectedSoato]);

  return null;
};

export default RegionMask;


/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useEffect, useRef, useState } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { useLocale } from '../hooks/useLocale';
import {
  WEB_MERCATOR_EXTENT,
  borderGeometryCache,
  BORDER_CACHE_DURATION,
  BORDER_FEATURE_SERVER_URL
} from './constants';

export interface BorderMaskProps {
  map: __esri.Map | null;
  view: __esri.MapView | null;
  isMapReady: boolean;
  maskLayerRef: React.MutableRefObject<__esri.GraphicsLayer | null>;
  setIsMaskInitialized: (value: boolean) => void;
}

/**
 * Компонент для создания маски границы (Border)
 * Затемняет внутреннюю часть границы Узбекистана
 */
const BorderMask = ({
  map,
  view,
  isMapReady,
  maskLayerRef,
  setIsMaskInitialized
}: BorderMaskProps) => {
  const { t } = useLocale();
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!map || !view || !isMapReady) {
      return;
    }

    let isMounted = true;

    // Отменяем предыдущий запрос, если он еще выполняется
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const initBorderMask = async () => {
      try {
        // Проверяем кэш границы
        const cacheKey = 'border';
        const cached = borderGeometryCache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.timestamp) < BORDER_CACHE_DURATION) {
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

          const [Graphic, Polygon, SpatialReference] = await loadArcGISJSAPIModules([
            'esri/Graphic',
            'esri/geometry/Polygon',
            'esri/geometry/SpatialReference'
          ]);

          // Создаем world polygon
          const worldPolygon = new Polygon({
            rings: [[
              [WEB_MERCATOR_EXTENT.xmin, WEB_MERCATOR_EXTENT.ymin],
              [WEB_MERCATOR_EXTENT.xmax, WEB_MERCATOR_EXTENT.ymin],
              [WEB_MERCATOR_EXTENT.xmax, WEB_MERCATOR_EXTENT.ymax],
              [WEB_MERCATOR_EXTENT.xmin, WEB_MERCATOR_EXTENT.ymax],
              [WEB_MERCATOR_EXTENT.xmin, WEB_MERCATOR_EXTENT.ymin]
            ]],
            spatialReference: new SpatialReference({ wkid: 3857 })
          });

          // Используем саму границу как маску (затемняем внутреннюю часть)
          const maskGraphic = new Graphic({
            geometry: cached.geometry,
            symbol: {
              type: 'simple-fill',
              color: [0, 0, 0, 0.6],
              outline: { color: [0, 0, 0, 0], width: 0 }
            } as any
          });

          if (maskLayerRef.current) {
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
          geometryEngine,
          Polygon,
          SpatialReference,
          Graphic
        ] = await loadArcGISJSAPIModules([
          'esri/layers/GraphicsLayer',
          'esri/geometry/geometryEngine',
          'esri/geometry/Polygon',
          'esri/geometry/SpatialReference',
          'esri/Graphic'
        ]);

        if (!isMounted || !map || !view) {
          return;
        }

        // НЕ удаляем старый слой маски сразу - будем заменять только графику
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

        // Используем FeatureLayer для надежного получения данных
        // SpatialReference уже загружен выше, используем его
        const [FeatureLayer, Query] = await loadArcGISJSAPIModules([
          'esri/layers/FeatureLayer',
          'esri/rest/support/Query'
        ]);

        const featureLayer = new FeatureLayer({
          url: BORDER_FEATURE_SERVER_URL,
          outFields: ['*'],
          visible: false,
        });

        map.add(featureLayer);
        await featureLayer.when();

        const query = new Query({
          where: '1=1',
          returnGeometry: true,
          outSpatialReference: new SpatialReference({ wkid: 3857 }),
          outFields: [],
        });

        const featureSet = await featureLayer.queryFeatures(query);

        // Удаляем FeatureLayer сразу после получения данных
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
        } catch (e) {
          // Игнорируем ошибки
        }

        if (!isMounted || abortControllerRef.current?.signal.aborted) {
          return;
        }

        if (!featureSet.features || featureSet.features.length === 0) {
          return;
        }

        // Получаем геометрии напрямую из features
        const geometries = featureSet.features
          .map(f => f.geometry)
          .filter(g => g && g.type === 'polygon') as __esri.Polygon[];

        if (geometries.length === 0) {
          return;
        }

        // Объединяем все границы в один полигон
        let borderGeometry = geometries[0];

        if (geometries.length > 1) {
          const BATCH_SIZE = 10;
          for (let i = 1; i < geometries.length; i += BATCH_SIZE) {
            if (!isMounted || abortControllerRef.current?.signal.aborted) {
              return;
            }

            const batch = geometries.slice(i, Math.min(i + BATCH_SIZE, geometries.length));

            if (batch.length > 0) {
              try {
                const batchUnion = geometryEngine.union([borderGeometry, ...batch]) as __esri.Polygon;
                if (batchUnion) {
                  borderGeometry = batchUnion;
                }
              } catch (unionError) {
                // Если объединение не удалось, продолжаем с текущей геометрией
              }
            }

            if (i + BATCH_SIZE < geometries.length) {
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
          }
        }

        if (!isMounted || abortControllerRef.current?.signal.aborted) {
          return;
        }

        // Сохраняем в кэш
        borderGeometryCache.set(cacheKey, {
          geometry: borderGeometry,
          timestamp: Date.now()
        });

        // Создаем маску: затемняем ВНУТРЕННЮЮ часть границы (все, что ВНУТРИ границы Узбекистана)
        // Используем саму границу как маску
        const maskGeometry = borderGeometry;

        if (maskGeometry && maskLayer) {
          // Создаем графику для маски (темная заливка ВНУТРИ границы)
          const maskGraphic = new Graphic({
            geometry: maskGeometry,
            symbol: {
              type: 'simple-fill',
              color: [0, 0, 0, 0.6], // Темная заливка с прозрачностью 60%
              outline: {
                color: [0, 0, 0, 0],
                width: 0
              }
            } as any
          });

          // Удаляем старую графику и добавляем новую атомарно
          requestAnimationFrame(() => {
            if (!isMounted || abortControllerRef.current?.signal.aborted || !maskLayer) {
              return;
            }

            maskLayer.removeAll();
            maskLayer.add(maskGraphic);
            setIsMaskInitialized(true);
          });
        }
      } catch (error) {
        if (maskLayerRef.current) {
          maskLayerRef.current.removeAll();
        }
        setIsMaskInitialized(false);
      }
    };

    initBorderMask();

    return () => {
      isMounted = false;

      // Отменяем текущий запрос
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [map, view, isMapReady]);

  return null;
};

export default BorderMask;


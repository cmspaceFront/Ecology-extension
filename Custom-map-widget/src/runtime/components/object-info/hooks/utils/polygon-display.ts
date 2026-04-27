import { RefObject } from 'react';
import { MAP_DEFAULT_VIEW } from '../../constants';
import { createDefaultMockSymbol } from '../../utils/symbols';
import { createPolygonFromFeature } from '../../utils/geometry-utils';
import { CachedPolygons } from '../types';

const polygonsCache = new Map<string, CachedPolygons>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 минут

export const displayPolygons = async (
  polygonsData: any,
  viewRef: RefObject<__esri.MapView | null>,
  ecologyLayerRef: RefObject<__esri.GraphicsLayer | null>,
  geometryModulesRef: RefObject<any>,
  symbolCacheRef: RefObject<Map<string, any>>,
  filters: any,
  setIsProcessingRegion: (value: boolean) => void,
  regionProcessingCancelRef: RefObject<(() => void) | null>
): Promise<void> => {
  if (!polygonsData) {
    ecologyLayerRef.current?.removeAll();
    return;
  }
  
  // Если selectedSoato удален, не показываем полигоны
  if (!filters.selectedSoato) {
    ecologyLayerRef.current?.removeAll();
    return;
  }
  
  if (!viewRef.current || !ecologyLayerRef.current || !geometryModulesRef.current) {
    return;
  }

  const { Polygon, SpatialReference, Graphic } = geometryModulesRef.current!;
  const currentZoom = viewRef.current?.zoom || MAP_DEFAULT_VIEW.zoom;

  // Создаем ключ кеша на основе фильтров
  const cacheKey = `${filters.selectedSoato}-${filters.selectedYear || 'all'}-${filters.status || 'all'}-${filters.selectedTypeId?.id || 'all'}-${currentZoom}`;

  // Проверяем кеш только если данные точно совпадают
  const cachedData = polygonsCache.get(cacheKey);
  if (cachedData && cachedData.featureCount === polygonsData.features.length) {
    ecologyLayerRef.current?.removeAll();
    ecologyLayerRef.current?.addMany(cachedData.graphics);
    return;
  }

  // Определяем, является ли это Viloyat.json (большой объем данных)
  const isRegionData = !filters.selectedSoato || filters.selectedSoato === 'all';
  const features = polygonsData.features;

  // Для больших данных используем оптимизированную обработку, но без задержек
  if (isRegionData && features.length > 200) {
    setIsProcessingRegion(true);
    let isCancelled = false;
    regionProcessingCancelRef.current = () => {
      isCancelled = true;
      setIsProcessingRegion(false);
    };
    processRegionPolygons(
      features,
      currentZoom,
      cacheKey,
      () => isCancelled,
      () => {
        setIsProcessingRegion(false);
      },
      Polygon,
      SpatialReference,
      Graphic,
      ecologyLayerRef,
      symbolCacheRef
    );
    return;
  }

  // Очищаем слой только если данные действительно изменились
  ecologyLayerRef.current?.removeAll();

  const graphics: __esri.Graphic[] = [];

  // Оптимизированная обработка - используем Web Worker если возможно
  try {
    // Обрабатываем полигоны пакетами для лучшей производительности
    const processBatch = async (features: any[], startIndex: number) => {
      const batchGraphics: __esri.Graphic[] = [];

      for (let i = 0; i < features.length; i++) {
        const feature = features[i];
        if (!feature.geometry || !feature.geometry.coordinates) continue;

        try {
          const polygonType = feature.properties?.tur ?? feature.properties?.type ?? null;
          const polygon = createPolygonFromFeature(feature, Polygon, SpatialReference);

          if (!polygon) continue;

          const graphic = new Graphic({
            geometry: polygon,
            attributes: {
              __ecology: true,
              properties: feature.properties
            },
            symbol: createDefaultMockSymbol(currentZoom, symbolCacheRef.current, polygonType)
          });

          batchGraphics.push(graphic);
        } catch (error) {
          console.warn('Error processing polygon:', error);
          // Continue to next feature
        }
      }

      return batchGraphics;
    };

    // Разбиваем на батчи по 100 полигонов для параллельной обработки
    const BATCH_SIZE = 100;
    const batches = [];
    for (let i = 0; i < polygonsData.features.length; i += BATCH_SIZE) {
      batches.push(polygonsData.features.slice(i, i + BATCH_SIZE));
    }

    // Обрабатываем все батчи параллельно
    const batchPromises = batches.map((batch, index) =>
      processBatch(batch, index * BATCH_SIZE)
    );

    const batchResults = await Promise.all(batchPromises);

    // Собираем все graphics
    for (const batchGraphics of batchResults) {
      graphics.push(...batchGraphics);
    }

  } catch (error) {
    console.error('Error in batch processing:', error);
    // Fallback to synchronous processing
    for (const feature of polygonsData.features) {
      if (!feature.geometry || !feature.geometry.coordinates) continue;

      try {
        const polygonType = feature.properties?.tur ?? feature.properties?.type ?? null;
        const polygon = createPolygonFromFeature(feature, Polygon, SpatialReference);

        if (!polygon) continue;

        const graphic = new Graphic({
          geometry: polygon,
          attributes: {
            __ecology: true,
            properties: feature.properties
          },
          symbol: createDefaultMockSymbol(currentZoom, symbolCacheRef.current, polygonType)
        });

        graphics.push(graphic);
      } catch {
        // Continue to next feature
      }
    }
  }

  // Кешируем результат
  if (graphics.length > 0) {
    polygonsCache.set(cacheKey, {
      graphics: graphics.slice(), // Копируем массив
      timestamp: Date.now(),
      featureCount: polygonsData.features.length
    });

    // Очищаем старый кеш (оставляем только последние 5 записей)
    if (polygonsCache.size > 5) {
      const oldestKey = polygonsCache.keys().next().value;
      polygonsCache.delete(oldestKey);
    }
  }

  // Добавляем graphics мгновенно для лучшей производительности
  if (graphics.length > 0 && ecologyLayerRef.current) {
    // Для лучшей производительности добавляем все сразу
    ecologyLayerRef.current.addMany(graphics);
  }
};

// Специальная функция для обработки больших данных Viloyat.json
// Оптимизирована для мгновенного отображения без задержек
const processRegionPolygons = async (
  features: any[],
  currentZoom: number,
  cacheKey: string,
  getIsCancelled: () => boolean,
  onComplete?: () => void,
  Polygon: typeof __esri.Polygon,
  SpatialReference: typeof __esri.SpatialReference,
  Graphic: typeof __esri.Graphic,
  ecologyLayerRef: RefObject<__esri.GraphicsLayer | null>,
  symbolCacheRef: RefObject<Map<string, any>>
) => {
  // Очищаем слой
  ecologyLayerRef.current?.removeAll();

  // Увеличиваем размер батча для более быстрой обработки и лучшей производительности
  const BATCH_SIZE = 200; // Увеличен размер батча для лучшей производительности
  const graphics: __esri.Graphic[] = [];

  // Обрабатываем все полигоны батчами с оптимизацией
  for (let i = 0; i < features.length; i += BATCH_SIZE) {
    // Проверяем отмену обработки
    if (getIsCancelled()) {
      return;
    }

    const batch = features.slice(i, Math.min(i + BATCH_SIZE, features.length));

    // Обрабатываем батч синхронно для скорости
    for (const feature of batch) {
      if (getIsCancelled()) {
        return;
      }

      if (feature.geometry && feature.geometry.coordinates) {
        try {
          const polygonType = feature.properties?.tur ?? feature.properties?.type ?? null;
          const polygon = createPolygonFromFeature(feature, Polygon, SpatialReference);

          if (polygon) {
            const graphic = new Graphic({
              geometry: polygon,
              attributes: {
                __ecology: true,
                properties: feature.properties
              },
              symbol: createDefaultMockSymbol(currentZoom, symbolCacheRef.current, polygonType)
            });

            graphics.push(graphic);
          }
        } catch (error) {
          // Пропускаем проблемные полигоны
        }
      }
    }

    // Добавляем батч на карту сразу после обработки
    if (graphics.length > 0 && ecologyLayerRef.current) {
      ecologyLayerRef.current.addMany(graphics);
      graphics.length = 0; // Очищаем массив для следующего батча
    }

    // Используем requestAnimationFrame только между батчами для предотвращения блокировки UI
    // Увеличена частота обновления для лучшей производительности
    if (i + BATCH_SIZE < features.length) {
      await new Promise(resolve => {
        // Используем двойной requestAnimationFrame для лучшей производительности
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });
    }
  }

  // Сохраняем в кеш после завершения
  if (!getIsCancelled() && ecologyLayerRef.current) {
    const allGraphics = ecologyLayerRef.current?.graphics?.toArray() || [];
    polygonsCache.set(cacheKey, {
      graphics: allGraphics,
      timestamp: Date.now(),
      featureCount: features.length
    });
    onComplete?.();
  }
};


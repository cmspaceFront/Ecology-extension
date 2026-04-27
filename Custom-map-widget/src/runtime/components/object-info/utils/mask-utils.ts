// Утилиты для работы с масками карты - ОПТИМИЗИРОВАННАЯ ВЕРСИЯ

import { MAP_EXTENT } from '../constants';

// Web Mercator extent для маски (примерно соответствует MAP_EXTENT в WGS84)
const WEB_MERCATOR_EXTENT = {
  xmin: 556597,    // ~5° долготы
  xmax: 13914936,  // ~125° долготы
  ymin: 1565430,   // ~14° широты
  ymax: 10644926   // ~69° широты
};

// Кеш для геометрии маски
const maskGeometryCache = new Map<string, __esri.Polygon>();

// Создаем ключ кеша на основе extent полигона
const getCacheKey = (polygon: __esri.Polygon): string => {
  const extent = polygon.extent;
  if (!extent) return '';
  return `${extent.xmin.toFixed(2)}_${extent.ymin.toFixed(2)}_${extent.xmax.toFixed(2)}_${extent.ymax.toFixed(2)}`;
};

// Оптимизированное создание world polygon на основе видимого extent
// Использует полный world extent для гарантии покрытия всей области при зум-ауте
const createOptimizedWorldPolygon = (
  viewExtent: __esri.Extent | null,
  regionPolygon: __esri.Polygon,
  Polygon: typeof __esri.Polygon,
  SpatialReference: typeof __esri.SpatialReference
): __esri.Polygon => {
  const regionWkid = regionPolygon.spatialReference?.wkid;
  const isWebMercator = regionWkid === 3857 || 
                        regionWkid === 102100 ||
                        regionWkid === 900913;
  
  // Всегда используем Web Mercator для world polygon, так как regionPolygon должен быть уже конвертирован
  const targetSpatialRef = new SpatialReference({ wkid: 3857 });

  // Всегда используем полный world extent для гарантии покрытия всей области
  // Это особенно важно при зум-ауте, когда видимая область может быть большой
  // Используем полный extent для Узбекистана и окружающих регионов
  return new Polygon({
    rings: [[
      [WEB_MERCATOR_EXTENT.xmin, WEB_MERCATOR_EXTENT.ymin],
      [WEB_MERCATOR_EXTENT.xmax, WEB_MERCATOR_EXTENT.ymin],
      [WEB_MERCATOR_EXTENT.xmax, WEB_MERCATOR_EXTENT.ymax],
      [WEB_MERCATOR_EXTENT.xmin, WEB_MERCATOR_EXTENT.ymax],
      [WEB_MERCATOR_EXTENT.xmin, WEB_MERCATOR_EXTENT.ymin]
    ]],
    spatialReference: targetSpatialRef
  });
};

export const createMaskGeometry = (
  regionPolygon: __esri.Polygon,
  Polygon: typeof __esri.Polygon,
  SpatialReference: typeof __esri.SpatialReference,
  geometryEngine: typeof __esri.geometryEngine,
  viewExtent?: __esri.Extent | null
): __esri.Polygon | null => {
  try {
    // Проверяем кеш
    const cacheKey = getCacheKey(regionPolygon);
    if (cacheKey && maskGeometryCache.has(cacheKey)) {
      const cached = maskGeometryCache.get(cacheKey)!;
      // Проверяем что кешированная геометрия все еще валидна
      if (cached && cached.extent) {
        return cached;
      }
    }

    // Убеждаемся, что regionPolygon в Web Mercator для корректной работы difference
    // Полигон должен быть уже конвертирован в Web Mercator перед вызовом этой функции
    let regionPolygonForMask = regionPolygon;
    const regionWkid = regionPolygon.spatialReference?.wkid;
    const isWebMercator = regionWkid === 3857 || regionWkid === 102100 || regionWkid === 900913;
    
    // Если полигон не в Web Mercator, это ошибка - он должен быть конвертирован заранее
    if (!isWebMercator) {
      console.warn('[Custom-map-widget] Region polygon is not in Web Mercator, wkid:', regionWkid);
    }

    // Создаем оптимизированный world polygon
    const worldPolygon = createOptimizedWorldPolygon(
      viewExtent || null,
      regionPolygonForMask,
      Polygon,
      SpatialReference
    );

    // Выполняем difference операцию
    const maskGeometry = geometryEngine.difference(worldPolygon, regionPolygonForMask) as __esri.Polygon | null;
    
    if (maskGeometry && cacheKey) {
      // Кешируем результат (ограничиваем размер кеша)
      if (maskGeometryCache.size > 5) {
        const firstKey = maskGeometryCache.keys().next().value;
        maskGeometryCache.delete(firstKey);
      }
      maskGeometryCache.set(cacheKey, maskGeometry);
    }
    
    return maskGeometry;
  } catch (error) {
    // В случае ошибки возвращаем null
    return null;
  }
};

// Очистка кеша
export const clearMaskCache = (): void => {
  maskGeometryCache.clear();
};

export const createMaskGraphic = (
  maskGeometry: __esri.Polygon,
  Graphic: typeof __esri.Graphic
): __esri.Graphic => {
  return new Graphic({
    geometry: maskGeometry,
    symbol: {
      type: 'simple-fill',
      color: [6, 10, 24, 0.72],
      outline: {
        color: [0, 0, 0, 0],
        width: 0
      }
    } as any
  });
};

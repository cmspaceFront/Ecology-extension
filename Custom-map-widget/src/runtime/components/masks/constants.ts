/**
 * Общие константы и кэши для масок карты
 */

/**
 * Web Mercator extent для маски (примерно соответствует Узбекистану и окружающим регионам)
 */
export const WEB_MERCATOR_EXTENT = {
  xmin: 556597,    // ~5° долготы
  xmax: 13914936,  // ~125° долготы
  ymin: 1565430,   // ~14° широты
  ymax: 10644926   // ~69° широты
};

/**
 * Кэш для геометрий границы (Border)
 */
export const borderGeometryCache = new Map<string, { geometry: __esri.Polygon; timestamp: number }>();
export const BORDER_CACHE_DURATION = 5 * 60 * 1000; // 5 минут

/**
 * Кэш для геометрий регионов/районов
 */
export const regionGeometryCache = new Map<string, { geometry: __esri.Polygon; timestamp: number }>();
export const REGION_CACHE_DURATION = 10 * 60 * 1000; // 10 минут

/**
 * URL FeatureServer для границы
 */
export const BORDER_FEATURE_SERVER_URL = 'https://sgm.uzspace.uz/server/rest/services/Border/FeatureServer/0';

/**
 * URL FeatureServer для регионов
 */
export const REGION_FEATURE_SERVER_URL =
  'https://sgm.uzspace.uz/server/rest/services/Hosted/REgion/FeatureServer';

/**
 * URL FeatureServer для районов
 */
export const DISTRICT_FEATURE_SERVER_URL =
  'https://sgm.uzspace.uz/server/rest/services/Hosted/Districts/FeatureServer';

/** Линия границы Узбекистана (без заливки в виджете) */
export const UZBEKISTAN_BORDER_FEATURE_SERVER_URL =
  'https://sgm.uzspace.uz/server/rest/services/Hosted/Border_uzb/FeatureServer';

/** Буфер под мягкое размытие */
export const UZBEKISTAN_BORDER_BUFFER_FEATURE_SERVER_URL =
  'https://sgm.uzspace.uz/server/rest/services/Hosted/Border_buffer/FeatureServer';






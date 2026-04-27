import { GeometryModules } from '../types';
import { deriveRegionAndDistrict } from './region-utils';
import { loadUzbekistanRegionsGeoJSON } from './data-loader';
import { convertUTMToWebMercator } from './coordinate-converter';
import { createPolygonFromFeature } from '../../utils/geometry-utils';
import { findRegionFeature, findDistrictFeature } from '../../utils/feature-utils';

export const findAndCreateRegionPolygon = async (
  geometryModules: GeometryModules,
  geoJSONData: any | null,
  districtGeoJSON: any | null
): Promise<__esri.Polygon | null> => {
  const { Polygon, SpatialReference, geometryEngine, webMercatorUtils } = geometryModules;
  const selectedSoato = localStorage.getItem('selectedSoato');
  
  const { region: derivedRegion, district: derivedDistrict } = deriveRegionAndDistrict(selectedSoato);
  const selectedDistrictId = derivedDistrict;
  
  // Приоритетно отображаем выбранный район из Tuman.json
  if (selectedDistrictId && districtGeoJSON?.features?.length) {
    const districtFeature = findDistrictFeature(districtGeoJSON, selectedDistrictId);
    if (districtFeature) {
      const districtPolygon = createPolygonFromFeature(
        districtFeature,
        Polygon,
        SpatialReference,
        webMercatorUtils
      );
      if (districtPolygon) {
        return districtPolygon;
      }
    }
  }
  
  // Если нет selectedSoato, используем uzbekistan_regions_backup.json для маски всей республики
  if (!selectedSoato || selectedSoato === 'all' || derivedRegion === 'all') {
    try {
      // Загружаем uzbekistan_regions_backup.json
      const uzbekistanData = await loadUzbekistanRegionsGeoJSON();
      
      if (uzbekistanData && uzbekistanData.features && uzbekistanData.features.length > 0) {
        // Создаем полигоны из всех features
        const polygons: __esri.Polygon[] = [];
        
        for (const feat of uzbekistanData.features) {
          if (feat?.geometry) {
            const polygon = createPolygonFromFeature(
              feat,
              Polygon,
              SpatialReference,
              webMercatorUtils
            );
            if (polygon) {
              polygons.push(polygon);
            }
          }
        }
        
        if (polygons.length === 0) {
          return null;
        }
        
        // Конвертируем полигоны из UTM в Web Mercator если нужно
        const convertedPolygons: __esri.Polygon[] = [];
        for (const poly of polygons) {
          const polyWkid = poly.spatialReference?.wkid;
          if (polyWkid === 32642) {
            const converted = await convertUTMToWebMercator(poly, geometryModules);
            if (converted) {
              convertedPolygons.push(converted);
            }
          } else {
            convertedPolygons.push(poly);
          }
        }
        
        if (convertedPolygons.length === 0) {
          return null;
        }
        
        // Оптимизированное объединение: объединяем батчами по 5 полигонов
        if (convertedPolygons.length === 1) {
          return convertedPolygons[0];
        }
        
        // Объединяем батчами для лучшей производительности
        const BATCH_SIZE = 5;
        let unionResult = convertedPolygons[0];
        
        for (let i = 1; i < convertedPolygons.length; i += BATCH_SIZE) {
          const batch = [unionResult, ...convertedPolygons.slice(i, i + BATCH_SIZE)];
          try {
            unionResult = geometryEngine.union(batch) as __esri.Polygon;
            if (!unionResult || !unionResult.rings || unionResult.rings.length === 0) {
              break;
            }
          } catch (error) {
            console.warn(`[Custom-map-widget] Error union batch starting at ${i}:`, error);
            break;
          }
        }
        
        if (unionResult && unionResult.rings && unionResult.rings.length > 0) {
          return unionResult;
        }
        
        // Fallback: возвращаем первый полигон если union не удался
        return convertedPolygons[0];
      }
    } catch (error) {
      console.warn('[Custom-map-widget] Error loading uzbekistan_regions_backup.json:', error);
    }
    
    return null;
  } else {
    // Если есть selectedSoato, ищем регион в geoJSONData
    const feature = findRegionFeature(geoJSONData, derivedRegion);
    if (feature) {
      return createPolygonFromFeature(feature, Polygon, SpatialReference);
    }
  }

  return null;
};










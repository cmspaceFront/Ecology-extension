import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { GeometryModules } from '../types';

// Функция для конвертации координат из UTM в Web Mercator
export const convertUTMToWebMercator = async (
  polygon: __esri.Polygon,
  geometryModules: GeometryModules
): Promise<__esri.Polygon | null> => {
  try {
    if (!polygon || !polygon.rings || polygon.rings.length === 0) {
      return null;
    }
    
    const sourceWkid = polygon.spatialReference?.wkid;
    if (!sourceWkid || sourceWkid === 3857 || sourceWkid === 102100) {
      // Уже в Web Mercator
      return polygon;
    }
    
    // Загружаем GeometryService для конвертации
    const [GeometryService] = await loadArcGISJSAPIModules(['esri/tasks/GeometryService']);
    const gs = new GeometryService('https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer');
    
    // Конвертируем полигон
    const targetSR = new geometryModules.SpatialReference({ wkid: 3857 });
    const result = await gs.project([polygon], targetSR);
    
    if (result && result.length > 0) {
      const convertedPolygon = result[0] as __esri.Polygon;
      
      // Проверяем, что конвертация прошла успешно
      const extent = convertedPolygon.extent;
      if (extent) {
        // Проверяем, что координаты в разумных пределах для Узбекистана
        const isUzbekistanExtent = extent.xmin > 5000000 && extent.xmax < 9000000 && 
                                   extent.ymin > 4000000 && extent.ymax < 6000000;
        
        if (!isUzbekistanExtent) {
          // Возможно координаты перепутаны местами, пробуем поменять их
          console.warn('[Custom-map-widget] Converted coordinates seem incorrect, trying to swap x/y');
          
          // Создаем новый полигон с поменянными местами координатами
          const swappedRings: number[][][] = polygon.rings.map(ring =>
            ring.map(coord => [coord[1], coord[0]]) // Меняем местами x и y
          );
          
          const swappedPolygon = new geometryModules.Polygon({
            rings: swappedRings,
            spatialReference: polygon.spatialReference
          });
          
          // Пробуем конвертировать снова
          const swappedResult = await gs.project([swappedPolygon], targetSR);
          if (swappedResult && swappedResult.length > 0) {
            const swappedConverted = swappedResult[0] as __esri.Polygon;
            const swappedExtent = swappedConverted.extent;
            if (swappedExtent) {
              const isCorrectExtent = swappedExtent.xmin > 5000000 && swappedExtent.xmax < 9000000 && 
                                     swappedExtent.ymin > 4000000 && swappedExtent.ymax < 6000000;
              if (isCorrectExtent) {
                return swappedConverted;
              }
            }
          }
        }
      }
      
      return convertedPolygon;
    }
    
    return null;
  } catch (error) {
    console.warn('[Custom-map-widget] Error converting UTM to Web Mercator:', error);
    return null;
  }
};










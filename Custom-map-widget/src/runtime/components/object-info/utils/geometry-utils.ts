// Утилиты для работы с геометрией

export const convertRingsFromWebMercatorToWGS84 = (
  rings: number[][][],
  webMercatorUtils: typeof __esri.webMercatorUtils
): number[][][] => {
  return rings.map(ring =>
    ring.map(coord => {
      const [x, y] = coord;
      const [lon, lat] = webMercatorUtils.xyToLngLat(x, y);
      return [lon, lat];
    })
  );
};

export const createPolygonFromFeature = (
  feature: any,
  Polygon: typeof __esri.Polygon,
  SpatialReference: typeof __esri.SpatialReference,
  webMercatorUtils?: typeof __esri.webMercatorUtils
): __esri.Polygon | null => {
  if (!feature?.geometry) {
    return null;
  }

  // Поддержка ArcGIS JSON формата (Tuman.json, Viloyat.json) - geometry.rings напрямую без type
  if (feature.geometry.rings && !feature.geometry.type) {
    try {
      // Определяем spatial reference из feature или используем дефолтный
      const sourceWkid = feature.geometry.spatialReference?.wkid || 
                        (feature.attributes?.spatialReference?.wkid) ||
                        3857; // Web Mercator по умолчанию для Tuman.json
      
      // Для UTM Zone 42N (32642) координаты должны быть в формате [easting, northing] (x, y)
      // где x - восток (easting), y - север (northing)
      // Но если координаты перепутаны, нужно их поменять местами
      let rings = feature.geometry.rings;
      
      // Если это UTM 32642, координаты могут быть перепутаны местами
      // В UTM координаты должны быть [easting, northing] (x, y)
      // Но в Viloyat.json они могут быть [northing, easting] (y, x)
      // Для Узбекистана в UTM Zone 42N:
      // - Easting (x) должно быть примерно 200000-900000 (метры от центра зоны)
      // - Northing (y) должно быть примерно 4000000-5000000 (метры от экватора)
      if (sourceWkid === 32642) {
        // Проверяем первую координату
        const firstCoord = rings[0]?.[0];
        if (firstCoord && firstCoord.length >= 2) {
          const [first, second] = firstCoord;
          // Если первое значение > 4M (это northing), а второе < 1M (это easting),
          // значит координаты в формате [northing, easting] и нужно поменять местами
          if (first > 4000000 && second < 1000000) {
            // Координаты перепутаны, меняем местами
            console.warn('[Custom-map-widget] UTM coordinates appear swapped (northing/easting), correcting to easting/northing');
            rings = rings.map(ring =>
              ring.map(coord => [coord[1], coord[0]]) // Меняем местами: [northing, easting] -> [easting, northing]
            );
          } else {
            // Даже если координаты выглядят правильно, для Viloyat.json они могут быть перепутаны
            // Пробуем поменять местами для всех UTM 32642 из Viloyat.json
            console.warn('[Custom-map-widget] UTM 32642 coordinates - trying swapped order for Viloyat.json');
            rings = rings.map(ring =>
              ring.map(coord => [coord[1], coord[0]]) // Меняем местами: [x, y] -> [y, x]
            );
          }
        }
      }
      
      // Создаем полигон с исходной spatial reference
      const sourcePolygon = new Polygon({
        rings: rings,
        spatialReference: new SpatialReference({ wkid: sourceWkid })
      });
      
      return sourcePolygon;
    } catch {
      return null;
    }
  }

  const coordinates = feature.geometry.coordinates;

  if (feature.geometry.type === 'Polygon') {
    const rings = coordinates as number[][][];
    if (rings.length === 0) {
      return null;
    }

    // Если это Web Mercator координаты (из districtGeoJSON), конвертируем
    if (feature.geometry.rings && webMercatorUtils) {
      try {
        const convertedRings = convertRingsFromWebMercatorToWGS84(
          feature.geometry.rings,
          webMercatorUtils
        );
        return new Polygon({
          rings: convertedRings,
          spatialReference: SpatialReference.WGS84
        });
      } catch {
        return null;
      }
    }

    return new Polygon({
      rings: rings,
      spatialReference: SpatialReference.WGS84
    });
  } else if (feature.geometry.type === 'MultiPolygon') {
    const multiCoords = coordinates as number[][][][];
    const allRings: number[][][] = [];
    
    for (const polygonRings of multiCoords) {
      if (polygonRings && polygonRings.length > 0) {
        allRings.push(...polygonRings);
      }
    }
    
    if (allRings.length === 0) {
      return null;
    }
    
    return new Polygon({
      rings: allRings,
      spatialReference: SpatialReference.WGS84
    });
  }

  return null;
};

export const createPolygonFromAllFeatures = (
  features: any[],
  Polygon: typeof __esri.Polygon,
  SpatialReference: typeof __esri.SpatialReference,
  geometryEngine: typeof __esri.geometryEngine
): __esri.Polygon | null => {
  const polygons: __esri.Polygon[] = [];
  
  for (const feat of features) {
    if (!feat.geometry) continue;
    
    const coordinates = feat.geometry.coordinates;
    
    if (feat.geometry.type === 'Polygon') {
      const rings = coordinates as number[][][];
      if (rings.length > 0) {
        try {
          const poly = new Polygon({
            rings: rings,
            spatialReference: SpatialReference.WGS84
          });
          polygons.push(poly);
        } catch {
          // Continue to next feature
        }
      }
    } else if (feat.geometry.type === 'MultiPolygon') {
      const multiCoords = coordinates as number[][][][];
      for (const polygonRings of multiCoords) {
        if (polygonRings && polygonRings.length > 0) {
          try {
            const poly = new Polygon({
              rings: polygonRings,
              spatialReference: SpatialReference.WGS84
            });
            polygons.push(poly);
          } catch {
            // Continue to next ring
          }
        }
      }
    }
  }
  
  if (polygons.length > 0) {
    return geometryEngine.union(polygons) as __esri.Polygon;
  }
  
  return null;
};

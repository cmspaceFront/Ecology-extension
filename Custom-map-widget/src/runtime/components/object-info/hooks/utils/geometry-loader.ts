import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { GeometryModules } from '../types';

let cachedGeometryModules: GeometryModules | null = null;

export const loadGeometryModules = async (): Promise<GeometryModules> => {
  if (cachedGeometryModules) {
    return cachedGeometryModules;
  }
  
  const [
    geometryEngine,
    Polygon,
    SpatialReference,
    Graphic,
    webMercatorUtils,
  ] = await loadArcGISJSAPIModules([
    'esri/geometry/geometryEngine',
    'esri/geometry/Polygon',
    'esri/geometry/SpatialReference',
    'esri/Graphic',
    'esri/geometry/support/webMercatorUtils',
  ]);
  
  cachedGeometryModules = { geometryEngine, Polygon, SpatialReference, Graphic, webMercatorUtils };
  return cachedGeometryModules;
};










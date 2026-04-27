// Кеш для uzbekistan_regions_backup.json
let cachedUzbekistanRegionsGeoJSON: any = null;
let uzbekistanRegionsLoadPromise: Promise<any> | null = null;

// Асинхронная загрузка uzbekistan_regions_backup.json
export const loadUzbekistanRegionsGeoJSON = async (): Promise<any> => {
  if (cachedUzbekistanRegionsGeoJSON) {
    return cachedUzbekistanRegionsGeoJSON;
  }
  
  if (uzbekistanRegionsLoadPromise) {
    return uzbekistanRegionsLoadPromise;
  }
  
  uzbekistanRegionsLoadPromise = import('../../../../uzbekistan_regions_backup.json').then(module => {
    cachedUzbekistanRegionsGeoJSON = module.default;
    return cachedUzbekistanRegionsGeoJSON;
  }).catch(() => null);
  
  return uzbekistanRegionsLoadPromise;
};










// Утилиты для поиска features в GeoJSON

export const findDistrictFeature = (
  districtGeoJSON: any,
  selectedDistrictId: string
): any => {
  if (!districtGeoJSON?.features?.length || !selectedDistrictId) {
    return null;
  }

  // Поддержка Tuman.json с полем "code" (7-значный SOATO)
  return districtGeoJSON.features.find((f: any) => {
    const attrs = f.attributes || f.properties || {};
    const districtCode = `${attrs.district ?? ''}`;
    const soatoCode = `${attrs.soato ?? ''}`;
    const code = `${attrs.code ?? ''}`;
    
    return districtCode === selectedDistrictId || 
           soatoCode === selectedDistrictId || 
           code === selectedDistrictId;
  });
};

export const findRegionFeature = (
  geoJSONData: any,
  selectedRegion: string
): any => {
  if (!geoJSONData?.features || !selectedRegion || selectedRegion === 'all') {
    return null;
  }

  const normalizedSelectedRegion = String(selectedRegion);
  
  // Поддержка Viloyat.json с полем "parent_cod" (4-значный SOATO региона)
  return geoJSONData.features.find((f: any) => {
    const attrs = f.attributes || f.properties || {};
    const parentCod = `${attrs.parent_cod ?? ''}`;
    const regionSoato = `${attrs.region_soato ?? ''}`;
    
    return parentCod === normalizedSelectedRegion || regionSoato === normalizedSelectedRegion;
  });
};

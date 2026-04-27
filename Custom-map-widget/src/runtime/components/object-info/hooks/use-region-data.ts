import { useCallback, useEffect, useState, useRef } from 'react';
import { WIDGET_NAME } from '../constants';
import { useFilters, FiltersState } from './use-filters';

// Ленивая загрузка - не импортируем JSON напрямую
let cachedViloyatGeoJSON: any = null;
let cachedTumanGeoJSON: any = null;
let viloyatLoadPromise: Promise<any> | null = null;
let tumanLoadPromise: Promise<any> | null = null;

interface UseRegionDataResult {
  geoJSONData: any | null;
  selectedRegion: string;
  setSelectedRegion: (value: string) => void;
  districtGeoJSON: any | null;
  selectedDistrict: string | null;
  setSelectedDistrict: (value: string | null) => void;
  selectionRevision: number;
}

// Функция для вычисления region и district из selectedSoato
const deriveRegionAndDistrict = (selectedSoato: string | null): { region: string; district: string | null } => {
  if (!selectedSoato || selectedSoato === 'all') {
    return { region: 'all', district: null };
  }
  
  const soatoLength = selectedSoato.length;
  
  if (soatoLength === 4) {
    return { region: selectedSoato, district: null };
  } else if (soatoLength === 7) {
    return { region: selectedSoato.substring(0, 4), district: selectedSoato };
  } else if (soatoLength === 10) {
    return { region: selectedSoato.substring(0, 4), district: selectedSoato.substring(0, 7) };
  }
  
  return { region: selectedSoato, district: null };
};

// Асинхронная загрузка Viloyat.json
const loadViloyatGeoJSON = async (): Promise<any> => {
  if (cachedViloyatGeoJSON) {
    return cachedViloyatGeoJSON;
  }
  
  if (viloyatLoadPromise) {
    return viloyatLoadPromise;
  }
  
  viloyatLoadPromise = import('../../../Viloyat.json').then(module => {
    cachedViloyatGeoJSON = module.default;
    return cachedViloyatGeoJSON;
  }).catch(() => null);
  
  return viloyatLoadPromise;
};

// Асинхронная загрузка Tuman.json
const loadTumanGeoJSON = async (): Promise<any> => {
  if (cachedTumanGeoJSON) {
    return cachedTumanGeoJSON;
  }
  
  if (tumanLoadPromise) {
    return tumanLoadPromise;
  }
  
  tumanLoadPromise = import('../../../Tuman.json').then(module => {
    cachedTumanGeoJSON = module.default;
    return cachedTumanGeoJSON;
  }).catch(() => null);
  
  return tumanLoadPromise;
};


export const useRegionData = (assetBasePath?: string): UseRegionDataResult => {
  const { filters, filtersRevision } = useFilters();

  // Вычисляем начальные значения из selectedSoato
  const { region: initialRegion, district: initialDistrict } = deriveRegionAndDistrict(filters.selectedSoato);

  // Всегда используем Viloyat.json (для всех регионов или конкретного региона)
  const [geoJSONData, setGeoJSONData] = useState<any | null>(cachedViloyatGeoJSON);

  const [selectedRegion, setSelectedRegion] = useState<string>(initialRegion);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(initialDistrict);
  const [districtGeoJSON, setDistrictGeoJSON] = useState<any | null>(
    cachedTumanGeoJSON && initialDistrict ? cachedTumanGeoJSON : null
  );
  const [selectionRevision, setSelectionRevision] = useState(0);

  // Refs для отслеживания предыдущих значений
  const prevSoatoRef = useRef<string | null>(filters.selectedSoato);

  // Всегда загружаем Viloyat.json (используется для всех регионов или конкретного региона)
  useEffect(() => {
    if (!geoJSONData && !viloyatLoadPromise) {
      loadViloyatGeoJSON().then(data => {
        if (data) {
          setGeoJSONData(data);
        }
      });
    }
  }, [filters.selectedSoato]);

  // Загружаем Tuman.json когда нужен район
  useEffect(() => {
    if (selectedDistrict && !districtGeoJSON) {
      loadTumanGeoJSON().then(data => {
        if (data) {
          setDistrictGeoJSON(data);
        }
      });
    }
  }, [selectedDistrict, districtGeoJSON]);

  // Обработка изменений фильтров через useFilters
  useEffect(() => {
    const { region, district } = deriveRegionAndDistrict(filters.selectedSoato);

    // Всегда используем Viloyat.json - загружаем если еще не загружен
    if (!geoJSONData && !viloyatLoadPromise) {
      loadViloyatGeoJSON().then(data => {
        if (data) {
          setGeoJSONData(data);
        }
      });
    }

    if (region !== selectedRegion) {
      setSelectedRegion(region);
      setSelectionRevision(r => r + 1);
    }

    if (district !== selectedDistrict) {
      setSelectedDistrict(district);
      setSelectionRevision(r => r + 1);
    }
  }, [filters.selectedSoato, filtersRevision, geoJSONData, selectedRegion, selectedDistrict]);

  // Глобальные функции для внешнего управления (оставляем для совместимости)
  useEffect(() => {
    const handleRegionChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const normalizedDetail = detail ? String(detail) : 'all';
      setSelectedRegion(normalizedDetail);
    };

    const handleDistrictChange = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      setSelectedDistrict(detail || null);
    };

    window.addEventListener('custom-map-region-change', handleRegionChange);
    window.addEventListener('custom-map-district-change', handleDistrictChange);

    // Глобальные функции для внешнего управления
    (window as any).customMapSelectRegion = (soato: string | number) => {
      const normalizedSoato = soato ? String(soato) : 'all';
      window.dispatchEvent(new CustomEvent('custom-map-region-change', { detail: normalizedSoato }));
    };

    (window as any).customMapSelectDistrict = (districtId: string | null) => {
      window.dispatchEvent(new CustomEvent('custom-map-district-change', { detail: districtId }));
    };

    (window as any).customMapRemoveSoato = () => {
      localStorage.removeItem('selectedSoato');
      window.dispatchEvent(new CustomEvent('custom-map-soato-removed'));
    };

    (window as any).customMapRemoveDistrict = () => {
      localStorage.removeItem('selectedDistrict');
      window.dispatchEvent(new CustomEvent('custom-map-district-removed'));
    };

    return () => {
      window.removeEventListener('custom-map-region-change', handleRegionChange);
      window.removeEventListener('custom-map-district-change', handleDistrictChange);
    };
  }, []);

  // Функция для загрузки из сети (fallback)
  const loadRegionGeoJSON = useCallback(async () => {
    // Всегда загружаем Viloyat.json
    if (geoJSONData) return;

    const data = await loadViloyatGeoJSON();
    if (data) {
      setGeoJSONData(data);
      return;
    }

    // Fallback - загрузка по сети
    const origin = window.location.origin;
    const baseUrl = (window as any).jimuConfig?.baseUrl || '';
    const normalizedFolder = assetBasePath
      ? assetBasePath.endsWith('/') ? assetBasePath : `${assetBasePath}/`
      : '';

    const pathsToTry = [
      normalizedFolder ? `${normalizedFolder}dist/runtime/Viloyat.json` : null,
      normalizedFolder ? `${normalizedFolder}src/runtime/Viloyat.json` : null,
      `${origin}/widgets/${WIDGET_NAME}/dist/runtime/Viloyat.json`,
      `${baseUrl}/widgets/${WIDGET_NAME}/dist/runtime/Viloyat.json`,
    ].filter(Boolean) as string[];

    for (const path of pathsToTry) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const fetchedData = await response.json();
          if (fetchedData?.features?.length) {
            cachedViloyatGeoJSON = fetchedData;
            setGeoJSONData(fetchedData);
            return;
          }
        }
      } catch {
        // Continue to next path
      }
    }
  }, [assetBasePath, geoJSONData, filters.selectedSoato]);

  useEffect(() => {
    loadRegionGeoJSON();
  }, [loadRegionGeoJSON]);

  return {
    geoJSONData,
    selectedRegion,
    setSelectedRegion,
    districtGeoJSON,
    selectedDistrict,
    setSelectedDistrict,
    selectionRevision
  };
};

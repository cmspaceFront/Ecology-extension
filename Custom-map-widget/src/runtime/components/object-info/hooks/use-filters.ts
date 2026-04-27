import { useState, useEffect, useCallback, useRef } from 'react';

// Интерфейс для всех фильтров из localStorage
export interface FiltersState {
  selectedYear: string | null;
  selectedSoato: string | null;
  selectedDistrict: string | null;
  selectedTypeId: { id: number; name: string } | null;
  status: string | null;
  selectedId: string | null;
  customLocal: string | null;
  authToken: string | null;
}

interface UseFiltersResult {
  filters: FiltersState;
  filtersRevision: number;
  updateFilters: () => void;
}

// Функция для получения значения из localStorage с обработкой ошибок
const getStorageValue = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

// Функция для парсинга JSON из localStorage
const getParsedStorageValue = <T>(key: string): T | null => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const useFilters = (): UseFiltersResult => {
  // Инициализируем фильтры из localStorage
  const [filters, setFilters] = useState<FiltersState>(() => ({
    selectedYear: getStorageValue('selectedYear'),
    selectedSoato: getStorageValue('selectedSoato'),
    selectedDistrict: getStorageValue('selectedDistrict'),
    selectedTypeId: getParsedStorageValue('selectedTypeId'),
    status: getStorageValue('status'),
    selectedId: getStorageValue('selectedId'),
    customLocal: getStorageValue('customLocal'),
    authToken: getStorageValue('authToken') || getStorageValue('token'),
  }));

  const [filtersRevision, setFiltersRevision] = useState(0);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevFiltersRef = useRef<FiltersState>(filters);

  // Функция для обновления всех фильтров из localStorage
  const updateFilters = useCallback(() => {
    const newFilters: FiltersState = {
      selectedYear: getStorageValue('selectedYear'),
      selectedSoato: getStorageValue('selectedSoato'),
      selectedDistrict: getStorageValue('selectedDistrict'),
      selectedTypeId: getParsedStorageValue('selectedTypeId'),
      status: getStorageValue('status'),
      selectedId: getStorageValue('selectedId'),
      customLocal: getStorageValue('customLocal'),
      authToken: getStorageValue('authToken') || getStorageValue('token'),
    };

    // Проверяем, изменилось ли что-то
    const hasChanged = Object.keys(newFilters).some(key =>
      newFilters[key as keyof FiltersState] !== prevFiltersRef.current[key as keyof FiltersState]
    );

    if (hasChanged) {
      prevFiltersRef.current = newFilters;
      setFilters(newFilters);
      setFiltersRevision(prev => prev + 1);
    }
  }, []);

  // Слушаем изменения в localStorage
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Проверяем, относится ли изменение к нашим фильтрам
      const filterKeys = [
        'selectedYear', 'selectedSoato', 'selectedDistrict',
        'selectedTypeId', 'status', 'selectedId', 'customLocal',
        'authToken', 'token'
      ];

      if (filterKeys.includes(e.key || '')) {
        updateFilters();
      }
    };

    // Слушаем custom события от других виджетов
    const handleRegionChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      updateFilters();
    };

    const handleDistrictChange = (event: Event) => {
      updateFilters();
    };

    const handleTypeChange = (event: Event) => {
      updateFilters();
    };

    const handleStatusChange = (event: Event) => {
      updateFilters();
    };

    const handleIdChange = (event: Event) => {
      updateFilters();
    };

    // Добавляем слушатели
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('custom-map-region-change', handleRegionChange);
    window.addEventListener('custom-map-district-change', handleDistrictChange);
    window.addEventListener('custom-map-type-change', handleTypeChange);
    window.addEventListener('custom-map-status-change', handleStatusChange);
    window.addEventListener('custom-map-id-change', handleIdChange);

    // Оптимизированный polling - каждые 2000ms для уменьшения нагрузки на производительность
    pollIntervalRef.current = setInterval(updateFilters, 2000);

    // Очистка при размонтировании
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('custom-map-region-change', handleRegionChange);
      window.removeEventListener('custom-map-district-change', handleDistrictChange);
      window.removeEventListener('custom-map-type-change', handleTypeChange);
      window.removeEventListener('custom-map-status-change', handleStatusChange);
      window.removeEventListener('custom-map-id-change', handleIdChange);

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [updateFilters]);

  // Инициализация
  useEffect(() => {
    updateFilters();
  }, []);

  return {
    filters,
    filtersRevision,
    updateFilters,
  };
};

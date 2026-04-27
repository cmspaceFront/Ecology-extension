import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Функция для получения значения из LocalStorage
 */
const getStorageValue = (key: string): string | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export interface FiltersState {
  selectedYear: string | null;
  selectedSoato: string | null;
}

export interface UseFiltersResult {
  filters: FiltersState;
  updateFilters: () => void;
}

/**
 * Хук для работы с фильтрами из LocalStorage
 */
export const useFilters = (): UseFiltersResult => {
  // Инициализируем фильтры из localStorage
  const [filters, setFilters] = useState<FiltersState>(() => ({
    selectedYear: getStorageValue('selectedYear'),
    selectedSoato: getStorageValue('selectedSoato'),
  }));

  const prevFiltersRef = useRef<FiltersState>(filters);

  // Функция для обновления всех фильтров из localStorage
  const updateFilters = useCallback(() => {
    const newFilters: FiltersState = {
      selectedYear: getStorageValue('selectedYear'),
      selectedSoato: getStorageValue('selectedSoato'),
    };

    // Проверяем, изменилось ли что-то
    const hasChanged = Object.keys(newFilters).some(
      (key) =>
        newFilters[key as keyof FiltersState] !==
        prevFiltersRef.current[key as keyof FiltersState]
    );

    if (hasChanged) {
      prevFiltersRef.current = newFilters;
      setFilters(newFilters);
    }
  }, []);

  // Слушаем изменения в localStorage
  useEffect(() => {
    // Проверяем изменения периодически
    const interval = setInterval(updateFilters, 500);

    // Также слушаем событие storage (для изменений из других вкладок)
    window.addEventListener('storage', updateFilters);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', updateFilters);
    };
  }, [updateFilters]);

  return {
    filters,
    updateFilters,
  };
};


/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useFilters } from './hooks/useFilters';

/**
 * Хук для получения фильтра по году
 */
export const useYearFilter = (): string | null => {
  const { filters } = useFilters();
  
  if (!filters.selectedYear) {
    return null;
  }
  
  // Фильтруем по полю sana (год)
  // Поле может содержать "2024 йил" или просто "2024"
  const yearValue = filters.selectedYear.trim();
  
  // Используем LIKE для поиска года в строке (на случай если формат "2024 йил")
  return `sana LIKE '%${yearValue}%'`;
};


/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useFilters } from './hooks/useFilters';

/**
 * Функция для генерации CQL фильтра на основе selectedSoato
 */
export const generateSoatoFilter = (selectedSoato: string | null): string | null => {
  if (!selectedSoato || selectedSoato === 'all') {
    return null;
  }

  const soatoLength = selectedSoato.length;
  
  if (soatoLength === 4) {
    // Регион: используем id_region
    return `id_region='${selectedSoato}'`;
  } else if (soatoLength === 7) {
    // Район: используем id_district
    return `id_district='${selectedSoato}'`;
  } else if (soatoLength === 10) {
    // Махалля: используем id_mfy
    return `id_mfy='${selectedSoato}'`;
  }

  return null;
};

/**
 * Хук для получения фильтра по SOATO
 */
export const useSoatoFilter = (): string | null => {
  const { filters } = useFilters();
  const selectedSoato = (filters as any).selectedSoato;
  return generateSoatoFilter(selectedSoato);
};






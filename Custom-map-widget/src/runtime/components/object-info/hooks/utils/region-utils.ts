import { RegionAndDistrict } from '../types';

// Функция для вычисления region и district из selectedSoato
export const deriveRegionAndDistrict = (selectedSoato: string | null): RegionAndDistrict => {
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










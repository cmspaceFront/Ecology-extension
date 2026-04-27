import { useState, useCallback, useRef } from 'react';
import { FiltersState } from './use-filters';

const API_BASE_URL = 'https://api-test.spacemc.uz';

interface EcologyFeature {
  type: 'Feature';
  geometry: {
    type: 'MultiPolygon' | 'Polygon';
    coordinates: number[][][][] | number[][][];
  };
  properties: {
    gid: number;
    sana?: string;
    tur?: string;
    yer_toifa?: string;
    natija?: string;
    maydon?: number;
    district?: string;
    region?: number;
    mahalla_id?: number;
    tekshirish?: string | null;
    latitude?: string;
    longitude?: string;
    [key: string]: any;
  };
}

interface EcologyGeoJSON {
  type: 'FeatureCollection';
  features: EcologyFeature[];
}

// Функция для преобразования status в значение для API
const convertStatusToApiValue = (status: string | null): string | null => {
  if (!status) return null;

  // Если статус уже является узбекским названием, возвращаем как есть
  const uzbekStatuses = ['tasdiqlangan', 'tasdiqlanmagan', 'tekshirilgan', 'jarayonda'];
  if (uzbekStatuses.includes(status)) {
    return status;
  }

  // Для обратной совместимости - конвертация числовых значений
  const statusMap: { [key: string]: string } = {
    '1': 'tasdiqlangan',
    '2': 'tasdiqlanmagan',
    '3': 'tekshirilgan',
    '4': 'jarayonda'
  };

  return statusMap[status] || status;
};


export const useEcologyPolygons = () => {
  const [polygonsData, setPolygonsData] = useState<EcologyGeoJSON | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref для предотвращения дублированных запросов
  const lastRequestRef = useRef<string>('');

  const fetchPolygons = useCallback(async (filters: FiltersState, selectedSoato?: string) => {
    // Если selectedSoato удален, немедленно очищаем данные
    if (!selectedSoato) {
      setPolygonsData(null);
      setLoading(false);
      setError(null);
      lastRequestRef.current = '';
      return;
    }

    // Создаем ключ запроса для проверки дубликатов
    const requestKey = `${selectedSoato}-${filters.selectedYear || 'all'}-${filters.status || 'all'}-${filters.selectedTypeId?.id || 'all'}`;

    // Проверяем, не делаем ли мы дублированный запрос
    if (lastRequestRef.current === requestKey) {
      return;
    }

    lastRequestRef.current = requestKey;
    setLoading(true);
    setError(null);

    try {
      const url = new URL(`${API_BASE_URL}/api/ecology/geojson`);

      // Определяем тип запроса по длине selectedSoato
      // Загружаем полигоны для регионов, районов и махаллей
      if (selectedSoato) {
        const soatoLength = selectedSoato.length;

        if (soatoLength === 4) {
          url.searchParams.append('region', selectedSoato);
        } else if (soatoLength === 7) {
          url.searchParams.append('district', selectedSoato);
        } else if (soatoLength === 10) {
          url.searchParams.append('mahalla_id', selectedSoato);
        }
      }

      // Add year filter if exists
      if (filters.selectedYear) {
        url.searchParams.append('year', filters.selectedYear);
      }

      // Add status filter if exists
      if (filters.status) {
        const apiStatusValue = convertStatusToApiValue(filters.status);
        if (apiStatusValue) {
          url.searchParams.append('status', apiStatusValue);
        }
      }

      // Add type filter if exists (from category-statistics-chart)
      if (filters.selectedTypeId) {
        // Используем tur ID из selectedTypeId
        url.searchParams.append('tur', filters.selectedTypeId.id.toString());
      }


      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data: EcologyGeoJSON = await response.json();

      // Данные уже отфильтрованы на сервере по year и status
      setPolygonsData(data);
      // Не сбрасываем lastRequestRef при успехе, чтобы предотвратить повторные запросы
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch polygons';
      console.error('Error fetching polygons:', errorMessage);
      setError(errorMessage);
      setPolygonsData(null);
      // Сбрасываем ключ при ошибке, чтобы можно было повторить запрос
      lastRequestRef.current = '';
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    polygonsData,
    loading,
    error,
    fetchPolygons
  };
};

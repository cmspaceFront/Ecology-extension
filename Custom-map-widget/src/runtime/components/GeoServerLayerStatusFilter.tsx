/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useEffect, useState, useRef } from 'react';

/**
 * Хук для получения фильтра по статусу (tekshirish)
 * Читает status из localStorage и создает соответствующий CQL фильтр
 * 
 * Маппинг статусов:
 * - "tasdiqlangan" -> tekshirish = '1'
 * - "tasdiqlanmagan" -> tekshirish = '2'
 * - "tekshirilgan" -> tekshirish IN ('1', '2')
 * - "jarayonda" -> tekshirish IS NULL
 */
export const useStatusFilter = (): string | null => {
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const previousValueRef = useRef<string | null>(null);

  useEffect(() => {
    const getStatusFilter = () => {
      try {
        const status = localStorage.getItem('status');

        if (!status || status.trim() === '') {
          if (previousValueRef.current !== null) {
            previousValueRef.current = null;
            setStatusFilter(null);
          }
          return;
        }

        const statusLower = status.trim().toLowerCase();
        let filter: string | null = null;

        switch (statusLower) {
          case 'tasdiqlangan':
            // Тасдиқланган -> tekshirish = '1'
            filter = "tekshirish = '1'";
            break;
          
          case 'tasdiqlanmagan':
            // Тасдиқланмаган -> tekshirish = '2'
            filter = "tekshirish = '2'";
            break;
          
          case 'tekshirilgan':
            // Текширилган -> tekshirish IN ('1', '2')
            filter = "tekshirish IN ('1', '2')";
            break;
          
          case 'jarayonda':
            // Жараёнда -> tekshirish IS NULL или пустое
            // В CQL используем: tekshirish IS NULL OR tekshirish = ''
            filter = "(tekshirish IS NULL OR tekshirish = '')";
            break;
          
          default:
            filter = null;
            break;
        }

        // Обновляем только если значение изменилось
        if (previousValueRef.current !== filter) {
          previousValueRef.current = filter;
          setStatusFilter(filter);
        }
      } catch {
        if (previousValueRef.current !== null) {
          previousValueRef.current = null;
          setStatusFilter(null);
        }
      }
    };

    // Получаем фильтр при монтировании
    getStatusFilter();

    // Опрос каждые 500 мс: в одной вкладке событие storage не срабатывает при изменении localStorage
    const interval = setInterval(getStatusFilter, 500);

    // Слушаем изменения в localStorage (для изменений из других вкладок)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'status') {
        getStatusFilter();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Также слушаем события focus для синхронизации при возврате на вкладку
    const handleFocus = () => {
      getStatusFilter();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return statusFilter;
};



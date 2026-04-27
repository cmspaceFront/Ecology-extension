/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useEffect, useState, useRef } from 'react';

export type SelectedTypeEntry = { id?: number; id_tur?: string; name?: string };

/** Парсинг selectedTypeId: один объект или массив (мультивыбор из category-statistics-chart). */
export const parseSelectedTypeIdFromStorage = (raw: string | null): SelectedTypeEntry[] => {
  if (!raw || raw.trim() === '' || raw.trim() === '[]') return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => x && typeof x === 'object');
    if (parsed && typeof parsed === 'object') return [parsed];
    return [];
  } catch {
    return [];
  }
};

export const normalizeIdTurString = (idTur: string | undefined | null): string | null => {
  if (!idTur || typeof idTur !== 'string') return null;
  if (idTur === 'EDIT-4') return 'ETID-4';
  if (idTur === 'EDIT-5') return 'ETID-5';
  return idTur;
};

const entryToNormalizedIdTur = (e: SelectedTypeEntry): string | null => {
  const fromField = normalizeIdTurString(e.id_tur);
  if (fromField) return fromField;
  if (typeof e.id === 'number' && e.id >= 0 && e.id <= 4) return `ETID-${e.id + 1}`;
  return null;
};

/** Только слой ETID-5 (один или несколько одинаковых) — для снятия фильтра по статусу (CQL / FeatureServer). */
export const readSelectionIsExclusivelyEtid5 = (): boolean => {
  const entries = parseSelectedTypeIdFromStorage(
    typeof window !== 'undefined' ? localStorage.getItem('selectedTypeId') : null
  );
  if (entries.length === 0) return false;
  return entries.every((e) => entryToNormalizedIdTur(e) === 'ETID-5');
};

/**
 * Синхронное чтение первого нормализованного id_tur из selectedTypeId.
 * Для вызовов вне React (например GetFeatureInfo → geojson URL).
 */
export const readNormalizedSelectedIdTur = (): string | null => {
  const entries = parseSelectedTypeIdFromStorage(
    typeof window !== 'undefined' ? localStorage.getItem('selectedTypeId') : null
  );
  const first = entries[0];
  if (!first) return null;
  return entryToNormalizedIdTur(first);
};

/**
 * Хук для получения фильтра по id_tur (тип полигона)
 * Читает selectedTypeId из localStorage и извлекает id_tur
 */
export const useTurFilter = (): string | null => {
  const [turFilter, setTurFilter] = useState<string | null>(null);
  const previousValueRef = useRef<string | null>(null);

  useEffect(() => {
    const getTurFilter = () => {
      try {
        const entries = parseSelectedTypeIdFromStorage(localStorage.getItem('selectedTypeId'));
        const parts: string[] = [];
        for (const e of entries) {
          const n = entryToNormalizedIdTur(e);
          if (n) parts.push(`id_tur='${n}'`);
        }
        const deduped = [...new Set(parts)].sort();
        if (deduped.length === 0) {
          if (previousValueRef.current !== null) {
            previousValueRef.current = null;
            setTurFilter(null);
          }
          return;
        }

        const filter = deduped.length === 1 ? deduped[0] : `(${deduped.join(' OR ')})`;
        
        // Обновляем только если значение изменилось
        if (previousValueRef.current !== filter) {
          previousValueRef.current = filter;
          setTurFilter(filter);
        }
      } catch {
        // Если ошибка парсинга или нет данных, фильтр не применяется
        if (previousValueRef.current !== null) {
          previousValueRef.current = null;
          setTurFilter(null);
        }
      }
    };

    // Получаем фильтр при монтировании
    getTurFilter();

    // Опрос каждые 500 мс: в одной вкладке событие storage не срабатывает при изменении localStorage
    const interval = setInterval(getTurFilter, 500);

    // Слушаем изменения в localStorage (для изменений из других вкладок)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selectedTypeId') {
        getTurFilter();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    // Также слушаем события focus для синхронизации при возврате на вкладку
    const handleFocus = () => {
      getTurFilter();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  return turFilter;
};

/**
 * Нормализованный id_tur из selectedTypeId (ETID-1 …, с подстановкой EDIT-4/5 → ETID-4/5).
 * null — если тип не выбран или не распознан.
 */
export const useSelectedIdTur = (): string | null => {
  const [idTur, setIdTur] = useState<string | null>(null);
  const previousValueRef = useRef<string | null>(null);

  useEffect(() => {
    const read = () => {
      const raw = readNormalizedSelectedIdTur();
      if (raw === null) {
        if (previousValueRef.current !== null) {
          previousValueRef.current = null;
          setIdTur(null);
        }
        return;
      }
      if (previousValueRef.current !== raw) {
        previousValueRef.current = raw;
        setIdTur(raw);
      }
    };

    read();
    const interval = setInterval(read, 500);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedTypeId') read();
    };
    window.addEventListener('storage', onStorage);
    const onFocus = () => read();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return idTur;
};

/** Мультивыбор: true только если в selectedTypeId одни ETID-5 (как один объект, так и массив). */
export const useSelectionIsExclusivelyEtid5 = (): boolean => {
  const [v, setV] = useState(false);
  const previousValueRef = useRef<boolean | null>(null);

  useEffect(() => {
    const read = () => {
      const next = readSelectionIsExclusivelyEtid5();
      if (previousValueRef.current !== next) {
        previousValueRef.current = next;
        setV(next);
      }
    };
    read();
    const interval = setInterval(read, 500);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedTypeId') read();
    };
    window.addEventListener('storage', onStorage);
    const onFocus = () => read();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return v;
};


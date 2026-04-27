/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useMemo } from 'react';
import { useYearFilter } from './GeoServerLayerFilter';
import { useSoatoFilter } from './GeoServerLayerSoatoFilter';
import { useTurFilter, useSelectionIsExclusivelyEtid5 } from './GeoServerLayerTurFilter';
import { useStatusFilter } from './GeoServerLayerStatusFilter';

/**
 * Хук для объединения всех фильтров в один CQL_FILTER (для GeoServer WMS)
 */
export const useCombinedFilters = (): Record<string, string> | undefined => {
  const yearFilter = useYearFilter();
  const soatoFilter = useSoatoFilter();
  const turFilter = useTurFilter();
  const statusFilter = useStatusFilter();
  const exclusivelyEtid5 = useSelectionIsExclusivelyEtid5();
  const applyStatusFilter = !exclusivelyEtid5;

  return useMemo(() => {
    const filterParts: string[] = [];
    
    // Добавляем фильтр по году, если он есть
    if (yearFilter) {
      filterParts.push(yearFilter);
    }
    
    // Добавляем фильтр по SOATO, если он есть
    if (soatoFilter) {
      filterParts.push(soatoFilter);
    }

    // Добавляем фильтр по id_tur, если он есть
    if (turFilter) {
      filterParts.push(turFilter);
    }

    // Для ETID-5 статус (tekshirish) в CQL не применяем — показываем все записи типа
    if (applyStatusFilter && statusFilter) {
      filterParts.push(statusFilter);
    }

    // Объединяем фильтры через AND
    if (filterParts.length > 0) {
      const cqlFilter = filterParts.join(' AND ');
      return {
        CQL_FILTER: cqlFilter
      };
    }

    return undefined;
  }, [yearFilter, soatoFilter, turFilter, statusFilter, applyStatusFilter]);
};

/**
 * Хук для объединения тех же фильтров в SQL-where строку
 * для ArcGIS FeatureServer (definitionExpression).
 */
export const useCombinedFiltersWhere = (): string | undefined => {
  const yearFilter = useYearFilter();
  const soatoFilter = useSoatoFilter();
  const turFilter = useTurFilter();
  const statusFilter = useStatusFilter();
  const exclusivelyEtid5 = useSelectionIsExclusivelyEtid5();
  const applyStatusFilter = !exclusivelyEtid5;

  return useMemo(() => {
    const filterParts: string[] = [];

    if (yearFilter) {
      filterParts.push(yearFilter);
    }
    if (soatoFilter) {
      filterParts.push(soatoFilter);
    }
    if (turFilter) {
      filterParts.push(turFilter);
    }
    if (applyStatusFilter && statusFilter) {
      filterParts.push(statusFilter);
    }

    if (filterParts.length === 0) {
      return undefined;
    }

    // Синтаксис наших CQL-фильтров совместим с SQL ArcGIS (AND, =, IN, LIKE, IS NULL)
    return filterParts.join(' AND ');
  }, [yearFilter, soatoFilter, turFilter, statusFilter, applyStatusFilter]);
};



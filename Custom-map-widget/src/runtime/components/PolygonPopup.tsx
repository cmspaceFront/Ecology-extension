/** @jsx jsx */
import { jsx } from 'jimu-core';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import './PolygonPopup.css';
import { useLocale } from './hooks/useLocale';
import { stripGuidBraces } from '../pickMatchingGeoJsonRecord';
// @ts-ignore - JSON импорт поддерживается в webpack
import localesData from './locales.json';
// @ts-ignore - JSON импорт поддерживается в webpack
import regionsData from '../regions.json';
// @ts-ignore - JSON импорт поддерживается в webpack
import districtsData from '../districts.json';
// @ts-ignore - JSON импорт поддерживается в webpack
import mahallasData from '../mahallas.json';

export interface PolygonProperties {
  created_date?: string;
  created_user?: string;
  globalid?: string;
  hisoblangan_zarar?: number | string | null;
  holat_bartaraf_etildi?: string | null;
  id_district?: string;
  id_mfy?: string;
  id_region?: string;
  id_tur?: string;
  inspektor?: string | null;
  jarima_qollanildi?: string | null;
  last_edited_date?: string;
  last_edited_user?: string;
  location?: string;
  maydon?: number;
  mfy?: string;
  natija?: string;
  sana?: string;
  shape_area?: number;
  shape_length?: number;
  tekshirish?: string | null;
  tuman?: string;
  tur?: string;
  unique_id?: string;
  users?: string | null;
  viloyat?: string;
  yer_toifa?: string;
  [key: string]: any;
}

export interface PolygonPopupProps {
  isOpen: boolean;
  onClose: () => void;
  properties: PolygonProperties | null;
  position?: { x: number; y: number } | null;
  containerRef?: React.MutableRefObject<HTMLDivElement | null> | React.MutableRefObject<HTMLDivElement> | { current: HTMLDivElement | null } | any;
  onEdit?: () => void;
}

function isHolatBartarafEtildiFieldKey(key: string): boolean {
  const n = String(key)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');
  return n === 'holat_bartaraf_etildi';
}

/** Текущий полигон — тип ETID-5 (по id_tur / tur): скрыть инспектор и редактирование. При мультивыборе ETID-4+ETID-5 у ETID-4 полигонов попап полный. */
function isPopupFeatureEtid5(props: PolygonProperties | null): boolean {
  if (!props) return false;
  const rawIdTur =
    (props as any).id_tur ??
    (props as any).Id_tur ??
    (props as any).ID_TUR;
  if (typeof rawIdTur === 'string' && rawIdTur.trim()) {
    const u = rawIdTur.trim().toUpperCase();
    return u === 'ETID-5' || u === 'EDIT-5';
  }
  const tur = props.tur;
  if (tur !== undefined && tur !== null && tur !== '') {
    if (typeof tur === 'number' && Number.isFinite(tur) && tur === 4) return true;
    const s = String(tur).trim().toUpperCase();
    if (s === 'ETID-5') return true;
  }
  return false;
}

const ETID5_HIDDEN_POPUP_KEYS_LOWER = new Set(
  [
    'last_edited_date',
    'lastediteddate',
    'last_edited_user',
    'lastediteduser',
    'inspektor',
    'hisoblangan_zarar',
    'jarima_qollanildi',
    'tekshirish',
    'tekshiruv_natijasi',
    'natija',
    'izoh',
  ].map((k) => k.toLowerCase())
);

/**
 * Компонент поп-апа для отображения данных полигона из GeoServer
 * Стиль соответствует Custom-map-widget, но данные берутся из GeoServer
 */
const PolygonPopup = ({ isOpen, onClose, properties, position, containerRef, onEdit }: PolygonPopupProps) => {
  const { t, locale } = useLocale();
  const hideInspectorSectionAndEdit = isPopupFeatureEtid5(properties);
  const popupRef = useRef<HTMLDivElement>(null);
  const [isSidebar, setIsSidebar] = useState(false);
  /** Позиция после перетаскивания пользователем (координаты относительно контейнера карты) */
  const userDragPosRef = useRef<{ left: number; top: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ cx: 0, cy: 0, left: 0, top: 0 });
  const [dragEndTick, setDragEndTick] = useState(0);
  const [draggingUI, setDraggingUI] = useState(false);

  useEffect(() => {
    userDragPosRef.current = null;
  }, [isOpen, properties?.unique_id, isSidebar]);

  useEffect(() => {
    if (!isOpen || !popupRef.current) return;

    const popup = popupRef.current;

    const resolveContainer = () => {
      return (
        (containerRef?.current as HTMLElement | null) ||
        (popup.offsetParent as HTMLElement | null) ||
        (popup.parentElement as HTMLElement | null) ||
        (popup.closest('.hybrid-map-container') as HTMLElement | null)
      );
    };

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    /**
     * Подгонка по реальному rect: Safari/iPad часто даёт высоту больше clientHeight или top+height > низ контейнера.
     * Для привязки снизу (bottom) — уменьшаем height, если попап вылезает вверх.
     */
    const constrainPopupToContainer = (
      container: HTMLElement,
      edgeX: number,
      edgeY: number,
      safeTop: number,
      safeBottom: number,
      fallbackHeight: number,
      dockBottom: boolean
    ) => {
      const popupEl = popupRef.current;
      if (!popupEl || !popupEl.isConnected || !container.isConnected) return;

      const cr = container.getBoundingClientRect();
      const marginX = edgeX;
      const marginTop = Math.max(safeTop, edgeY);
      const marginBottom = Math.max(safeBottom, edgeY, 8);
      const maxBottom = cr.bottom - marginBottom;
      const minTop = cr.top + marginTop;

      const shrinkHeight = (delta: number) => {
        if (delta <= 0) return;
        const curH = parseFloat(popupEl.style.height);
        const h0 = Number.isFinite(curH) ? curH : fallbackHeight;
        const newH = Math.max(100, h0 - delta);
        popupEl.style.height = `${newH}px`;
        popupEl.style.maxHeight = `${newH}px`;
      };

      let pr = popupEl.getBoundingClientRect();

      // Снизу
      let overflowBottom = pr.bottom - maxBottom;
      if (overflowBottom > 0) {
        if (dockBottom) {
          shrinkHeight(overflowBottom);
        } else {
          const curTop = parseFloat(popupEl.style.top);
          const topPx = Number.isFinite(curTop) ? curTop : 0;
          popupEl.style.top = `${Math.max(safeTop, topPx - overflowBottom)}px`;
        }
        pr = popupEl.getBoundingClientRect();
        overflowBottom = pr.bottom - maxBottom;
        if (overflowBottom > 0) shrinkHeight(overflowBottom);
      }

      // Сверху (часто при dock bottom + слишком большая высота)
      pr = popupEl.getBoundingClientRect();
      let overflowTop = minTop - pr.top;
      if (overflowTop > 0) {
        shrinkHeight(overflowTop);
        pr = popupEl.getBoundingClientRect();
      }

      // Ещё раз низ после shrink
      pr = popupEl.getBoundingClientRect();
      overflowBottom = pr.bottom - maxBottom;
      if (overflowBottom > 0) shrinkHeight(overflowBottom);

      // Горизонталь
      pr = popupEl.getBoundingClientRect();
      let overflowRight = pr.right - (cr.right - marginX);
      if (overflowRight > 0) {
        if (dockBottom) {
          const curRight = parseFloat(popupEl.style.right);
          const r = Number.isFinite(curRight) ? curRight : marginX;
          popupEl.style.right = `${r + overflowRight}px`;
        } else {
          const curLeft = parseFloat(popupEl.style.left);
          const leftPx = Number.isFinite(curLeft) ? curLeft : 0;
          popupEl.style.left = `${Math.max(marginX, leftPx - overflowRight)}px`;
        }
        pr = popupEl.getBoundingClientRect();
      }

      const minLeft = cr.left + marginX;
      if (pr.left < minLeft) {
        if (dockBottom) {
          const curRight = parseFloat(popupEl.style.right);
          const r = Number.isFinite(curRight) ? curRight : marginX;
          popupEl.style.right = `${Math.max(marginX, r - (minLeft - pr.left))}px`;
        } else {
          const curLeft = parseFloat(popupEl.style.left);
          const leftPx = Number.isFinite(curLeft) ? curLeft : 0;
          popupEl.style.left = `${leftPx + (minLeft - pr.left)}px`;
        }
      }

      // Финальный clamp top для режима без dock
      if (!dockBottom) {
        pr = popupEl.getBoundingClientRect();
        const chInner = container.clientHeight;
        const innerTopLimit = Math.max(safeTop, chInner - pr.height - marginBottom);
        const curTopFinal = parseFloat(popupEl.style.top);
        const topPxFinal = Number.isFinite(curTopFinal) ? curTopFinal : 0;
        if (topPxFinal > innerTopLimit) {
          popupEl.style.top = `${innerTopLimit}px`;
        }
      }
    };

    const applyLayout = () => {
      if (isDraggingRef.current) return;

      // Проверяем, что popup все еще существует и примонтирован
      if (!popupRef.current || !isOpen) return;
      
      // Дополнительная проверка - элемент должен быть в DOM
      if (!popupRef.current.isConnected) return;
      
      const container = resolveContainer();
      if (!container || !container.isConnected) return;

      const popup = popupRef.current;

      if (!isSidebar) {
        popup.removeAttribute('data-popup-sidebar');
      }

      // ВАЖНО: берём реальные внутренние размеры контейнера (без влияния скролла страницы)
      const cr0 = container.getBoundingClientRect();
      const cw = Math.max(1, Math.min(container.clientWidth, Math.round(cr0.width)));
      const ch = Math.max(1, Math.min(container.clientHeight, Math.round(cr0.height)));

      if (!cw || !ch) return;

      // Планшеты (iPad Air и виджет в колонке)
      const isTabletish = cw <= 834 || (cw <= 1024 && ch <= 900);

      let popupSize: 'xs' | 'sm' | 'md' = 'md';
      if (cw < 480 || ch < 440) popupSize = 'xs';
      else if (cw < 700 || ch < 620 || isTabletish) popupSize = 'sm';

      const EDGE_X =
        popupSize === 'xs' ? 6 : popupSize === 'sm' ? 8 : cw < 520 ? 8 : isTabletish ? 12 : 16;
      const EDGE_Y =
        popupSize === 'xs'
          ? 6
          : popupSize === 'sm'
            ? 8
            : cw < 400 || ch < 420
              ? 8
              : ch < 520
                ? 12
                : isTabletish
                  ? 14
                  : 16;

      const SAFE_TOP = isSidebar ? 0 : EDGE_Y;
      const SAFE_BOTTOM = isSidebar ? 0 : Math.max(EDGE_Y, isTabletish ? 14 : 8);

      const availableW = Math.max(0, cw - EDGE_X * 2);
      const availableH = Math.max(0, ch - EDGE_Y * 2);

      const isLargeDesktop = popupSize === 'md';
      const mdPopupMaxW =
        typeof window !== 'undefined' && window.innerWidth >= 1920 ? 520 : 420;

      // Ширина: md — до 420px; на экранах ≥1920px — до 520px
      const MAX_W =
        popupSize === 'xs'
          ? Math.min(280, availableW)
          : popupSize === 'sm'
            ? Math.min(340, availableW)
            : isLargeDesktop
              ? Math.min(mdPopupMaxW, availableW)
              : cw < 360
                ? Math.min(300, availableW)
                : cw < 480
                  ? Math.min(360, availableW)
                  : cw < 720
                    ? Math.min(400, availableW)
                    : mdPopupMaxW;

      const width = Math.min(MAX_W, availableW);

      // Высота: xs/sm — низкие потолки; md — прежняя лестница до 350px
      const heightCapBySize =
        popupSize === 'xs'
          ? Math.min(200, Math.floor(ch * 0.46))
          : popupSize === 'sm'
            ? Math.min(260, Math.floor(ch * 0.52))
            : isTabletish
              ? Math.min(300, Math.floor(ch * 0.54))
              : 9999;

      const DEFAULT_POPUP_H = isLargeDesktop
        ? Math.min(
            heightCapBySize,
            ch < 320 ? 220 : ch < 400 ? 260 : ch < 520 ? 300 : ch < 640 ? 330 : 350
          )
        : Math.min(
            heightCapBySize,
            ch < 280 ? 160 : ch < 340 ? 175 : ch < 400 ? 195 : ch < 520 ? 230 : ch < 640 ? 260 : ch < 820 ? 290 : 310
          );
      const maxH = Math.max(popupSize === 'xs' ? 120 : 130, ch - SAFE_TOP - SAFE_BOTTOM - 6);
      const height = Math.min(DEFAULT_POPUP_H, maxH);

      const compactY = isLargeDesktop ? availableH < 420 : availableH < 440 || popupSize !== 'md';
      popup.setAttribute('data-compact-y', compactY ? '1' : '0');

      popup.setAttribute('data-popup-size', popupSize);

      if (isSidebar) {
        popup.removeAttribute('data-popup-dock');
        popup.removeAttribute('data-popup-place');
        popup.setAttribute('data-popup-sidebar', '1');
        // Sidebar: top + bottom + height:auto — высота ровно между отступами контейнера (без px-набегания вниз)
        const sidebarMaxW =
          popupSize === 'xs' ? 280 : popupSize === 'sm' ? 320 : mdPopupMaxW;
        const sidebarW = Math.min(sidebarMaxW, Math.max(0, cw - 16));

        popup.style.left = 'auto';
        popup.style.right = '1px';
        popup.style.top = '1px';
        popup.style.bottom = '1px';
        popup.style.width = `${sidebarW}px`;
        popup.style.height = 'auto';
        popup.style.maxHeight = 'none';
        popup.style.minHeight = '0';

        return;
      }

      // Popup mode
      if (!position) return;

      const centeredSmall = popupSize === 'xs' || popupSize === 'sm';
      const maxPopupH = Math.max(100, ch - SAFE_TOP - SAFE_BOTTOM);
      const h = Math.min(height, maxPopupH);

      popup.style.width = `${width}px`;

      // Пользователь перетащил попап — фиксируем left/top, не центр и не клик
      if (userDragPosRef.current && !isDraggingRef.current) {
        popup.removeAttribute('data-popup-dock');
        popup.removeAttribute('data-popup-place');
        popup.removeAttribute('data-popup-sidebar');
        popup.style.bottom = '';
        popup.style.right = '';
        popup.style.height = `${h}px`;
        popup.style.maxHeight = `${maxPopupH}px`;
        let left = clamp(userDragPosRef.current.left, EDGE_X, cw - width - EDGE_X);
        let top = clamp(userDragPosRef.current.top, SAFE_TOP, ch - h - SAFE_BOTTOM);
        userDragPosRef.current = { left, top };
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            constrainPopupToContainer(container, EDGE_X, EDGE_Y, SAFE_TOP, SAFE_BOTTOM, h, false);
          });
        });
        return;
      }

      if (centeredSmall) {
        popup.removeAttribute('data-popup-dock');
        popup.removeAttribute('data-popup-sidebar');
        popup.setAttribute('data-popup-place', 'center');
        popup.style.bottom = 'auto';
        popup.style.right = 'auto';
        popup.style.height = `${h}px`;
        popup.style.maxHeight = `${maxPopupH}px`;
        // Не строго по центру — чуть правее (доля ширины контейнера, затем clamp)
        const shiftRight = Math.round(cw * 0.3);
        let left = (cw - width) / 2 + shiftRight;
        let top = (ch - h) / 2;
        left = clamp(left, EDGE_X, cw - width - EDGE_X);
        top = clamp(top, SAFE_TOP, ch - h - SAFE_BOTTOM);
        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
      } else {
        popup.removeAttribute('data-popup-dock');
        popup.removeAttribute('data-popup-place');
        popup.removeAttribute('data-popup-sidebar');
        popup.style.bottom = '';
        popup.style.right = 'auto';
        popup.style.height = `${h}px`;
        popup.style.maxHeight = `${h}px`;

        let left = position.x;
        let top = position.y;

        left = clamp(left, EDGE_X, cw - width - EDGE_X);
        top = clamp(top, SAFE_TOP, ch - h - SAFE_BOTTOM);

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          constrainPopupToContainer(container, EDGE_X, EDGE_Y, SAFE_TOP, SAFE_BOTTOM, h, false);
          requestAnimationFrame(() => {
            constrainPopupToContainer(container, EDGE_X, EDGE_Y, SAFE_TOP, SAFE_BOTTOM, h, false);
          });
        });
      });
    };

    // Используем задержку для первого применения layout, чтобы React успел примонтировать элемент
    const timeoutId = setTimeout(() => {
      if (popupRef.current && isOpen) {
        applyLayout();
      }
    }, 0);

    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (popupRef.current && isOpen && popupRef.current.isConnected) {
          applyLayout();
        }
      });
    });
    
    const containerForObserve = resolveContainer();
    if (containerForObserve && containerForObserve.isConnected) {
      try {
        ro.observe(containerForObserve);
      } catch (error) {
        // Игнорируем ошибки наблюдения
      }
    }

    window.addEventListener('resize', applyLayout);
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (vv) {
      vv.addEventListener('resize', applyLayout);
      vv.addEventListener('scroll', applyLayout);
    }

    return () => {
      clearTimeout(timeoutId);
      try {
        ro.disconnect();
      } catch (error) {
        // Игнорируем ошибки при отключении
      }
      window.removeEventListener('resize', applyLayout);
      if (vv) {
        vv.removeEventListener('resize', applyLayout);
        vv.removeEventListener('scroll', applyLayout);
      }
    };
  }, [isOpen, position, isSidebar, containerRef, dragEndTick]);

  const handleHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isSidebar) return;
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      e.stopPropagation();

      const popup = popupRef.current;
      const container =
        (containerRef?.current as HTMLElement | null) ||
        (popup?.closest('.hybrid-map-container') as HTMLElement | null);
      if (!popup || !container) return;

      const cr = container.getBoundingClientRect();
      const pr = popup.getBoundingClientRect();
      const left = pr.left - cr.left;
      const top = pr.top - cr.top;

      popup.removeAttribute('data-popup-dock');
      popup.removeAttribute('data-popup-place');
      popup.removeAttribute('data-popup-sidebar');
      popup.style.bottom = 'auto';
      popup.style.right = 'auto';
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;

      userDragPosRef.current = { left, top };
      isDraggingRef.current = true;
      setDraggingUI(true);
      dragStartRef.current = { cx: e.clientX, cy: e.clientY, left, top };

      try {
        popup.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      const onMove = (ev: PointerEvent) => {
        if (!isDraggingRef.current) return;
        const el = popupRef.current;
        const cont =
          (containerRef?.current as HTMLElement | null) ||
          (el?.closest('.hybrid-map-container') as HTMLElement | null);
        if (!el || !cont) return;

        const dx = ev.clientX - dragStartRef.current.cx;
        const dy = ev.clientY - dragStartRef.current.cy;
        const cr2 = cont.getBoundingClientRect();
        const cw2 = Math.max(1, Math.min(cont.clientWidth, Math.round(cr2.width)));
        const ch2 = Math.max(1, Math.min(cont.clientHeight, Math.round(cr2.height)));
        const pw = el.offsetWidth;
        const ph = el.offsetHeight;
        const margin = 6;
        const nl = Math.max(margin, Math.min(cw2 - pw - margin, dragStartRef.current.left + dx));
        const nt = Math.max(margin, Math.min(ch2 - ph - margin, dragStartRef.current.top + dy));

        el.style.left = `${nl}px`;
        el.style.top = `${nt}px`;
        userDragPosRef.current = { left: nl, top: nt };
      };

      const onUp = (ev: PointerEvent) => {
        isDraggingRef.current = false;
        setDraggingUI(false);
        const el = popupRef.current;
        try {
          if (el) el.releasePointerCapture(ev.pointerId);
        } catch {
          // ignore
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        setDragEndTick((t) => t + 1);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [containerRef, isSidebar]
  );

  // Сбрасываем режим сайдбара при закрытии
  useEffect(() => {
    if (!isOpen) {
      setIsSidebar(false);
    }
  }, [isOpen]);

  // Обработчик переключения sidebar с защитой от ошибок DOM
  const handleToggleSidebar = () => {
    // Используем requestAnimationFrame для синхронизации с React
    requestAnimationFrame(() => {
      setIsSidebar((prev) => !prev);
    });
  };

  // Локаль из useLocale = localStorage "customLocal" (uz-Latn | uz-Cyrl | ru).
  // Получить название по ID из справочника (регион/район/МФЙ) с учётом этой локали.
  const getNameFromLookup = (record: Record<string, string> | undefined, currentLocale: string): string | null => {
    if (!record || typeof record !== 'object') return null;
    // В JSON: regions/districts — ru, uz-Cyrl, uz (латиница); mahallas — только uz
    const localeKey = currentLocale === 'uz-Latn' ? 'uz' : currentLocale;
    const fallbackOrder = [localeKey, 'ru', 'uz', 'uz-Cyrl', 'en', 'qqr'];
    for (const k of fallbackOrder) {
      if (record[k] && String(record[k]).trim()) return String(record[k]).trim();
    }
    const first = Object.values(record).find((v) => v != null && String(v).trim());
    return first != null ? String(first).trim() : null;
  };

  // Функция для локализации значений полей из GeoServer
  const localizeFieldValue = (key: string, value: any): string | null => {
    if (value === null || value === undefined || value === '') return null;
    
    const valueStr = String(value).trim();
    
    try {
      // ID региона → название из regions.json
      if (key === 'id_region') {
        const record = (regionsData as Record<string, Record<string, string>>)[valueStr];
        const name = getNameFromLookup(record, locale);
        if (name) return name;
      }
      // ID района → название из districts.json
      if (key === 'id_district') {
        const record = (districtsData as Record<string, Record<string, string>>)[valueStr];
        const name = getNameFromLookup(record, locale);
        if (name) return name;
      }
      // ID МФЙ → название из mahallas.json
      if (key === 'id_mfy') {
        const record = (mahallasData as Record<string, Record<string, string>>)[valueStr];
        const name = getNameFromLookup(record, locale);
        if (name) return name;
      }

      // Локализуем поле tur (тип полигона)
      if (key === 'tur' || key === 'id_tur') {
        // Если значение - число (0-4), используем typeDescriptions
        if (['0', '1', '2', '3', '4'].includes(valueStr)) {
          const typeDesc = (localesData as any).popup?.fields?.typeDescriptions?.[valueStr];
          if (typeDesc && typeof typeDesc === 'object') {
            return typeDesc[locale] || typeDesc['ru'] || valueStr;
          }
        }

        // ETID-1 … ETID-5 / EDIT-4, EDIT-5 → локализованное описание типа
        const etidTypeMap = (localesData as any).popup?.fields?.etidTypeMap;
        if (etidTypeMap && typeof etidTypeMap === 'object') {
          const mappedValue = etidTypeMap[valueStr];
          if (mappedValue && typeof mappedValue === 'object') {
            return mappedValue[locale] || mappedValue['ru'] || valueStr;
          }
        }
        
        // Если значение - текст из GeoServer, пытаемся найти его в маппинге
        const typeValueMap = (localesData as any).popup?.fields?.typeValueMap;
        if (typeValueMap && typeof typeValueMap === 'object') {
          const mappedValue = typeValueMap[valueStr];
          if (mappedValue && typeof mappedValue === 'object') {
            return mappedValue[locale] || mappedValue['ru'] || valueStr;
          }
        }
        
        // Если не нашли в маппинге, возвращаем null (будет использовано исходное значение)
        return null;
      }
      
      // Локализуем поле yer_toifa (категория земли)
      if (key === 'yer_toifa' || key === 'Yer toifa') {
        const yerToifaMap = (localesData as any).popup?.fields?.yerToifaMap;
        if (yerToifaMap && typeof yerToifaMap === 'object') {
          const mappedValue = yerToifaMap[valueStr];
          if (mappedValue && typeof mappedValue === 'object') {
            return mappedValue[locale] || mappedValue['ru'] || valueStr;
          }
        }
        return null;
      }
      
      // Локализуем поле tekshirish (статус проверки)
      if (key === 'tekshirish' || key === 'Tekshiruv_natijasi') {
        // Сначала проверяем числовые значения
        if (valueStr === '1') {
          return t('modal.fields.result.options.approved');
        } else if (valueStr === '2') {
          return t('modal.fields.result.options.rejected');
        }
        
        // Затем проверяем текстовые значения из GeoServer
        const tekshirishMap = (localesData as any).popup?.fields?.tekshirishMap;
        if (tekshirishMap && typeof tekshirishMap === 'object') {
          const mappedValue = tekshirishMap[valueStr];
          if (mappedValue && typeof mappedValue === 'object') {
            return mappedValue[locale] || mappedValue['ru'] || valueStr;
          }
        }
        return null;
      }
      
      // Локализуем поле sana/yil (год) - форматируем "2024 йил" -> "2024 год" и т.д.
      if (key === 'sana' || key === 'yil' || key === 'Yil') {
        // Если значение содержит "йил" или "yil", заменяем на локализованный вариант
        if (valueStr.includes('йил') || valueStr.includes('yil')) {
          const yearMatch = valueStr.match(/(\d{4})/);
          if (yearMatch) {
            const year = yearMatch[1];
            if (locale === 'ru') {
              return `${year} год`;
            } else if (locale === 'uz-Cyrl') {
              return `${year} йил`;
            } else if (locale === 'uz-Latn') {
              return `${year} yil`;
            }
          }
        }
        return null;
      }
    } catch (e) {
      // В случае ошибки возвращаем null
      return null;
    }
    
    return null;
  };

  /** Ключи дат: API (snake_case), ArcGIS / REST (camelCase, PascalCase) */
  const POPUP_DATE_FIELD_KEYS = new Set([
    'created_date',
    'last_edited_date',
    'createdDate',
    'lastEditedDate',
    'CreatedDate',
    'LastEditedDate',
    'CREATED_DATE',
    'LAST_EDITED_DATE',
  ]);

  /** Календарная часть из строки API (без сдвига TZ): "2025-11-06..." → "2025/11/06" */
  const formatApiDateStringToYmdSlash = (s: string): string | null => {
    const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return `${m[1]}/${m[2]}/${m[3]}`;
  };

  /** Число с бэка = Unix (сек или мс) → YYYY/MM/DD по UTC (типично для epoch с сервера) */
  const formatEpochToYmdSlashUtc = (value: number): string | null => {
    const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}/${mo}/${day}`;
  };

  /**
   * Даты из API: строка как пришла (дата из префикса YYYY-MM-DD) или число-эпоха → только YYYY/MM/DD в попапе.
   */
  const tryFormatPopupDateField = (key: string, value: any): string | null => {
    if (!POPUP_DATE_FIELD_KEYS.has(key)) return null;

    if (typeof value === 'number' && Number.isFinite(value)) {
      return formatEpochToYmdSlashUtc(value);
    }
    if (typeof value === 'string') {
      const fromStr = formatApiDateStringToYmdSlash(value);
      if (fromStr !== null) return fromStr;
    }
    return null;
  };

  // Функция для форматирования значений
  const formatValue = (key: string, value: any): string => {
    if (value === null || value === undefined || value === '') return t('popup.values.empty');
    if (typeof value === 'boolean') return value ? t('popup.values.yes') : t('popup.values.no');

    if (key === 'unique_id' || key === 'uniqueId' || key === 'UNIQUE_ID') {
      const s = String(value).trim().replace(/[{}]/g, '');
      if (!s) return t('popup.values.empty');
      return s.toUpperCase();
    }

    const asPopupDate = tryFormatPopupDateField(key, value);
    if (asPopupDate !== null) return asPopupDate;

    if (typeof value === 'number') {
      // Форматируем числа с разделителями
      return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
    }
    
    // Пытаемся локализовать значение поля
    const localized = localizeFieldValue(key, value);
    if (localized !== null) {
      return localized;
    }
    
    return String(value);
  };

  // Функция для форматирования названий полей
  const formatFieldName = (key: string): string => {
    let labelKey = key;
    if (key === 'tekshirish' || key === 'Tekshiruv_natijasi') labelKey = 'tekshirish';
    else if (key === 'natija' || key === 'Natija') labelKey = 'izoh';
    else if (key === 'unique_id' || key === 'uniqueId' || key === 'UNIQUE_ID') labelKey = 'globalid';
    const translationKey = `popup.fields.${labelKey}`;
    const translated = t(translationKey);
    // Если перевод не найден (вернулся ключ), возвращаем ключ как есть
    return translated !== translationKey ? translated : key;
  };

  // Проверка прав доступа (как в Custom-map-widget: role в localStorage)
  const hasEditPermission = (): boolean => {
    // TEMP: временно открываем редактирование для всех пользователей
    // try {
    //   const role = localStorage.getItem('role');
    //   return role === 'insp' || role === 'root';
    // } catch {
    //   return false;
    // }
    return true;
  };

  // Проверка возможности редактирования (с учётом типа полигона: tur === 4 нельзя редактировать)
  const canEdit = (): boolean => {
    if (hideInspectorSectionAndEdit) return false;
    if (!hasEditPermission()) return false;
    const polygonType = properties?.tur ?? properties?.id_tur;
    if (polygonType !== undefined && polygonType !== null) {
      const typeValue = Number(polygonType);
      if (typeValue === 4) return false;
    }
    return true;
  };

  const handleEditClick = async () => {
    if (!canEdit() || !onEdit) return;
    try {
      await fetch('https://api-test.spacemc.uz/api/ecology/cache/clear', {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
    } catch {
      // не блокируем открытие модалки
    }
    onEdit();
    onClose();
  };

  const FILE_API_BASE = 'https://api-test.spacemc.uz/api/ecology/file/single/';
  const FILE_LIST_API_BASE = 'https://api-test.spacemc.uz/api/ecology/file/';

  const [apiFileUrls, setApiFileUrls] = useState<string[]>([]);

  // Парсим file_path (paths через ";") в массив URL для изображений
  const getFileImageUrls = (filePath: string | null | undefined): string[] => {
    if (filePath == null || typeof filePath !== 'string' || !filePath.trim()) return [];
    return filePath
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((path) => `${FILE_API_BASE}${path}`);
  };

  // Список файлов из API по unique_id (без фигурных скобок в URL).
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!isOpen || !properties) {
        setApiFileUrls([]);
        return;
      }

      const rawUnique =
        String((properties as any)?.unique_id ?? (properties as any)?.uniqueId ?? '').trim();
      const guid = rawUnique ? stripGuidBraces(rawUnique) : '';

      if (!guid) {
        setApiFileUrls([]);
        return;
      }

      const url = `${FILE_LIST_API_BASE}${guid}`;

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { accept: 'application/json' }
        });

        if (!res.ok) {
          if (!cancelled) setApiFileUrls([]);
          return;
        }

        const data = await res.json();
        const files: string[] = Array.isArray(data?.files) ? data.files : [];
        if (!cancelled) setApiFileUrls(files);
      } catch {
        if (!cancelled) setApiFileUrls([]);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, properties?.unique_id]);

  // Порядок первых полей: Viloyat, Tuman, MFY, Yil
  const FIRST_FIELD_KEYS = ['id_region', 'id_district', 'id_mfy', 'sana'];

  /** До Global ID: без полей блока «Инспектор» и без дат последнего редактирования */
  const POPUP_HEAD_ORDER_BEFORE_GLOBAL = [
    'tur',
    'yer_toifa',
    'maydon',
    'location',
    'izoh',
  ];

  const POPUP_LAST_EDITED_DATE_KEYS = [
    'last_edited_date',
    'lastEditedDate',
    'LastEditedDate',
    'LAST_EDITED_DATE',
  ];
  const POPUP_LAST_EDITED_USER_KEYS = [
    'last_edited_user',
    'lastEditedUser',
    'LastEditedUser',
    'LAST_EDITED_USER',
  ];

  /** После заголовка «Инспектор» — в этом порядке; у ключа несколько вариантов имён из API */
  const POPUP_INSPECTOR_BLOCK_KEY_GROUPS: string[][] = [
    ['inspektor'],
    ['hisoblangan_zarar'],
    ['jarima_qollanildi'],
    ['tekshirish', 'Tekshiruv_natijasi'],
    ['natija', 'Natija'],
  ];

  const splitPopupFieldSections = (
    entries: Array<{ key: string; value: any }>
  ): {
    mainHead: Array<{ key: string; value: any }>;
    preInspectorTitle: Array<{ key: string; value: any }>;
    inspectorBlock: Array<{ key: string; value: any }>;
    tail: Array<{ key: string; value: any }>;
  } => {
    const used = new Set<string>();
    const byKey = new Map(entries.map((e) => [e.key, e]));

    const pushIfPresent = (arr: Array<{ key: string; value: any }>, key: string) => {
      const e = byKey.get(key);
      if (e && !used.has(e.key)) {
        arr.push(e);
        used.add(e.key);
      }
    };

    const mainHead: Array<{ key: string; value: any }> = [];
    for (const k of FIRST_FIELD_KEYS) {
      pushIfPresent(mainHead, k);
    }
    for (const k of POPUP_HEAD_ORDER_BEFORE_GLOBAL) {
      if (FIRST_FIELD_KEYS.includes(k)) continue;
      pushIfPresent(mainHead, k);
    }

    const uniqueEntry =
      byKey.get('unique_id') ??
      byKey.get('uniqueId') ??
      byKey.get('UNIQUE_ID');
    if (uniqueEntry && !used.has(uniqueEntry.key)) {
      mainHead.push(uniqueEntry);
      used.add(uniqueEntry.key);
      used.add('unique_id');
      used.add('uniqueId');
      used.add('UNIQUE_ID');
    }
    used.add('globalid');
    used.add('GlobalID');
    used.add('GLOBALID');
    for (const e of entries) {
      if (isHolatBartarafEtildiFieldKey(e.key)) {
        used.add(e.key);
      }
    }

    const preInspectorTitle: Array<{ key: string; value: any }> = [];
    const pickFirstUnused = (keys: string[]) => {
      for (const k of keys) {
        const e = byKey.get(k);
        if (e && !used.has(e.key)) return e;
      }
      return null;
    };
    const led = pickFirstUnused(POPUP_LAST_EDITED_DATE_KEYS);
    if (led) {
      preInspectorTitle.push(led);
      used.add(led.key);
    }
    const leu = pickFirstUnused(POPUP_LAST_EDITED_USER_KEYS);
    if (leu) {
      preInspectorTitle.push(leu);
      used.add(leu.key);
    }

    const inspectorBlock: Array<{ key: string; value: any }> = [];
    for (const group of POPUP_INSPECTOR_BLOCK_KEY_GROUPS) {
      for (const k of group) {
        const e = byKey.get(k);
        if (e && !used.has(e.key)) {
          inspectorBlock.push(e);
          used.add(e.key);
          break;
        }
      }
    }

    const tail = entries
      .filter((e) => !used.has(e.key) && !isHolatBartarafEtildiFieldKey(e.key))
      .sort((a, b) => a.key.localeCompare(b.key));

    return { mainHead, preInspectorTitle, inspectorBlock, tail };
  };

  // Фильтруем поля, которые нужно показать (исключаем служебные и file_path — он выводится как картинки)
  const getDisplayFields = (props: PolygonProperties | null): Array<{ key: string; value: any }> => {
    if (!props || typeof props !== 'object') {
      return [];
    }
    const excludeKeys = [
      '[[Prototype]]',
      'type',
      'file_path',
      'viloyat',
      'tuman',
      'mfy',
      // не показывать в попапе (служебные / дубли типа)
      'shape_area',
      'shape_length',
      'Shape__Area',
      'Shape__Length',
      'globalid',
      'GlobalID',
      'GLOBALID',
      'holat_bartaraf_etildi',
      'Holat_bartaraf_etildi',
      'created_user',
      'created_date',
      'id_tur',
      'users',
      'objectid',
      'OBJECTID',
      'ObjectID',
      'FID',
      'fid',
      'gid',
      'GID',
    ];
    try {
      const izohRaw =
        (props as any).izoh ??
        (props as any).Izoh ??
        (props as any).IZOH;
      const izohStr =
        izohRaw != null && String(izohRaw).trim() !== '' ? String(izohRaw).trim() : null;

      const entries = Object.entries(props)
        .filter(([key]) => !excludeKeys.includes(key) && !key.startsWith('_'))
        .filter(([key]) => {
          const lk = key.toLowerCase();
          if (lk === 'izoh') return false;
          if (isHolatBartarafEtildiFieldKey(key)) return false;
          return true;
        })
        .map(([key, value]) => ({ key, value }));
      if (izohStr !== null) {
        entries.push({ key: 'izoh', value: izohStr });
      }
      entries.sort((a, b) => {
        const ai = FIRST_FIELD_KEYS.indexOf(a.key);
        const bi = FIRST_FIELD_KEYS.indexOf(b.key);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return 0;
      });
      return entries;
    } catch (error) {
      return [];
    }
  };

  const displayFieldsRaw = getDisplayFields(properties);
  const displayFields = hideInspectorSectionAndEdit
    ? displayFieldsRaw.filter((e) => !ETID5_HIDDEN_POPUP_KEYS_LOWER.has(e.key.toLowerCase()))
    : displayFieldsRaw;
  const { mainHead, preInspectorTitle, inspectorBlock, tail: tailFields } =
    splitPopupFieldSections(displayFields);

  const renderFieldRow = (key: string, value: any) => {
    const formatted = formatValue(key, value);
    return (
      <div key={key} className="map-popup__field">
        <span className="map-popup__label">{formatFieldName(key)}</span>
        <span className="map-popup__value">{formatted}</span>
      </div>
    );
  };
  const fileImageUrlsFromProps = getFileImageUrls(properties?.file_path);
  // Если API уже вернул список файлов — используем его (особенно важно после загрузки новых фото).
  const fileImageUrls = apiFileUrls.length > 0 ? apiFileUrls : fileImageUrlsFromProps;

  // Если popup не открыт, не рендерим ничего
  if (!isOpen || !properties) {
    return null;
  }

  return (
    <div>
      {!isSidebar && (
        <div 
          className="map-popup-overlay" 
          onClick={onClose}
        />
      )}
      <div
        ref={popupRef}
        className={`map-popup ${isSidebar ? 'map-popup--sidebar' : ''} ${draggingUI ? 'map-popup--dragging' : ''}`}
        onWheelCapture={(e) => e.stopPropagation()}
        onTouchMoveCapture={(e) => e.stopPropagation()}
      >
        <div
          className={`map-popup__header ${!isSidebar ? 'map-popup__header--draggable' : ''}`}
          onPointerDown={handleHeaderPointerDown}
        >
          <div className="map-popup__title">{t('popup.title')}</div>
          <div className="map-popup__header-buttons">
            <button
              type="button"
              className="map-popup__toggle-sidebar"
              aria-label="Toggle sidebar"
              onClick={handleToggleSidebar}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g opacity="0.4">
                  <path d="M4 6H20M4 12H20M4 18H20" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            </button>
            <button
              type="button"
              className="map-popup__close"
              aria-label={t('popup.close')}
              onClick={onClose}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g opacity="0.4">
                  <path d="M17.657 17.657L12.0001 12.0001M12.0001 12.0001L6.34326 6.34326M12.0001 12.0001L17.657 6.34326M12.0001 12.0001L6.34326 17.657" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            </button>
          </div>
        </div>

        <div className="map-popup__body">
          <div className="map-popup__section">
            {mainHead.map(({ key, value }) => renderFieldRow(key, value))}
            {preInspectorTitle.map(({ key, value }) => renderFieldRow(key, value))}
            {inspectorBlock.length > 0 && (
              <>
                <div className="map-popup__section-title map-popup__section-title--after-global">
                  {t('popup.section.inspector')}
                </div>
                {inspectorBlock.map(({ key, value }) => renderFieldRow(key, value))}
              </>
            )}
            {tailFields.map(({ key, value }) => renderFieldRow(key, value))}
          </div>

          {fileImageUrls.length > 0 && (
            <div className="map-popup__section map-popup__section--images">
              <div className="map-popup__section-title">{formatFieldName('file_path')}</div>
              <div className="map-popup__images">
                {fileImageUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="map-popup__image-link"
                  >
                    <img src={url} alt="" className="map-popup__image" loading="lazy" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {!hideInspectorSectionAndEdit && (
          <div className="map-popup__footer">
            <button
              type="button"
              className={`map-popup__edit-button ${!canEdit() ? 'map-popup__edit-button--disabled' : ''}`}
              onClick={handleEditClick}
              disabled={!canEdit()}
              title={!canEdit() ? t('popup.errors.noPermission') : ''}
            >
              <svg
                className="map-popup__edit-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6.94129 15.7273L2.5 17.5L4.27267 13.0587M6.94129 15.7273L16.1704 6.49819M6.94129 15.7273L6.58623 13.4132L4.27267 13.0587M4.27267 13.0587L13.5018 3.82956M16.1704 6.49819L13.5018 3.82956M16.1704 6.49819L16.999 5.66957C17.7359 4.93265 17.7359 3.73786 16.999 3.00094C16.2621 2.26402 15.0673 2.26402 14.3304 3.00094L13.5018 3.82956"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t('popup.buttons.edit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PolygonPopup;

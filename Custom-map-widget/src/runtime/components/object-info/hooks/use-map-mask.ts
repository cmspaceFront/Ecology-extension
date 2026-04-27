import { RefObject, useEffect, useRef, useState } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { MAP_CONSTRAINTS, MAP_DEFAULT_VIEW } from '../constants';
import { useEcologyPolygons } from './use-ecology-polygons';
import { smoothEasing, createDefaultMockSymbol } from '../utils/symbols';
import { createMaskGeometry, createMaskGraphic, clearMaskCache } from '../utils/mask-utils';
import { createPolygonFromFeature } from '../utils/geometry-utils';
import { findRegionFeature, findDistrictFeature } from '../utils/feature-utils';
import { UseMapMaskParams, UseMapMaskResult, GeometryModules } from './types';
import { loadGeometryModules } from './utils/geometry-loader';
import { loadUzbekistanRegionsGeoJSON } from './utils/data-loader';
import { deriveRegionAndDistrict } from './utils/region-utils';
import { findAndCreateRegionPolygon } from './utils/region-polygon';
import { setupClickHandler } from './utils/click-handler';
import { displayPolygons } from './utils/polygon-display';
import { zoomToPolygonByGlobalId } from './utils/zoom-handler';

export const useMapMask = ({
  mapRef,
  geoJSONData,
  districtGeoJSON,
  selectedRegion,
  selectedDistrict,
  selectionRevision,
  filters,
  filtersRevision,
  onShowPopup = () => {}
}: UseMapMaskParams): UseMapMaskResult => {
  const viewRef = useRef<__esri.MapView | null>(null);
  const mapInstanceRef = useRef<__esri.Map | null>(null);
  const maskLayerRef = useRef<__esri.GraphicsLayer | null>(null);
  const ecologyLayerRef = useRef<__esri.GraphicsLayer | null>(null);
  const imageServiceLayerRef = useRef<__esri.ImageryLayer | null>(null);
  const regionPolygonRef = useRef<__esri.Polygon | null>(null);
  const isInitializedRef = useRef(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isProcessingRegion, setIsProcessingRegion] = useState(false);
  const prevSelectedRegionRef = useRef<string | null>(null);
  const prevSelectedDistrictRef = useRef<string | null>(null);
  const geometryModulesRef = useRef<GeometryModules | null>(null);
  const clickHandleRef = useRef<__esri.Handle | null>(null);
  const zoomWatchHandleRef = useRef<__esri.Handle | null>(null);
  const zoomUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastZoomRef = useRef<number | null>(null);
  const symbolCacheRef = useRef<Map<string, any>>(new Map());
  const clickDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isProcessingClickRef = useRef(false);
  const lastClickedGidRef = useRef<number | string | null>(null);
  const isAnimatingRef = useRef(false);
  
  const onShowPopupRef = useRef(onShowPopup);
  const filtersRef = useRef(filters);
  const lastFiltersKeyRef = useRef<string>('');
  
  useEffect(() => {
    onShowPopupRef.current = onShowPopup;
  }, [onShowPopup]);

  // Обновляем ref для filters чтобы избежать пересоздания useEffect
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const { polygonsData, fetchPolygons } = useEcologyPolygons();

  // Ref для отслеживания последнего обновления маски
  const lastMaskUpdateRef = useRef<number>(0);
  const maskUpdateRequestRef = useRef<number | null>(null);
  const pendingMaskUpdateRef = useRef<boolean>(false);

  // Ref для предотвращения дублированных запросов полигонов
  const lastEcologyRequestRef = useRef<string>('');
  const ecologyRequestTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref для отмены обработки Viloyat.json
  const regionProcessingCancelRef = useRef<(() => void) | null>(null);

  // Оптимизированная функция обновления маски
  const updateMask = async (): Promise<boolean> => {
    const currentPolygon = regionPolygonRef.current;

    if (!maskLayerRef.current || !viewRef.current || !currentPolygon) {
      return false;
    }

    // Отменяем предыдущий запрос если есть
    if (maskUpdateRequestRef.current !== null) {
      cancelAnimationFrame(maskUpdateRequestRef.current);
      maskUpdateRequestRef.current = null;
    }

    return new Promise<boolean>((resolve) => {
      const performMaskUpdate = () => {
        try {
          if (!geometryModulesRef.current || !maskLayerRef.current || !viewRef.current) {
            resolve(false);
            return;
          }

          const { geometryEngine, Polygon, SpatialReference, Graphic } = geometryModulesRef.current;

          // Получаем текущий extent view для оптимизации
          const viewExtent = viewRef.current?.extent || null;

          // Выполняем обновление
          maskLayerRef.current.removeAll();

          const maskGeometry = createMaskGeometry(
            currentPolygon,
            Polygon,
            SpatialReference,
            geometryEngine,
            viewExtent
          );

          if (maskGeometry && maskLayerRef.current) {
            const maskGraphic = createMaskGraphic(maskGeometry, Graphic);
            maskLayerRef.current.add(maskGraphic);
          }

          lastMaskUpdateRef.current = Date.now();
          pendingMaskUpdateRef.current = false;
          resolve(true);
        } catch {
          pendingMaskUpdateRef.current = false;
          resolve(false);
        }
      };

      maskUpdateRequestRef.current = requestAnimationFrame(() => {
        // Выполняем синхронную часть сразу
        try {
          if (!geometryModulesRef.current) {
            // Загружаем модули асинхронно, но не блокируем UI
            loadGeometryModules().then(modules => {
              geometryModulesRef.current = modules;
              performMaskUpdate();
            });
            return;
          }
          
          performMaskUpdate();
        } catch {
          pendingMaskUpdateRef.current = false;
          resolve(false);
        }
      });
    });
  };
  
  // Проверяем есть ли отложенное обновление
  useEffect(() => {
    if (pendingMaskUpdateRef.current && regionPolygonRef.current && viewRef.current && maskLayerRef.current) {
      const checkPending = () => {
        if (pendingMaskUpdateRef.current) {
          updateMask();
        }
      };
      const timeout = setTimeout(checkPending, 10);
      return () => clearTimeout(timeout);
    }
  }, [selectedRegion, selectedDistrict, selectionRevision]);

  // Эффект для зума и маски при изменении региона
  useEffect(() => {
    if (!viewRef.current || !isInitializedRef.current) {
      return;
    }
    
    const selectedSoato = localStorage.getItem('selectedSoato');
    const { region: derivedRegion, district: derivedDistrict } = deriveRegionAndDistrict(selectedSoato);
    
    const hasDistrictSelection = Boolean(derivedDistrict);
    
    // Если нет selectedSoato или он равен 'all', используем uzbekistan_regions_backup.json
    // Не ждем geoJSONData, так как используем другой файл
    // Если есть selectedSoato, но geoJSONData еще не загружен, ждем
    if (selectedSoato && selectedSoato !== 'all' && !geoJSONData) {
      return;
    }
    
    // Если есть district, но districtGeoJSON еще не загружен, ждем
    if (hasDistrictSelection && !districtGeoJSON?.features?.length) {
      return;
    }

    const isFirstLoad =
      (prevSelectedRegionRef.current === null && prevSelectedDistrictRef.current === null) ||
      (prevSelectedRegionRef.current === '' && prevSelectedDistrictRef.current === '');
    
    const isRegionChanged = prevSelectedRegionRef.current !== derivedRegion && !isFirstLoad;
    const isDistrictChanged = prevSelectedDistrictRef.current !== (derivedDistrict || null) && !isFirstLoad;
    
    if (!isFirstLoad && !isRegionChanged && !isDistrictChanged) {
      return;
    }
    
    prevSelectedRegionRef.current = derivedRegion;
    prevSelectedDistrictRef.current = derivedDistrict || null;
    
    const zoomToRegion = async () => {
      try {
        if (!geometryModulesRef.current) {
          geometryModulesRef.current = await loadGeometryModules();
        }

        // Очищаем кеш маски при изменении района/региона для пересоздания маски
        clearMaskCache();

        const polygon = await findAndCreateRegionPolygon(
          geometryModulesRef.current,
          geoJSONData,
          districtGeoJSON
        );
        
        if (!polygon) {
          // Если не удалось создать полигон (например, uzbekistan_regions_backup.json не загрузился)
          // Убираем маску и делаем зум аут
          regionPolygonRef.current = null;
          if (maskLayerRef.current) {
            maskLayerRef.current.removeAll();
          }
          
          if (viewRef.current) {
            const isFirstRender = isFirstLoad;
            await viewRef.current.goTo({
              center: MAP_DEFAULT_VIEW.center,
              zoom: MAP_CONSTRAINTS.minZoom
            }, {
              duration: isFirstRender ? 800 : 1200,
              easing: smoothEasing
            });
          }
          return;
        }
        
        regionPolygonRef.current = polygon;
        
        // Обновляем маску сразу после установки полигона
        const maskCreated = await updateMask();
        if (!maskCreated) return;
        
        const extent = polygon.extent;
        if (extent && viewRef.current) {
          // Определяем expandFactor в зависимости от того, есть ли selectedSoato
          const selectedSoato = localStorage.getItem('selectedSoato');
          const { region: derivedRegion } = deriveRegionAndDistrict(selectedSoato);
          const useUzbekistanMask = !selectedSoato || selectedSoato === 'all' || derivedRegion === 'all';
          const expandFactor = useUzbekistanMask ? 1.1 : 1.2;
          const expandedExtent = extent.expand(expandFactor);
          
          const isFirstRender = isFirstLoad;
          await viewRef.current.goTo(expandedExtent, {
            duration: isFirstRender ? 800 : 1200,
            easing: smoothEasing
          });
          
          if (viewRef.current.zoom < 5) {
            await viewRef.current.goTo({ zoom: 5 }, {
              duration: isFirstRender ? 600 : 800,
              easing: smoothEasing
            });
          }
          
          // Обновляем маску после зума для гарантии правильного отображения
          await updateMask();
        }
      } catch {
        // Ignore errors
      }
    };
    
    zoomToRegion();
  }, [selectedRegion, selectedDistrict, geoJSONData, districtGeoJSON, selectionRevision]);
  
  // Эффект для обновления маски при изменении extent - полностью оптимизированный
  useEffect(() => {
    let watchHandle: __esri.WatchHandle | null = null;
    let isUpdating = false;
    let updateTimeout: NodeJS.Timeout | null = null;
    let movementTimeout: NodeJS.Timeout | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let isSetup = false;
    let lastExtent: __esri.Extent | null = null;
    let isViewMoving = false;
    
    const updateMaskOnViewChange = async () => {
      if (isUpdating) return;
      if (!viewRef.current || !maskLayerRef.current || !regionPolygonRef.current) return;
      
      // Проверяем действительно ли extent изменился значительно
      // Увеличен порог до 25% для значительного уменьшения частоты обновлений
      const currentExtent = viewRef.current.extent;
      if (lastExtent) {
        const extentChanged = 
          Math.abs(currentExtent.xmin - lastExtent.xmin) > currentExtent.width * 0.25 ||
          Math.abs(currentExtent.ymin - lastExtent.ymin) > currentExtent.height * 0.25 ||
          Math.abs(currentExtent.width - lastExtent.width) > lastExtent.width * 0.25 ||
          Math.abs(currentExtent.height - lastExtent.height) > lastExtent.height * 0.25;
        
        if (!extentChanged) {
          return; // Extent не изменился значительно, пропускаем обновление
        }
      }
      
      lastExtent = currentExtent.clone();
      isUpdating = true;
      
      try {
        // НЕ очищаем кеш маски при каждом изменении extent для лучшей производительности
        // Кеш будет использоваться для оптимизации
        await updateMask();
      } finally {
        isUpdating = false;
      }
    };
    
    const setupMask = () => {
      if (isSetup) return true;
      if (!viewRef.current || !maskLayerRef.current || !regionPolygonRef.current) return false;
      
      isSetup = true;
      lastExtent = viewRef.current.extent?.clone() || null;
      updateMaskOnViewChange();
      
      // Оптимизированный debounce - обновляем только при значительных изменениях
      // Увеличен debounce до 2000ms для значительного уменьшения частоты обновлений
      // Отключаем обновление маски при активном движении карты для лучшей производительности
      watchHandle = viewRef.current.watch('extent', () => {
        // Отмечаем что карта движется
        isViewMoving = true;
        if (movementTimeout) {
          clearTimeout(movementTimeout);
        }
        // Сбрасываем флаг движения через 500ms после последнего изменения
        movementTimeout = setTimeout(() => {
          isViewMoving = false;
        }, 500);
        
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        // Увеличенный debounce для лучшей производительности - 2000ms
        // И обновляем только если карта не движется активно
        updateTimeout = setTimeout(() => {
          if (regionPolygonRef.current && !isUpdating && viewRef.current && !isViewMoving) {
            updateMaskOnViewChange();
          }
        }, 2000);
      });
      
      return true;
    };
    
    let pollAttempts = 0;
    const maxPollAttempts = 15;
    
    // Увеличен интервал polling до 2000ms для уменьшения нагрузки на производительность
    pollInterval = setInterval(() => {
      pollAttempts++;
      if (setupMask()) {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } else if (pollAttempts >= maxPollAttempts) {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      }
    }, 2000);
    
    if (setupMask() && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    
    return () => {
      if (pollInterval) clearInterval(pollInterval);
      if (updateTimeout) clearTimeout(updateTimeout);
      if (movementTimeout) clearTimeout(movementTimeout);
      if (watchHandle) watchHandle.remove();
      if (maskUpdateRequestRef.current !== null) {
        cancelAnimationFrame(maskUpdateRequestRef.current);
        maskUpdateRequestRef.current = null;
      }
      if (clickHandleRef.current) {
        clickHandleRef.current.remove();
        clickHandleRef.current = null;
      }
      isSetup = false;
      lastExtent = null;
    };
  }, [selectedRegion, selectedDistrict, selectionRevision]);

  // Эффект для загрузки и отображения полигонов из API
  // Оптимизирован: используем ref для filters чтобы избежать пересоздания при каждом filtersRevision
  useEffect(() => {
    if (!isMapReady || !viewRef.current || !ecologyLayerRef.current) return;

    isProcessingClickRef.current = false;
    lastClickedGidRef.current = null;
    isAnimatingRef.current = false;

    if (clickDebounceRef.current) {
      clearTimeout(clickDebounceRef.current);
      clickDebounceRef.current = null;
    }

    const loadEcologyPolygons = async () => {
      // Используем ref для получения актуальных фильтров
      const currentFilters = filtersRef.current;
      const selectedSoato = currentFilters.selectedSoato;

      // Не загружаем полигоны только если selectedSoato не установлен вообще
      // При выборе региона (4 символа) или района (7 символов) полигоны должны загружаться
      if (!selectedSoato) {
        ecologyLayerRef.current?.removeAll();
        // Сбрасываем ключ запроса чтобы можно было загрузить при следующем выборе
        lastEcologyRequestRef.current = '';
        return;
      }

      // Создаем ключ для проверки дублированных запросов
      const requestKey = `${selectedSoato}-${currentFilters.selectedYear || 'all'}-${currentFilters.status || 'all'}-${currentFilters.selectedTypeId?.id || 'all'}`;

      // Проверяем, не делаем ли мы дублированный запрос
      if (lastEcologyRequestRef.current === requestKey) {
        return; // Уже делаем такой же запрос
      }

      lastEcologyRequestRef.current = requestKey;

      // Очищаем предыдущий таймаут если есть
      if (ecologyRequestTimeoutRef.current) {
        clearTimeout(ecologyRequestTimeoutRef.current);
      }

      // Мгновенная загрузка без debounce для быстрой реакции
      try {
        await fetchPolygons(currentFilters, selectedSoato);
      } catch (error) {
        // Сбрасываем ключ при ошибке, чтобы можно было повторить запрос
        lastEcologyRequestRef.current = '';
      }
    };

    // Создаем ключ для отслеживания изменений фильтров
    const currentFiltersKey = `${filters.selectedSoato || ''}-${filters.selectedYear || ''}-${filters.status || ''}-${filters.selectedTypeId?.id || ''}`;
    
    // Загружаем только если фильтры действительно изменились
    if (lastFiltersKeyRef.current !== currentFiltersKey) {
      lastFiltersKeyRef.current = currentFiltersKey;
      loadEcologyPolygons();
    }
    
    const handleStorageChange = (e: StorageEvent) => {
      // Реагируем на все фильтры, которые влияют на загрузку полигонов
      const relevantKeys = [
        'selectedYear', 'selectedSoato', 'selectedDistrict',
        'selectedTypeId', 'status', 'customLocal',
        'authToken', 'token'
      ];
      if (relevantKeys.includes(e.key || '') || e.key === null) {
        // Обновляем ref перед загрузкой
        filtersRef.current = filters;
        loadEcologyPolygons();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (ecologyRequestTimeoutRef.current) {
        clearTimeout(ecologyRequestTimeoutRef.current);
      }
    };
  }, [selectedRegion, selectedDistrict, selectionRevision, filters.selectedSoato, filters.selectedYear, filters.status, filters.selectedTypeId, fetchPolygons, isMapReady]);

  // Эффект для отображения полигонов на карте - оптимизированный
  useEffect(() => {
    // Отменяем предыдущую обработку Viloyat.json
    if (regionProcessingCancelRef.current) {
      regionProcessingCancelRef.current();
      regionProcessingCancelRef.current = null;
      setIsProcessingRegion(false);
    }

    // Используем ref для получения актуальных фильтров
    const currentFilters = filtersRef.current;

    // Если selectedSoato удален, немедленно очищаем слой и не показываем полигоны
    if (!currentFilters.selectedSoato) {
      ecologyLayerRef.current?.removeAll();
      return;
    }

    if (!polygonsData) {
      ecologyLayerRef.current?.removeAll();
      return;
    }
    if (!viewRef.current || !ecologyLayerRef.current || !geometryModulesRef.current) {
      return;
    }

    isProcessingClickRef.current = false;

    displayPolygons(
      polygonsData,
      viewRef,
      ecologyLayerRef,
      geometryModulesRef,
      symbolCacheRef,
      currentFilters,
      setIsProcessingRegion,
      regionProcessingCancelRef
    );
  }, [polygonsData, filters.selectedSoato, filters.selectedYear, filters.status, filters.selectedTypeId]);

  // Эффект для управления обработчиком клика
  // Переустанавливаем обработчик после отображения полигонов
  useEffect(() => {
    if (!isMapReady || !viewRef.current || !ecologyLayerRef.current) return;

    const setupClickHandlerLocal = () => {
      if (!viewRef.current || !ecologyLayerRef.current) return;

      if (clickHandleRef.current) {
        clickHandleRef.current.remove();
        clickHandleRef.current = null;
      }

      isProcessingClickRef.current = false;
      if (clickDebounceRef.current) {
        clearTimeout(clickDebounceRef.current);
        clickDebounceRef.current = null;
      }

      clickHandleRef.current = setupClickHandler(
        viewRef,
        ecologyLayerRef,
        mapRef,
        geometryModulesRef,
        symbolCacheRef,
        onShowPopupRef.current,
        isProcessingClickRef,
        clickDebounceRef,
        lastClickedGidRef,
        isAnimatingRef
      );
    };

    // Проверяем, есть ли graphics в слое
    const hasGraphics = ecologyLayerRef.current.graphics.length > 0;
    const filters = filtersRef.current;
    const shouldHaveGraphics = filters.selectedSoato && polygonsData;

    // Если должны быть graphics, но их нет, ждем немного
    if (shouldHaveGraphics && !hasGraphics) {
      // Ждем отображения полигонов
      const checkInterval = setInterval(() => {
        if (ecologyLayerRef.current && ecologyLayerRef.current.graphics.length > 0) {
          clearInterval(checkInterval);
          setupClickHandlerLocal();
        }
      }, 100);

      // Максимальное время ожидания - 2 секунды
      const maxWaitTimeout = setTimeout(() => {
        clearInterval(checkInterval);
        setupClickHandlerLocal(); // Устанавливаем обработчик в любом случае
      }, 2000);

      return () => {
        clearInterval(checkInterval);
        clearTimeout(maxWaitTimeout);
        if (clickHandleRef.current) {
          clickHandleRef.current.remove();
          clickHandleRef.current = null;
        }
        if (clickDebounceRef.current) {
          clearTimeout(clickDebounceRef.current);
          clickDebounceRef.current = null;
        }
        isProcessingClickRef.current = false;
      };
    } else {
      // Устанавливаем обработчик сразу
      setupClickHandlerLocal();
      return () => {
        if (clickHandleRef.current) {
          clickHandleRef.current.remove();
          clickHandleRef.current = null;
        }
        if (clickDebounceRef.current) {
          clearTimeout(clickDebounceRef.current);
          clickDebounceRef.current = null;
        }
        isProcessingClickRef.current = false;
      };
    }
  }, [isMapReady, selectedRegion, selectedDistrict, selectionRevision, polygonsData]);

  // Эффект для зума на полигон при изменении selectedId - оптимизированный
  // Убрана зависимость от polygonsData чтобы избежать пересоздания при каждом обновлении
  useEffect(() => {
    if (!isMapReady || !viewRef.current || !ecologyLayerRef.current) return;

    const performZoom = async () => {
      await zoomToPolygonByGlobalId(
        viewRef,
        ecologyLayerRef,
        geometryModulesRef,
        symbolCacheRef
      );
    };

    performZoom();

    // Увеличенный интервал polling до 3000ms для уменьшения нагрузки на производительность
    let lastSelectedId = localStorage.getItem('selectedId');
    const checkSelectedIdInterval = setInterval(() => {
      const currentSelectedId = localStorage.getItem('selectedId');
      if (currentSelectedId !== lastSelectedId) {
        lastSelectedId = currentSelectedId;
        performZoom();
      }
    }, 3000);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selectedId' || e.key === null) {
        performZoom();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(checkSelectedIdInterval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isMapReady]);
  
  // Инициализация карты
  useEffect(() => {
    if (!mapRef.current || isInitializedRef.current) return;
    if (viewRef.current) return;

    let view: __esri.MapView | null = null;

    const initMap = async () => {
      try {
        const [
          Map,
          MapView,
          GraphicsLayer,
        ] = await loadArcGISJSAPIModules([
          'esri/Map',
          'esri/views/MapView',
          'esri/layers/GraphicsLayer',
        ]);
        
        geometryModulesRef.current = await loadGeometryModules();
        
        // Get saved basemap from localStorage or use default
        let initialBasemap = 'hybrid';
        try {
          const saved = localStorage.getItem('custom-map-widget-basemap');
          if (saved) {
            initialBasemap = saved;
          }
        } catch {
          // Use default if localStorage is not available
        }
        
        const map = new Map({
          basemap: initialBasemap
        });
        mapInstanceRef.current = map;
        
        const maskLayer = new GraphicsLayer({
          opacity: 1.0,
          visible: true,
          title: 'Region Mask'
        });
        map.add(maskLayer);
        maskLayerRef.current = maskLayer;

        const ecologyLayer = new GraphicsLayer({
          opacity: 0.7,
          visible: true,
          title: 'Ecology Polygons'
        });
        map.add(ecologyLayer);
        ecologyLayerRef.current = ecologyLayer;

        view = new MapView({
          container: mapRef.current!,
          map: map,
          center: MAP_DEFAULT_VIEW.center,
          zoom: MAP_DEFAULT_VIEW.zoom,
          minZoom: MAP_CONSTRAINTS.minZoom,
          maxZoom: MAP_CONSTRAINTS.maxZoom,
          ui: {
            components: []
          }
        });

        view.when(async () => {
          viewRef.current = view;
          isInitializedRef.current = true;
          
          // Инициализируем lastZoomRef текущим значением зума
          lastZoomRef.current = Math.round(view.zoom * 2) / 2;
          
          view.constraints = {
            minZoom: MAP_CONSTRAINTS.minZoom,
            maxZoom: MAP_CONSTRAINTS.maxZoom
          };

          // Initialize ImageService layer if it was previously enabled
          try {
            const saved = localStorage.getItem('custom-map-widget-imageservice');
            if (saved === 'true') {
              const [ImageryLayer] = await loadArcGISJSAPIModules(['esri/layers/ImageryLayer']);
              
              const imageServiceLayer = new ImageryLayer({
                url: 'https://sgm.uzspace.uz/image/rest/services/Respublika_maxar_2025_yili/ImageServer',
                opacity: 0.8,
                title: 'Kartografik asos'
              });

              mapInstanceRef.current.layers.add(imageServiceLayer, 0);
              imageServiceLayerRef.current = imageServiceLayer;
            }
          } catch (error) {
            // Silently fail if ImageService layer can't be initialized
          }
          
          // Отключаем стандартное поведение double-click
          view.on('double-click', (event) => {
            event.stopPropagation();
          });
          
          if (zoomWatchHandleRef.current) {
            zoomWatchHandleRef.current.remove();
          }
          
          // Оптимизированный обработчик зума - увеличен debounce для лучшей производительности
          zoomWatchHandleRef.current = view.watch('zoom', (newZoom: number) => {
            if (newZoom < MAP_CONSTRAINTS.minZoom) {
              view?.goTo({ zoom: MAP_CONSTRAINTS.minZoom }, {
                duration: 200,
                easing: smoothEasing
              }).catch(() => {});
            }

            // Проверяем, изменился ли zoom значительно (минимум на 0.5)
            const roundedZoom = Math.round(newZoom * 2) / 2;
            if (lastZoomRef.current !== null && Math.abs(roundedZoom - lastZoomRef.current) < 0.5) {
              return; // Zoom не изменился значительно, пропускаем обновление
            }

            if (zoomUpdateTimeoutRef.current) {
              clearTimeout(zoomUpdateTimeoutRef.current);
            }

            // Увеличенный debounce для обновления символов - 1500ms для лучшей производительности
            zoomUpdateTimeoutRef.current = setTimeout(() => {
              if (ecologyLayerRef.current && viewRef.current) {
                const currentRoundedZoom = Math.round(viewRef.current.zoom * 2) / 2;
                
                // Проверяем еще раз перед обновлением
                if (lastZoomRef.current !== null && Math.abs(currentRoundedZoom - lastZoomRef.current) < 0.5) {
                  return;
                }
                
                lastZoomRef.current = currentRoundedZoom;
                
                // Оптимизированное обновление символов с использованием requestAnimationFrame
                // для предотвращения блокировки UI
                requestAnimationFrame(() => {
                  if (!ecologyLayerRef.current) return;
                  
                  const graphics = ecologyLayerRef.current.graphics;
                  const graphicsArray = graphics.toArray();
                  
                  // Обрабатываем graphics батчами для лучшей производительности
                  const BATCH_SIZE = 50;
                  let processed = 0;
                  
                  const processBatch = () => {
                    const end = Math.min(processed + BATCH_SIZE, graphicsArray.length);
                    
                    for (let i = processed; i < end; i++) {
                      const g = graphicsArray[i];
                      if (g.attributes?.__ecology) {
                        const currentSymbol = g.symbol as any;
                        if (currentSymbol?.type === 'picture-fill') {
                          const props = g.attributes.properties || {};
                          const polygonType = props.tur ?? props.type ?? null;
                          g.symbol = createDefaultMockSymbol(currentRoundedZoom, symbolCacheRef.current, polygonType);
                        }
                      }
                    }
                    
                    processed = end;
                    
                    // Продолжаем обработку следующего батча если есть еще graphics
                    if (processed < graphicsArray.length) {
                      requestAnimationFrame(processBatch);
                    }
                  };
                  
                  processBatch();
                });
              }
            }, 1500);
          });
          
          // Дожидаемся загрузки basemap перед установкой isMapReady
          const basemapReady = new Promise<void>((resolve) => {
            if (map.basemap) {
              map.basemap.when(() => resolve());
            } else {
              resolve();
            }
          });
          
          // Инициализация маски и зума
          const initMaskAndZoom = async () => {
            if (maskLayerRef.current && geometryModulesRef.current) {
              try {
                const { geometryEngine, Polygon, SpatialReference, Graphic } = geometryModulesRef.current;
                
                const selectedSoato = localStorage.getItem('selectedSoato');
                const { region: derivedRegion, district: derivedDistrict } = deriveRegionAndDistrict(selectedSoato);
                const selectedDistrictId = derivedDistrict;
                
                let initialPolygon: __esri.Polygon | null = null;
                
                // Приоритетно отображаем выбранный район из Tuman.json
                if (selectedDistrictId && districtGeoJSON?.features?.length) {
                  const districtFeature = findDistrictFeature(districtGeoJSON, selectedDistrictId);
                  if (districtFeature) {
                    initialPolygon = createPolygonFromFeature(
                      districtFeature,
                      Polygon,
                      SpatialReference,
                      geometryModulesRef.current.webMercatorUtils
                    );
                  }
                }
                
                // Если нет selectedSoato или он равен 'all', используем uzbekistan_regions_backup.json для маски
                if (!initialPolygon && (!selectedSoato || selectedSoato === 'all' || derivedRegion === 'all')) {
                  initialPolygon = await findAndCreateRegionPolygon(
                    geometryModulesRef.current,
                    geoJSONData,
                    districtGeoJSON
                  );
                } else if (geoJSONData) {
                  // Если есть selectedSoato, ищем регион
                  const regionFeature = findRegionFeature(geoJSONData, derivedRegion);
                  if (regionFeature) {
                    initialPolygon = createPolygonFromFeature(regionFeature, Polygon, SpatialReference);
                  }
                }
                
                if (initialPolygon) {
                  regionPolygonRef.current = initialPolygon;
                  maskLayerRef.current.removeAll();
                  
                  // Используем extent view если доступен
                  const viewExtent = viewRef.current?.extent || null;
                  
                  const maskGeometry = createMaskGeometry(
                    initialPolygon,
                    Polygon,
                    SpatialReference,
                    geometryEngine,
                    viewExtent
                  );
                  
                  if (maskGeometry) {
                    const maskGraphic = createMaskGraphic(maskGeometry, Graphic);
                    maskLayerRef.current.add(maskGraphic);
                  }
                    
                  if (viewRef.current && initialPolygon) {
                    const extent = initialPolygon.extent;
                    if (extent) {
                      const useUzbekistanMask = !selectedSoato || selectedSoato === 'all';
                      const expandFactor = useUzbekistanMask ? 1.1 : 1.2;
                      
                      // Дожидаемся завершения зума
                      await viewRef.current.goTo(extent.expand(expandFactor), {
                        duration: 1000,
                        easing: smoothEasing
                      });
                      
                      if (!useUzbekistanMask && viewRef.current && viewRef.current.zoom < 5) {
                        await viewRef.current.goTo({ zoom: 5 }, {
                          duration: 600,
                          easing: smoothEasing
                        });
                      }
                    }
                  }
                }
              } catch {
                // Ignore errors
              }
            }
          };
          
          // Дожидаемся basemap и инициализации, затем устанавливаем isMapReady
          basemapReady.then(async () => {
            await initMaskAndZoom();
            
            // Дополнительная проверка - дожидаемся когда view полностью отрисуется
            if (viewRef.current) {
              await viewRef.current.when();

              // Мгновенная установка готовности
              setIsMapReady(true);
            }
          });
          
          if (geoJSONData) {
            prevSelectedRegionRef.current = '';
          }
        }).catch(() => {
          // В случае ошибки все равно устанавливаем ready через некоторое время
          setTimeout(() => setIsMapReady(true), 2000);
        });

      } catch {
        // Ignore errors
      }
    };

    initMap();

    return () => {
      if (view) {
        if (clickHandleRef.current) {
          clickHandleRef.current.remove();
          clickHandleRef.current = null;
        }
        if (zoomWatchHandleRef.current) {
          zoomWatchHandleRef.current.remove();
          zoomWatchHandleRef.current = null;
        }
        if (clickDebounceRef.current) {
          clearTimeout(clickDebounceRef.current);
          clickDebounceRef.current = null;
        }
        if (zoomUpdateTimeoutRef.current) {
          clearTimeout(zoomUpdateTimeoutRef.current);
          zoomUpdateTimeoutRef.current = null;
        }
        isProcessingClickRef.current = false;
        
        view.destroy();
        viewRef.current = null;
        isInitializedRef.current = false;
      }
    };
  }, [geoJSONData, mapRef]);

  const handleZoom = async (direction: 1 | -1) => {
    const view = viewRef.current;
    if (!view) return;

    const currentZoom = view.zoom ?? MAP_DEFAULT_VIEW.zoom;
    const constraintKey = direction > 0 ? 'maxZoom' : 'minZoom';
    const targetZoom = direction > 0
      ? Math.min(view.constraints?.[constraintKey] ?? MAP_CONSTRAINTS.maxZoom, currentZoom + 1)
      : Math.max(view.constraints?.[constraintKey] ?? MAP_CONSTRAINTS.minZoom, currentZoom - 1);

    try {
      await view.goTo({ zoom: targetZoom }, { 
        duration: 600,
        easing: smoothEasing 
      });
    } catch {
      // Ignore errors
    }
  };

      // Cleanup при размонтировании компонента
  useEffect(() => {
    return () => {
      if (zoomUpdateTimeoutRef.current) {
        clearTimeout(zoomUpdateTimeoutRef.current);
      }
      if (zoomWatchHandleRef.current) {
        zoomWatchHandleRef.current.remove();
      }
      if (clickDebounceRef.current) {
        clearTimeout(clickDebounceRef.current);
      }
      if (maskUpdateRequestRef.current !== null) {
        cancelAnimationFrame(maskUpdateRequestRef.current);
        maskUpdateRequestRef.current = null;
      }
      symbolCacheRef.current.clear();
      clearMaskCache(); // Очищаем кеш масок
      isProcessingClickRef.current = false;
      // Cleanup ImageService layer
      if (imageServiceLayerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.layers.remove(imageServiceLayerRef.current);
        imageServiceLayerRef.current = null;
      }
    };
  }, []);

  const changeBasemap = async (basemapId: string) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.basemap = basemapId as any;
    }
  };

  const toggleImageServiceLayer = async (enabled: boolean) => {
    if (!mapInstanceRef.current) return;

    try {
      if (enabled) {
        // Add ImageServer layer if not already added
        if (!imageServiceLayerRef.current) {
          const [ImageryLayer] = await loadArcGISJSAPIModules(['esri/layers/ImageryLayer']);
          
          const imageServiceLayer = new ImageryLayer({
            url: 'https://sgm.uzspace.uz/image/rest/services/Respublika_maxar_2025_yili/ImageServer',
            opacity: 0.8,
            title: 'Kartografik asos'
          });

          // Add layer at index 0 (on top of basemap but below other layers)
          mapInstanceRef.current.layers.add(imageServiceLayer, 0);
          imageServiceLayerRef.current = imageServiceLayer;
        } else {
          // Show existing layer
          imageServiceLayerRef.current.visible = true;
        }
      } else {
        // Hide or remove layer
        if (imageServiceLayerRef.current) {
          imageServiceLayerRef.current.visible = false;
        }
      }
    } catch (error) {
      console.error('Error toggling ImageService layer:', error);
    }
  };

  return {
    handleZoomIn: () => handleZoom(1),
    handleZoomOut: () => handleZoom(-1),
    isMapReady,
    isProcessingRegion,
    changeBasemap,
    toggleImageServiceLayer
  };
};

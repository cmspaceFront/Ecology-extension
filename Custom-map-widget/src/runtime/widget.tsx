/** @jsx jsx */
import { AllWidgetProps, jsx, React } from 'jimu-core';
import { useState, useEffect, useRef, useCallback } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { IMConfig } from '../config';
// import GeoServerLayer from './components/GeoServerLayer';
import FeatureServerLayer from './components/FeatureServerLayer';
import PolygonPopup, { PolygonProperties } from './components/PolygonPopup';
import MapZoom from './components/MapZoom';
import MapWmsMask from './components/MapWmsMask';
import ZoomControls from './components/ZoomControls';
import FullscreenControl from './components/FullscreenControl';
import BasemapGallery from './components/BasemapGallery';
import CustomModal from './components/CustomModal';
import Legend from './components/Legend';
import MapLoader from './components/MapLoader';
import { getMinZoomForBasemap, getMinZoomForBasemapFullscreen } from './components/basemapMinZoom';
import { useLocale } from './components/hooks/useLocale';
import { readSelectionIsExclusivelyEtid5 } from './components/GeoServerLayerTurFilter';
import { type GeoJsonDisambiguateHints, pickMatchingGeoJsonRecord } from './pickMatchingGeoJsonRecord';
import './style.css';

const API_BASE_URL = 'https://api-test.spacemc.uz';

function geoJsonHintsFromPolygon (p: PolygonProperties | null | undefined): GeoJsonDisambiguateHints | undefined {
  if (!p) return undefined;
  return {
    id_district: p.id_district,
    id_region: p.id_region,
    id_mfy: p.id_mfy
  };
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const { id } = props;
  const { t } = useLocale();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  /** Только хост MapView (пустой div). Не помещать сюда React-узлы — иначе Esri и React конфликтуют (insertBefore). */
  const mapViewHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<__esri.Map | null>(null);
  const viewRef = useRef<__esri.MapView | null>(null);
  const imageServiceLayerRef = useRef<__esri.ImageryLayer | null>(null);
  const lastProcessedSelectedIdRef = useRef<string | null>(null);
  /** Увеличивается при переходе searchValue: был текст → пусто — MapZoom снова зумит к selectedSoato */
  const [soatoZoomSignal, setSoatoZoomSignal] = useState(0);
  const prevHadSearchValueRef = useRef<boolean | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isLoaderVisible, setIsLoaderVisible] = useState(true);
  const loaderShownAtRef = useRef<number>(performance.now());
  const [isOutlineMaskReady, setIsOutlineMaskReady] = useState(false);
  const [isFeaturesReady, setIsFeaturesReady] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [popupProperties, setPopupProperties] = useState<PolygonProperties | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPolygonData, setModalPolygonData] = useState<PolygonProperties | null>(null);
  const [mapModalPortalRoot, setMapModalPortalRoot] = useState<HTMLDivElement | null>(null);
  const [featureLayerRefreshKey, setFeatureLayerRefreshKey] = useState(0);
  /** В обычном режиме модалка в document.body (как раньше); в fullscreen — внутри контейнера карты. */
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [currentBasemap, setCurrentBasemap] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('hybrid-map-widget-basemap');
      return saved || 'hybrid';
    } catch {
      return 'hybrid';
    }
  });

  useEffect(() => {
    const syncFullscreen = () => {
      const doc = document as Document & {
        fullscreenElement?: Element | null;
        webkitFullscreenElement?: Element | null;
      };
      const fs = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      setIsMapFullscreen(fs === mapContainerRef.current);
    };
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    syncFullscreen();
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen);
      document.removeEventListener('webkitfullscreenchange', syncFullscreen);
    };
  }, []);

  // Лоадер: ждём view + контуры Region/District (ArcGIS) + FeatureLayer экологии
  const bumpProgress = useCallback((next: number) => {
    setLoadProgress((prev) => Math.max(prev, Math.min(100, Math.round(next))));
  }, []);

  const finishLoader = useCallback(() => {
    const MIN_SHOW_MS = 200;
    setLoadProgress(100);
    const elapsed = performance.now() - loaderShownAtRef.current;
    const delay = Math.max(0, MIN_SHOW_MS - elapsed);
    window.setTimeout(() => setIsLoaderVisible(false), delay);
  }, []);

  useEffect(() => {
    if (!isMapReady) return;

    // 85%: view.when готов; 95%: один из слоёв; 100%: оба готовы (контуры + экология)
    if (isOutlineMaskReady && isFeaturesReady) {
      finishLoader();
    } else if (isOutlineMaskReady || isFeaturesReady) {
      bumpProgress(95);
    }
  }, [isMapReady, isOutlineMaskReady, isFeaturesReady, bumpProgress, finishLoader]);

  // Очистка searchValue → зум к выбранному региону/району (selectedSoato), как после фильтра
  useEffect(() => {
    const syncSearchPresence = () => {
      try {
        const raw = localStorage.getItem('searchValue');
        const has = !!(raw && raw.trim() !== '');
        if (prevHadSearchValueRef.current === null) {
          prevHadSearchValueRef.current = has;
          return;
        }
        if (prevHadSearchValueRef.current === true && !has) {
          setSoatoZoomSignal((k) => k + 1);
        }
        prevHadSearchValueRef.current = has;
      } catch {
        prevHadSearchValueRef.current = prevHadSearchValueRef.current ?? false;
      }
    };

    syncSearchPresence();
    window.addEventListener('localStorageChange', syncSearchPresence);
    window.addEventListener('storage', syncSearchPresence);
    const intervalId = window.setInterval(syncSearchPresence, 500);

    return () => {
      window.removeEventListener('localStorageChange', syncSearchPresence);
      window.removeEventListener('storage', syncSearchPresence);
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const initMap = async () => {
      if (!mapViewHostRef.current || !isMounted) return;

      try {
        const mapInitStartedAt = performance.now();
        loaderShownAtRef.current = performance.now();
        setIsLoaderVisible(true);
        setLoadProgress(5);
        setIsOutlineMaskReady(false);
        setIsFeaturesReady(false);
        bumpProgress(10);
        const [Map, MapView] = await loadArcGISJSAPIModules([
          'esri/Map',
          'esri/views/MapView',
        ]);
        bumpProgress(25);

        // Загружаем сохраненный basemap из localStorage
        const savedBasemap = (() => {
          try {
            const saved = localStorage.getItem('hybrid-map-widget-basemap');
            return saved || 'hybrid';
          } catch {
            return 'hybrid';
          }
        })();

        // Создаем карту с базовым слоем
        const map = new Map({
          basemap: savedBasemap,
        });

        mapRef.current = map;

        const initialMinZoom = getMinZoomForBasemap(savedBasemap);

        // Создаем вид карты (контейнер — только mapViewHostRef, без React-оверлеев)
        const view = new MapView({
          container: mapViewHostRef.current,
          map: map,
          center: [64.0, 41.0], // Центр на Узбекистан
          zoom: initialMinZoom,
          ui: {
            components: [] // Убираем дефолтные кнопки зума
          },
          constraints: {
            minZoom: initialMinZoom,
            maxZoom: 20
          }
        });

        viewRef.current = view;

        // Ждем загрузки карты
        await view.when();
        bumpProgress(85);

        // map initialized
        
        // Убеждаемся, что canvas карты скруглен (только внутри хоста вида)
        if (mapViewHostRef.current) {
          const canvas = mapViewHostRef.current.querySelector('canvas');
          if (canvas) {
            canvas.style.borderRadius = '16px';
          }

          const allChildren = mapViewHostRef.current.querySelectorAll('*');
          allChildren.forEach((child: Element) => {
            if (child instanceof HTMLElement) {
              child.style.borderRadius = '16px';
            }
          });
        }
        
        // Загружаем сохраненное состояние ImageService
        if (isMounted && mapRef.current) {
          try {
            const saved = localStorage.getItem('hybrid-map-widget-imageservice');
            if (saved === 'true') {
              const imageServiceInitStartedAt = performance.now();
              const [ImageryLayer] = await loadArcGISJSAPIModules(['esri/layers/ImageryLayer']);
              
              // Получаем локализованное название
              const getImageServiceTitle = () => {
                try {
                  const locale = localStorage.getItem('customLocal') || 'ru';
                  if (locale === 'uz-Cyrl') return 'Картографик асос';
                  if (locale === 'uz-Latn') return 'Kartografik asos';
                  return 'Картографическая основа';
                } catch {
                  return 'Картографическая основа';
                }
              };
              
              const imageServiceLayer = new ImageryLayer({
                url: 'https://sgm.uzspace.uz/image/rest/services/Respublika_maxar_2025_yili/ImageServer',
                opacity: 0.8,
                title: getImageServiceTitle()
              });

              mapRef.current.layers.add(imageServiceLayer, 0);
              imageServiceLayerRef.current = imageServiceLayer;

              // image service restored
            }
          } catch (error) {
            // Silently fail if ImageService can't be initialized
          }
        }
        
        if (isMounted) setIsMapReady(true);
      } catch (error) {
        // Ошибка инициализации обработана
        // В любом случае не держим лоадер бесконечно
        finishLoader();
      }
    };

    initMap();

    return () => {
      isMounted = false;
      
      // Закрываем popup перед cleanup
      setIsPopupOpen(false);
      setPopupProperties(null);
      setPopupPosition(null);
      setIsMapReady(false);
      setLoadProgress(0);
      setIsLoaderVisible(true);
      setIsOutlineMaskReady(false);
      setIsFeaturesReady(false);
      
      // Используем задержку для полного размонтирования React компонентов
      const cleanup = () => {
        // Очищаем view и map
        if (viewRef.current) {
          try {
            if (!viewRef.current.destroyed) {
              // Уничтожаем view - это автоматически очистит контейнер
              viewRef.current.destroy();
            }
          } catch (error) {
            // View уже уничтожен или произошла ошибка
          }
          viewRef.current = null;
        }
        if (imageServiceLayerRef.current) {
          try {
            if (mapRef.current && !mapRef.current.destroyed && mapRef.current.layers) {
              try {
                if (mapRef.current.layers.includes(imageServiceLayerRef.current)) {
                  mapRef.current.layers.remove(imageServiceLayerRef.current);
                }
              } catch (error) {
                // Слой уже удален
              }
            }
            if (imageServiceLayerRef.current && !imageServiceLayerRef.current.destroyed) {
              try {
                imageServiceLayerRef.current.destroy();
              } catch (error) {
                // Слой уже уничтожен
              }
            }
          } catch (error) {
            // Игнорируем ошибки
          }
          imageServiceLayerRef.current = null;
        }
        if (mapRef.current) {
          try {
            if (!mapRef.current.destroyed) {
              mapRef.current.destroy();
            }
          } catch (error) {
            // Map уже уничтожен
          }
          mapRef.current = null;
        }
      };
      
      // Откладываем cleanup, чтобы React успел размонтировать все компоненты
      setTimeout(cleanup, 100);
    };
  }, []);

  const normalizeGuidLike = useCallback((value: any): string => {
    return String(value ?? '').replace(/[{}]/g, '').trim().toUpperCase();
  }, []);

  const fetchApiRecordByUniqueId = useCallback(async (
    uniqueIdRaw: string,
    hints?: GeoJsonDisambiguateHints | null
  ): Promise<any | null> => {
    const uniqueId = normalizeGuidLike(uniqueIdRaw);
    if (!uniqueId) return null;

    const fetchGeoJson = async (withFilters: boolean) => {
      const url = new URL(`${API_BASE_URL}/api/ecology/geojson`);
      if (withFilters) {
        const selectedSoato = localStorage.getItem('selectedSoato');
        if (selectedSoato && selectedSoato !== 'all') {
          const soatoLength = selectedSoato.length;
          if (soatoLength === 4) url.searchParams.append('region', selectedSoato);
          else if (soatoLength === 7) url.searchParams.append('district', selectedSoato);
          else if (soatoLength === 10) url.searchParams.append('mahalla_id', selectedSoato);
        }
        const status = localStorage.getItem('status');
        if (status && !readSelectionIsExclusivelyEtid5()) {
          url.searchParams.append('status', status);
        }
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { accept: 'application/json', 'Content-Type': 'application/json' },
      });
      if (!response.ok) return null;
      return response.json();
    };

    const tryFind = (data: any) => pickMatchingGeoJsonRecord(data, uniqueId, hints ?? undefined);

    try {
      const first = await fetchGeoJson(true);
      const found1 = first ? tryFind(first) : null;
      if (found1) return found1;
      const second = await fetchGeoJson(false);
      const found2 = second ? tryFind(second) : null;
      return found2;
    } catch {
      return null;
    }
  }, [normalizeGuidLike]);

  const handleFeatureClick = useCallback((properties: PolygonProperties, position: { x: number; y: number }) => {
    setPopupProperties(properties);
    setPopupPosition(position);
    setIsPopupOpen(true);

    const uniqueId = normalizeGuidLike(properties?.unique_id);
    if (!uniqueId) return;

    const hints = geoJsonHintsFromPolygon(properties);

    // Атрибуты FeatureServer часто дают даты числом (epoch) — в API /geojson те же записи со строками ISO.
    // Подмешиваем запись с API, чтобы в попапе были актуальные last_edited_date и остальные поля.
    fetchApiRecordByUniqueId(uniqueId, hints)
      .then((record) => {
        if (!record || typeof record !== 'object') return;
        setPopupProperties((prev) => {
          if (!prev) return prev;
          if (normalizeGuidLike(prev?.unique_id) !== uniqueId) return prev;
          return { ...prev, ...record };
        });
      })
      .catch(() => {});
  }, [fetchApiRecordByUniqueId, normalizeGuidLike]);

  const handleClosePopup = useCallback(() => {
    setIsPopupOpen(false);
    setPopupProperties(null);
    setPopupPosition(null);
  }, []);

  const handleEdit = useCallback(async () => {
    if (!popupProperties) return;

    setModalPolygonData(popupProperties);
    setIsModalOpen(true);
  }, [popupProperties]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setModalPolygonData(null);
  }, []);

  const handleDataUpdated = useCallback(() => {
    // После успешного PUT:
    // 1) обновляем статус/поля в popup из API (tekshirish, sana, maydon и т.п.)
    // 2) принудительно ремонтируем FeatureServerLayer, чтобы на следующем клике пришли новые file_path/фото
    (async () => {
      try {
        const uniqueId = normalizeGuidLike(popupProperties?.unique_id ?? modalPolygonData?.unique_id);
        if (uniqueId) {
          const record = await fetchApiRecordByUniqueId(
            uniqueId,
            geoJsonHintsFromPolygon(popupProperties ?? modalPolygonData)
          );
          if (record) {
            setPopupProperties((prev) => (prev ? { ...prev, ...record } : prev));
          }
        }
      } catch {
        // ignore
      } finally {
        // небольшой таймаут: иногда ArcGIS/БД успевают обновиться не мгновенно
        setTimeout(() => setFeatureLayerRefreshKey((k) => k + 1), 400);
      }
    })();
  }, [popupProperties, modalPolygonData, fetchApiRecordByUniqueId, normalizeGuidLike]);

  const handleFeatureZoom = useCallback(async (
    geometry: __esri.Polygon | null,
    options?: { immediate?: boolean; minZoom?: number }
  ) => {
    if (!viewRef.current || !geometry) return;
    if (viewRef.current.destroyed) return;

    const immediate = options?.immediate ?? false;
    const minZoom = options?.minZoom ?? 9;
    const duration = immediate ? 0 : 300;

    try {
      const view = viewRef.current;
      const viewSR = view.spatialReference;
      const viewWkid = viewSR?.wkid ?? 3857;

      let geomToUse = geometry;
      const geomWkid = geometry.spatialReference?.wkid;
      if (geomWkid && geomWkid !== viewWkid) {
        const [projection] = await loadArcGISJSAPIModules(['esri/geometry/projection']);
        await projection.load();
        geomToUse = projection.project(geometry, viewSR) as __esri.Polygon;
      }

      const [Extent] = await loadArcGISJSAPIModules(['esri/geometry/Extent']);

      const extent = geomToUse.extent;
      if (!extent || !isFinite(extent.xmin) || !isFinite(extent.ymax)) return;
      const maxMercator = 20037508;
      if (Math.abs(extent.xmin) > maxMercator || Math.abs(extent.xmax) > maxMercator ||
          Math.abs(extent.ymin) > maxMercator || Math.abs(extent.ymax) > maxMercator) return;

      const center = extent.center;
      if (!center || !isFinite(center.x) || !isFinite(center.y)) return;

      // goTo(polygon) при katta masshtabda ko‘pincha zoom qilmaydi — poligon allaqachon ko‘rinadigan
      // extent ichida. Har doim poligon atrofida qisqa kvadrat extent + padding bilan reframing.
      const w = extent.width;
      const h = extent.height;
      const baseSpan = Math.max(w, h, 1e-6);
      const paddedSpan = Math.max(baseSpan * 1.38, baseSpan + 220);
      const half = paddedSpan / 2;
      const targetExtent = new Extent({
        xmin: center.x - half,
        xmax: center.x + half,
        ymin: center.y - half,
        ymax: center.y + half,
        spatialReference: extent.spatialReference,
      });

      await view.goTo(
        { target: targetExtent, padding: 56 },
        { duration, ...(immediate ? ({ animate: false } as object) : {}) }
      );

      if (view && !view.destroyed && (view.zoom ?? 0) < minZoom) {
        await view.goTo({ zoom: minZoom, center }, { duration: immediate ? 0 : 200 });
      }
    } catch (_error) {
      // view:goto-interrupted — штатное прерывание анимации, не логируем
    }
  }, []);

  // Эффект для зума к полигону при монтировании, если есть selectedId в localStorage
  useEffect(() => {
    if (!isMapReady || !viewRef.current) return;

    let isMounted = true;
    const attemptCountRef = { current: new Map<string, number>() };

    const zoomToSelectedPolygon = async () => {
      const selectedId = localStorage.getItem('selectedId');
      if (!selectedId) return;
      if (selectedId === lastProcessedSelectedIdRef.current) return;
      lastProcessedSelectedIdRef.current = selectedId;

      let didSucceed = false;
      try {
        const cleanId = selectedId.trim().replace(/^[{]+|}+$/g, '');
        const idWithBraces = cleanId ? `{${cleanId}}` : selectedId.trim();

        if (!isMounted || !viewRef.current) return;

        // stop infinite spam if not found
        const attempts = (attemptCountRef.current.get(selectedId) ?? 0) + 1;
        attemptCountRef.current.set(selectedId, attempts);
        if (attempts > 12) {
          localStorage.removeItem('selectedId');
          lastProcessedSelectedIdRef.current = null;
          return;
        }

        const [FeatureLayer, SpatialReference] = await loadArcGISJSAPIModules([
          'esri/layers/FeatureLayer',
          'esri/geometry/SpatialReference'
        ]);

        const sr = new SpatialReference({ wkid: 3857 });

        const layer = new FeatureLayer({
          url: 'https://sgm.uzspace.uz/server/rest/services/ecology_database/FeatureServer/0',
          outFields: [],
        });

        try {
          await layer.load();
        } catch {
          return;
        }

        const fields = (layer.fields || []) as __esri.Field[];
        const fieldByType = (typeName: string) =>
          fields.find((f) => String((f as any).type || '').toLowerCase() === typeName.toLowerCase())?.name;
        const fieldByName = (names: string[]) =>
          fields.find((f) => names.includes(String(f.name || '').toLowerCase()))?.name;

        const globalIdField =
          fieldByType('esriFieldTypeGlobalID') ||
          fieldByName(['globalid', 'global_id']);
        const uniqueIdField = fieldByName(['unique_id', 'uniqueid', 'uniqueid_']);
        const gidField = fieldByName(['gid', 'id', 'objectid', String(layer.objectIdField || '').toLowerCase()]);

        let geom: __esri.Polygon | null = null;

        const noDash = cleanId.replace(/-/g, '');
        const noDashWithBraces = noDash ? `{${noDash}}` : '';
        const gidCandidates = Array.from(new Set([
          idWithBraces,
          cleanId,
          idWithBraces.toUpperCase(),
          cleanId.toUpperCase(),
          idWithBraces.toLowerCase(),
          cleanId.toLowerCase(),
          noDash,
          noDash.toUpperCase(),
          noDash.toLowerCase(),
          noDashWithBraces,
          noDashWithBraces.toUpperCase(),
          noDashWithBraces.toLowerCase(),
        ])).filter(Boolean);

        // 1) Сначала unique_id (selectedId), при необходимости — GlobalID (ArcGIS)
        const idFieldsToTry = [uniqueIdField, globalIdField].filter(Boolean) as string[];
        for (const idField of idFieldsToTry) {
          if (geom) break;

          // для unique_id чаще всего хранится GUID без {}
          const candidates =
            idField === uniqueIdField
              ? Array.from(new Set([cleanId, cleanId.toLowerCase(), cleanId.toUpperCase(), noDash, noDash.toLowerCase(), noDash.toUpperCase()])).filter(Boolean)
              : gidCandidates;

          for (const gid of candidates) {
            if (geom) break;
            const escaped = gid.replace(/'/g, "''");
            const where = `${idField}='${escaped}'`;
            const featureSet = await layer.queryFeatures({
              where,
              returnGeometry: true,
              outFields: [],
              outSpatialReference: sr,
              num: 1,
            } as any);

            const candidateGeom = featureSet?.features?.[0]?.geometry as __esri.Polygon | undefined;
            if (candidateGeom) {
              geom = candidateGeom;
              break;
            }
          }
        }

        // 2) fallback: если в selectedId пришёл числовой id — ищем по gid/objectid
        if (!geom && gidField) {
          // только если это действительно числовой id (без дефисов/hex)
          const isPureNumber = /^[0-9]+$/.test(cleanId);
          const numericId = isPureNumber ? Number(cleanId) : NaN;
          if (isPureNumber && Number.isFinite(numericId) && numericId > 0) {
            const where = `${gidField} = ${numericId}`;
            const featureSet = await layer.queryFeatures({
              where,
              returnGeometry: true,
              outFields: [],
              outSpatialReference: sr,
              num: 1,
            } as any);
            const candidate = featureSet?.features?.[0]?.geometry as __esri.Polygon | undefined;
            if (candidate) {
              geom = candidate;
            }
          }
        }

        // 3) если ничего не нашли — позволяем ретрай (но с лимитом попыток)
        if (!geom || !isMounted || !viewRef.current) {
          lastProcessedSelectedIdRef.current = null;
          return;
        }

        await handleFeatureZoom(geom, { immediate: true, minZoom: 14 });
        localStorage.removeItem('selectedId');
        didSucceed = true;
      } catch (error: any) {
        if ((error as Error).name === 'AbortError') return;
        lastProcessedSelectedIdRef.current = null;
      } finally {
        if (didSucceed) lastProcessedSelectedIdRef.current = null;
      }
    };

    const timeoutId = setTimeout(() => { if (isMounted) zoomToSelectedPolygon(); }, 100);

    const pollInterval = setInterval(() => {
      if (!isMounted || !viewRef.current) return;
      const currentId = localStorage.getItem('selectedId');
      if (currentId && currentId !== lastProcessedSelectedIdRef.current) {
        zoomToSelectedPolygon();
      }
    }, 600);

    const onSelectedIdChanged = () => {
      if (isMounted && viewRef.current && localStorage.getItem('selectedId')) {
        zoomToSelectedPolygon();
      }
    };
    window.addEventListener('selectedIdChanged', onSelectedIdChanged);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      clearInterval(pollInterval);
      window.removeEventListener('selectedIdChanged', onSelectedIdChanged);
    };
  }, [isMapReady, handleFeatureZoom]);

  const handleZoomIn = useCallback(async () => {
    if (!viewRef.current) return;

    const currentZoom = viewRef.current.zoom ?? 5;
    const maxZoom = viewRef.current.constraints?.maxZoom ?? 20;
    const targetZoom = Math.min(maxZoom, currentZoom + 1);

    try {
      await viewRef.current.goTo({ zoom: targetZoom }, {
        duration: 600,
        easing: 'ease-out'
      });
    } catch (error) {
      // Игнорируем ошибки
    }
  }, []);

  const handleZoomOut = useCallback(async () => {
    if (!viewRef.current) return;

    const currentZoom = viewRef.current.zoom ?? 5;
    const minZoom = viewRef.current.constraints?.minZoom ?? 5;
    const targetZoom = Math.max(minZoom, currentZoom - 1);

    try {
      await viewRef.current.goTo({ zoom: targetZoom }, {
        duration: 600,
        easing: 'ease-out'
      });
    } catch (error) {
      // Игнорируем ошибки
    }
  }, []);

  const handleBasemapChange = useCallback(async (basemapId: string) => {
    if (!mapRef.current) return;

    try {
      const [Basemap] = await loadArcGISJSAPIModules(['esri/Basemap']);
      const basemap = Basemap.fromId(basemapId);
      await basemap.load();
      mapRef.current.basemap = basemap;
      setCurrentBasemap(basemapId);

      const view = viewRef.current;
      if (view && !view.destroyed) {
        const minZ = isMapFullscreen
          ? getMinZoomForBasemapFullscreen(basemapId)
          : getMinZoomForBasemap(basemapId);
        view.constraints.minZoom = minZ;
        if ((view.zoom ?? minZ) < minZ) {
          try {
            await view.goTo({ zoom: minZ }, { duration: 200, easing: 'ease-out' });
          } catch {
            // goto-interrupted
          }
        }
      }

      // Сохраняем в localStorage
      try {
        localStorage.setItem('hybrid-map-widget-basemap', basemapId);
      } catch (error) {
        // Игнорируем ошибки localStorage
      }
    } catch (error) {
      // Игнорируем ошибки
    }
  }, [isMapFullscreen]);

  const handleToggleImageService = useCallback(async (enabled: boolean) => {
    if (!mapRef.current) return;

    try {
      if (enabled) {
        // Add ImageService layer if not already added
        if (!imageServiceLayerRef.current) {
          const imageServiceInitStartedAt = performance.now();
          const [ImageryLayer] = await loadArcGISJSAPIModules(['esri/layers/ImageryLayer']);
          
          // Получаем локализованное название
          const getImageServiceTitle = () => {
            try {
              const locale = localStorage.getItem('customLocal') || 'ru';
              if (locale === 'uz-Cyrl') return 'Картографик асос';
              if (locale === 'uz-Latn') return 'Kartografik asos';
              return 'Картографическая основа';
            } catch {
              return 'Картографическая основа';
            }
          };
          
          const imageServiceLayer = new ImageryLayer({
            url: 'https://sgm.uzspace.uz/image/rest/services/Respublika_maxar_2025_yili/ImageServer',
            opacity: 0.8,
            title: getImageServiceTitle()
          });

          // Add layer at index 0 (on top of basemap but below other layers)
          mapRef.current.layers.add(imageServiceLayer, 0);
          imageServiceLayerRef.current = imageServiceLayer;

          // image service enabled
        } else {
          // Show existing layer
          imageServiceLayerRef.current.visible = true;

          // image service visible
        }
      } else {
        // Hide layer
        if (imageServiceLayerRef.current) {
          imageServiceLayerRef.current.visible = false;

          // image service hidden
        }
      }
    } catch (error) {
      // image service toggle error ignored
    }
  }, []);

  const isLoading = isLoaderVisible;

  return (
    <div className="hybrid-map-widget" data-widget-id={id}>
      <div ref={mapContainerRef} className="hybrid-map-container" style={{ position: 'relative' }}>
        <div ref={mapViewHostRef} className="hybrid-map-view-host" />
        <MapLoader visible={isLoading} progress={loadProgress} />
        <PolygonPopup
          isOpen={isPopupOpen}
          onClose={handleClosePopup}
          properties={popupProperties}
          position={popupPosition}
          containerRef={mapContainerRef}
          onEdit={handleEdit}
        />
        {isMapReady && (
          <React.Fragment>
            <BasemapGallery 
              onChangeBasemap={handleBasemapChange}
              currentBasemap={currentBasemap}
              onToggleImageService={handleToggleImageService}
            />
            <ZoomControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} />
            <FullscreenControl
              containerRef={mapContainerRef}
              viewRef={viewRef}
              minZoomNotFullscreen={getMinZoomForBasemap(currentBasemap)}
              minZoomFullscreen={getMinZoomForBasemapFullscreen(currentBasemap)}
            />
            <Legend />
          </React.Fragment>
        )}
        <div
          className="hybrid-map-modal-root"
          ref={setMapModalPortalRoot}
          aria-hidden={!isModalOpen}
        />
      </div>
      {isMapReady && (
        <React.Fragment>
          <MapWmsMask
            map={mapRef.current}
            view={viewRef.current}
            isMapReady={isMapReady}
            onLayerLoaded={() => {
              setIsOutlineMaskReady(true);
              bumpProgress(92);
            }}
          />
          <MapZoom
            map={mapRef.current}
            view={viewRef.current}
            isMapReady={isMapReady}
            soatoZoomSignal={soatoZoomSignal}
          />
          <FeatureServerLayer
            key={featureLayerRefreshKey}
            map={mapRef.current}
            view={viewRef.current}
            isMapReady={isMapReady}
            onFeatureClick={handleFeatureClick}
            onFeatureZoom={handleFeatureZoom}
            onLayerLoaded={() => {
              setIsFeaturesReady(true);
              bumpProgress(92);
            }}
          />
        </React.Fragment>
      )}
      <CustomModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        polygonData={modalPolygonData}
        onDataUpdated={handleDataUpdated}
        mapPortalRoot={isMapFullscreen ? mapModalPortalRoot ?? undefined : undefined}
      />
    </div>
  );
};

export default Widget;
import { RefObject } from 'react';
import { MAP_DEFAULT_VIEW } from '../../constants';
import { smoothEasing, createDefaultMockSymbol, createActiveMockSymbol } from '../../utils/symbols';
import { getDistrictName } from '../../utils/district-lookup';
import { PolygonData } from '../types';
import regionsData from '../../../../regions.json';

export const setupClickHandler = (
  viewRef: RefObject<__esri.MapView | null>,
  ecologyLayerRef: RefObject<__esri.GraphicsLayer | null>,
  mapRef: RefObject<HTMLDivElement>,
  geometryModulesRef: RefObject<any>,
  symbolCacheRef: RefObject<Map<string, any>>,
  onShowPopup: (data: PolygonData, position: { x: number; y: number }) => void,
  isProcessingClickRef: RefObject<boolean>,
  clickDebounceRef: RefObject<NodeJS.Timeout | null>,
  lastClickedGidRef: RefObject<number | string | null>,
  isAnimatingRef: RefObject<boolean>
): __esri.Handle | null => {
  if (!viewRef.current || !ecologyLayerRef.current) return null;

  const view = viewRef.current;
  
  return view.on('click', async (event) => {
    if (isProcessingClickRef.current) return;

    if (clickDebounceRef.current) {
      clearTimeout(clickDebounceRef.current);
    }

    // Оптимизированный debounce - увеличен до 150ms для лучшей производительности
    clickDebounceRef.current = setTimeout(async () => {
      isProcessingClickRef.current = true;
      
      const safetyTimeout = setTimeout(() => {
        if (isProcessingClickRef.current) {
          isProcessingClickRef.current = false;
        }
      }, 3000);
      
      try {
        if (!viewRef.current) {
          clearTimeout(safetyTimeout);
          isProcessingClickRef.current = false;
          return;
        }
        
        const hit = await viewRef.current.hitTest(event);
        
        const ecologyHit = hit.results?.find((r: any) => 
          r.graphic?.attributes?.__ecology
        ) as any;
        
        if (!ecologyHit?.graphic?.geometry) {
          clearTimeout(safetyTimeout);
          isProcessingClickRef.current = false;
          return;
        }

        const attributes = ecologyHit.graphic.attributes;
        const props = attributes.properties || {};
        
        const clickedGid = props.gid;
        const clickedPolygonType = props.tur ?? props.type ?? null;

        const mapContainer = mapRef.current;
        if (!mapContainer) {
          clearTimeout(safetyTimeout);
          isProcessingClickRef.current = false;
          return;
        }

        const mapPoint = event.mapPoint;
        const screenPoint = viewRef.current.toScreen(mapPoint);
        const rect = mapContainer.getBoundingClientRect();
        const x = screenPoint.x - rect.left;
        const y = screenPoint.y - rect.top;
        
        const regionCode = props.region ? String(props.region) : null;
        const regionInfo = regionCode ? regionsData.find(r => r.region_soato === regionCode) : null;
        const currentLocale = localStorage.getItem('customLocal') || 'ru';
        const localeKey = currentLocale === 'uz-Cyrl' ? 'uz-Cyrl' : currentLocale === 'uz-Latn' ? 'uz-Latn' : 'ru';
        
        let processedGlobalId = '';
        if (props.globalid) {
          const globalidStr = String(props.globalid);
          processedGlobalId = globalidStr.startsWith('{') && globalidStr.endsWith('}') 
            ? globalidStr 
            : `{${globalidStr}}`;
        } else if (props.GlobalID) {
          const globalidStr = String(props.GlobalID);
          processedGlobalId = globalidStr.startsWith('{') && globalidStr.endsWith('}') 
            ? globalidStr 
            : `{${globalidStr}}`;
        } else if (props.gid) {
          processedGlobalId = `{${props.gid}}`;
        }
        
        const basePolygonData: PolygonData = {
          viloyat: regionInfo ? regionInfo[localeKey] : props.viloyat || '',
          tuman: props.tuman || '',
          mfy: props.mfy || '',
          maydon: props.maydon ?? 0,
          tur: props.tur || '',
          latitude: props.latitude ? parseFloat(String(props.latitude)) : undefined,
          longitude: props.longitude ? parseFloat(String(props.longitude)) : undefined,
          yil: props.sana || props.yil || '',
          'Yer toifa': props.yer_toifa || props['Yer toifa'] || '',
          natija: props.natija || '',
          GlobalID: processedGlobalId,
          Inspektor: props.Inspektor || props.tekshirish || '',
          Jarima_qollanildi: props.Jarima_qollanildi || '',
          Hisoblangan_zarar: props.Hisoblangan_zarar || '',
          Holat_bartaraf_etildi: props.Holat_bartaraf_etildi || '',
          buzilish: props.buzilish || '',
          Tekshiruv_natijasi: props.Tekshiruv_natijasi || props.tekshirish || '',
          gid: props.gid != null ? Number(props.gid) : undefined,
          globalid: props.globalid || processedGlobalId.replace(/[{}]/g, ''),
          sana: props.sana,
          yer_toifa: props.yer_toifa,
          district: props.district,
          region: props.region,
          mahalla_id: props.mahalla_id,
          tekshirish: props.tekshirish
        };
        
        onShowPopup(basePolygonData, { x, y });
        
        // Асинхронное получение названия района
        if (props.district) {
          getDistrictName(String(props.district), localeKey).then(districtName => {
            if (districtName) {
              const updatedData: PolygonData = {
                ...basePolygonData,
                tuman: districtName
              };
              onShowPopup(updatedData, { x, y });
            }
          }).catch(() => {});
        }
        
        // Используем requestAnimationFrame для обновления символов с оптимизацией
        requestAnimationFrame(() => {
          try {
            if (ecologyLayerRef.current && viewRef.current) {
              const currentZoom = viewRef.current.zoom || MAP_DEFAULT_VIEW.zoom;
              let combinedExtent: __esri.Extent | null = null;
              
              // Оптимизированное обновление символов - батчами для лучшей производительности
              const graphics = ecologyLayerRef.current.graphics.toArray();
              const BATCH_SIZE = 100;
              
              const updateSymbolsBatch = (startIndex: number) => {
                const endIndex = Math.min(startIndex + BATCH_SIZE, graphics.length);
                
                for (let i = startIndex; i < endIndex; i++) {
                  const g = graphics[i];
                  if (g.attributes?.__ecology) {
                    const gProps = g.attributes.properties || {};
                    const gGid = gProps.gid;
                    const polygonType = gProps.tur ?? gProps.type ?? null;
                    
                    const shouldHighlight = clickedGid != null && 
                      (gGid === clickedGid || String(gGid) === String(clickedGid));
                    
                    if (shouldHighlight) {
                      g.symbol = createActiveMockSymbol(polygonType);
                      
                      if (g.geometry) {
                        const polyExtent = (g.geometry as __esri.Polygon).extent;
                        if (polyExtent) {
                          combinedExtent = combinedExtent ? combinedExtent.union(polyExtent) : polyExtent;
                        }
                      }
                    } else {
                      g.symbol = createDefaultMockSymbol(currentZoom, symbolCacheRef.current, polygonType);
                    }
                  }
                }
                
                // Продолжаем обработку следующего батча если есть еще graphics
                if (endIndex < graphics.length) {
                  requestAnimationFrame(() => updateSymbolsBatch(endIndex));
                } else {
                  // Все graphics обработаны, делаем zoom
                  const isNewPolygon = lastClickedGidRef.current !== clickedGid;
                  
                  if ((combinedExtent || ecologyHit.graphic.geometry) && isNewPolygon && !isAnimatingRef.current) {
                    const extent = combinedExtent || (ecologyHit.graphic.geometry as __esri.Polygon).extent;
                    if (extent && viewRef.current) {
                      isAnimatingRef.current = true;
                      lastClickedGidRef.current = clickedGid;
                      
                      viewRef.current.goTo(extent.expand(1.2), {
                        duration: 1000,
                        easing: smoothEasing
                      }).then(() => {
                        isAnimatingRef.current = false;
                      }).catch(() => {
                        isAnimatingRef.current = false;
                      });
                    }
                  } else if (isNewPolygon) {
                    lastClickedGidRef.current = clickedGid;
                  }
                  
                  clearTimeout(safetyTimeout);
                  isProcessingClickRef.current = false;
                }
              };
              
              // Начинаем обработку с первого батча
              updateSymbolsBatch(0);
            } else {
              clearTimeout(safetyTimeout);
              isProcessingClickRef.current = false;
            }
          } catch {
            clearTimeout(safetyTimeout);
            isProcessingClickRef.current = false;
          }
        });
      } catch {
        clearTimeout(safetyTimeout);
        isProcessingClickRef.current = false;
      }
    }, 150);
  });
};


import { RefObject } from 'react';
import { MAP_DEFAULT_VIEW } from '../../constants';
import { smoothEasing, createDefaultMockSymbol, createActiveMockSymbol } from '../../utils/symbols';

const normalizeGlobalId = (gid: string): string => {
  return gid.replace(/[{}]/g, '').toUpperCase();
};

export const zoomToPolygonByGlobalId = async (
  viewRef: RefObject<__esri.MapView | null>,
  ecologyLayerRef: RefObject<__esri.GraphicsLayer | null>,
  geometryModulesRef: RefObject<any>,
  symbolCacheRef: RefObject<Map<string, any>>
): Promise<void> => {
  if (!viewRef.current || !ecologyLayerRef.current) return;

  const selectedId = localStorage.getItem('selectedId');
  if (!selectedId) return;

  const selectedIdWithBraces = selectedId.startsWith('{') && selectedId.endsWith('}') 
    ? selectedId 
    : `{${selectedId}}`;
  const normalizedSelectedId = normalizeGlobalId(selectedId);

  if (!ecologyLayerRef.current || !viewRef.current) return;

  let foundGraphic: __esri.Graphic | null = null;
  let combinedExtent: __esri.Extent | null = null;

  ecologyLayerRef.current.graphics.forEach(g => {
    if (g.attributes?.__ecology) {
      const props = g.attributes.properties || {};
      
      const gid = props.gid;
      if (gid != null) {
        const gidString = String(gid).toUpperCase();
        if (gidString === normalizedSelectedId) {
          foundGraphic = g;
          
          if (g.geometry) {
            const polyExtent = (g.geometry as __esri.Polygon).extent;
            if (polyExtent) {
              combinedExtent = combinedExtent ? combinedExtent.union(polyExtent) : polyExtent;
            }
          }
        }
      }

      const globalId = props.GlobalID || props.globalid;
      if (globalId) {
        const globalIdString = String(globalId);
        const normalizedGlobalId = normalizeGlobalId(globalIdString);
        
        const matchesWithBraces = globalIdString === selectedIdWithBraces || globalIdString.toUpperCase() === selectedIdWithBraces.toUpperCase();
        const matchesWithoutBraces = normalizedGlobalId === normalizedSelectedId;
        
        if (matchesWithBraces || matchesWithoutBraces) {
          if (!foundGraphic) foundGraphic = g;
          
          if (g.geometry) {
            const polyExtent = (g.geometry as __esri.Polygon).extent;
            if (polyExtent) {
              combinedExtent = combinedExtent ? combinedExtent.union(polyExtent) : polyExtent;
            }
          }
        }
      }
    }
  });

  if (foundGraphic && combinedExtent) {
    const currentZoom = viewRef.current.zoom || MAP_DEFAULT_VIEW.zoom;
    
    // Обновляем символы
    ecologyLayerRef.current.graphics.forEach(g => {
      if (g.attributes?.__ecology) {
        const props = g.attributes.properties || {};
        const polygonType = props.tur ?? props.type ?? null;
        
        const gid = props.gid;
        const globalId = props.GlobalID || props.globalid;
        
        let matches = false;
        if (gid != null) {
          const gidString = String(gid).toUpperCase();
          if (gidString === normalizedSelectedId) matches = true;
        }
        if (!matches && globalId) {
          const globalIdString = String(globalId);
          const normalizedGlobalId = normalizeGlobalId(globalIdString);
          const matchesWithBraces = globalIdString === selectedIdWithBraces || globalIdString.toUpperCase() === selectedIdWithBraces.toUpperCase();
          const matchesWithoutBraces = normalizedGlobalId === normalizedSelectedId;
          if (matchesWithBraces || matchesWithoutBraces) matches = true;
        }

        g.symbol = matches 
          ? createActiveMockSymbol(polygonType)
          : createDefaultMockSymbol(currentZoom, symbolCacheRef.current, polygonType);
      }
    });

    try {
      await viewRef.current.goTo(combinedExtent.expand(1.2), {
        duration: 1000,
        easing: smoothEasing
      });
    } catch {
      // Ignore errors
    }
  }
};


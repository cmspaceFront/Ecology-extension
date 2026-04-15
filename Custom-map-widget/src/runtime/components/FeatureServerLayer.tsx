/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useEffect, useRef } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';

import { PolygonProperties } from './PolygonPopup';
import { useCombinedFiltersWhere } from './GeoServerLayerFilters';
import { createEcologyFeatureRenderer } from './ecologyFeatureRenderer';

export interface FeatureServerLayerProps {
  map: __esri.Map | null;
  view: __esri.MapView | null;
  isMapReady: boolean;
  onFeatureClick?: (properties: PolygonProperties, position: { x: number; y: number }) => void;
  onFeatureZoom?: (geometry: __esri.Polygon | null) => void | Promise<void>;
  onLayerLoaded?: () => void;
}

/**
 * Слой полигонов из ArcGIS FeatureServer вместо GeoServer WMS.
 */
const FeatureServerLayer = ({
  map,
  view,
  isMapReady,
  onFeatureClick,
  onFeatureZoom,
  onLayerLoaded,
}: FeatureServerLayerProps) => {
  const layerRef = useRef<__esri.FeatureLayer | null>(null);
  const layerViewRef = useRef<__esri.FeatureLayerView | null>(null);
  const clickHandleRef = useRef<__esri.Handle | null>(null);
  const whereClause = useCombinedFiltersWhere();

  const applySelectedFeatureEffect = (objectId: number | null) => {
    const layerView = layerViewRef.current;
    if (!layerView) return;
    try {
      if (objectId == null) {
        layerView.featureEffect = null as any;
        return;
      }
      layerView.featureEffect = {
        filter: { objectIds: [objectId] },
        excludedEffect: 'brightness(78%) opacity(88%)',
      } as any;
    } catch {
      // ignore
    }
  };

  const extractObjectId = (
    layer: __esri.FeatureLayer,
    attributes: PolygonProperties
  ): number | null => {
    const fieldName = layer.objectIdField;
    const candidates = [
      fieldName ? attributes?.[fieldName] : undefined,
      attributes?.objectid,
      attributes?.OBJECTID,
      attributes?.ObjectId,
      attributes?.objectId,
      attributes?.gid,
      attributes?.GID,
    ];
    for (const raw of candidates) {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  // Инициализация FeatureLayer
  useEffect(() => {
    if (!map || !isMapReady) {
      return;
    }

    let isMounted = true;

    const initLayer = async () => {
      try {
        const [FeatureLayer] = await loadArcGISJSAPIModules(['esri/layers/FeatureLayer']);

        if (!isMounted || !map) return;

        // TODO: при необходимости поменять индекс слоя (0, 1, 2...)
        const layer = new FeatureLayer({
          url: 'https://sgm.uzspace.uz/server/rest/services/ecology_database/FeatureServer/0',
          outFields: ['*'],
          definitionExpression: whereClause,
        });

        try {
          layer.renderer = await createEcologyFeatureRenderer();
        } catch (e) {
        // style apply failed
        }

        map.add(layer);
        layerRef.current = layer;

        try {
          await layer.when();
        } catch {
          // ignore
        }
        try {
          if (view && !view.destroyed) {
            const layerView = (await view.whenLayerView(layer)) as __esri.FeatureLayerView;
            layerViewRef.current = layerView;
          }
        } catch {
          // ignore
        }
        try {
          onLayerLoaded?.();
        } catch {
          // ignore
        }
      } catch (error) {
        // ignore init errors
      }
    };

    initLayer();

    return () => {
      isMounted = false;
      if (layerRef.current) {
        try {
          if (map && !map.destroyed) {
            map.remove(layerRef.current);
          }
          if (!layerRef.current.destroyed) {
            layerRef.current.destroy();
          }
        } catch {
          // ignore
        }
        layerRef.current = null;
      }
      layerViewRef.current = null;
    };
  }, [map, view, isMapReady, whereClause]);

  // Обновляем definitionExpression при изменении фильтров
  useEffect(() => {
    if (!layerRef.current) return;
    try {
      layerRef.current.definitionExpression = whereClause || undefined;
    } catch {
      // ignore
    }
  }, [whereClause]);

  // Клик: CIM с обводкой — точка на границе часто не попадает в intersects(point, polygon).
  // Добавляем небольшой buffer вокруг клика (метры), чтобы линия обводки тоже открывала попап и зум.
  useEffect(() => {
    if (!view || !isMapReady) return;

    let isMounted = true;

    if (clickHandleRef.current) {
      try {
        clickHandleRef.current.remove();
      } catch {
        // ignore
      }
      clickHandleRef.current = null;
    }

    try {
      clickHandleRef.current = view.on('click', async (event: __esri.ViewClickEvent) => {
        if (!isMounted || !view || view.destroyed || !layerRef.current) return;

        try {
          const layer = layerRef.current;
          const mapPoint = event.mapPoint;
          if (!mapPoint) {
            applySelectedFeatureEffect(null);
            return;
          }

          const queryOpts: __esri.QueryProperties = {
            geometry: mapPoint,
            distance: 4,
            units: 'meters',
            spatialRelationship: 'intersects',
            returnGeometry: true,
            outFields: ['*'],
          };

          let features: __esri.Graphic[] = [];
          const lv = layerViewRef.current;
          try {
            if (lv && !(lv as any).destroyed) {
              const fr = await lv.queryFeatures(queryOpts);
              features = fr.features || [];
            }
          } catch {
            // ignore
          }
          if (features.length === 0) {
            try {
              const fr = await layer.queryFeatures(queryOpts);
              features = fr.features || [];
            } catch {
              features = [];
            }
          }

          if (features.length === 0) {
            applySelectedFeatureEffect(null);
            return;
          }

          let graphic = features[0];
          if (features.length > 1) {
            try {
              const [geometryEngine] = await loadArcGISJSAPIModules(['esri/geometry/geometryEngine']);
              let bestArea = Infinity;
              for (const f of features) {
                const g = f.geometry as __esri.Polygon;
                if (!g || g.type !== 'polygon') continue;
                const a = Math.abs(geometryEngine.geodesicArea(g, 'square-meters'));
                if (Number.isFinite(a) && a > 0 && a < bestArea) {
                  bestArea = a;
                  graphic = f;
                }
              }
            } catch {
              // оставляем первый
            }
          }

          const attributes = (graphic.attributes || {}) as PolygonProperties;
          const popupPosition = { x: event.x, y: event.y };
          const objectId = extractObjectId(layer, attributes);
          applySelectedFeatureEffect(objectId);

          if (onFeatureClick) {
            onFeatureClick(attributes, popupPosition);
          }

          if (onFeatureZoom && graphic.geometry) {
            const zoomResult = onFeatureZoom(graphic.geometry as __esri.Polygon);
            if (zoomResult && typeof (zoomResult as any).catch === 'function') {
              (zoomResult as Promise<void>).catch(() => {});
            }
          }
        } catch (error) {
          // ignore click errors
        }
      });
    } catch {
      // ignore
    }

    return () => {
      isMounted = false;
      if (clickHandleRef.current) {
        try {
          clickHandleRef.current.remove();
        } catch {
          // ignore
        }
        clickHandleRef.current = null;
      }
      applySelectedFeatureEffect(null);
    };
  }, [view, isMapReady, onFeatureClick, onFeatureZoom]);

  // Компонент сам ничего не рендерит
  return null;
};

export default FeatureServerLayer;


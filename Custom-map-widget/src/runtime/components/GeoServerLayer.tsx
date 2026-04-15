/**
 * TEMP: не подключён в widget.tsx (импорт закомментирован) — WMS GetFeatureInfo к GeoServer отключён.
 */
/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useEffect, useRef, useState, useCallback } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';

import { PolygonProperties } from './PolygonPopup';
import { useCombinedFilters } from './GeoServerLayerFilters';
import { readSelectionIsExclusivelyEtid5 } from './GeoServerLayerTurFilter';
import { useLocale } from './hooks/useLocale';
import { normalizeGuidPlain, pickMatchingGeoJsonRecord } from '../pickMatchingGeoJsonRecord';

export interface GeoServerLayerProps {
  map: __esri.Map | null;
  view: __esri.MapView | null;
  isMapReady: boolean;
  onFeatureClick?: (properties: PolygonProperties, position: { x: number; y: number }) => void;
  onFeatureZoom?: (geometry: __esri.Polygon | null) => void | Promise<void>;
}

/**
 * Функция для генерации SLD стиля для раскраски полигонов
 * 
 * Обводка (stroke) определяется по id_tur:
 * - ETID-1: #00c5ff
 * - ETID-2: #ffaa00
 * - ETID-3: #005ce6
 * - ETID-4: #ff0000
 * - ETID-5: #55ff00
 * 
 * Заливка (fill) определяется по статусу tekshirish:
 * - "1" (tasdiqlangan - подтверждено): #10b981 (Green)
 * - "2" (tasdiqlanmagan - не подтверждено): #ef4444 (Red)
 * - "1" или "2" (tekshirilgan - проверено): #f59e0b (Orange/Yellow)
 * - пусто/null (jarayonda - в процессе): прозрачная заливка (fill-opacity: 0)
 * 
 * Используются масштабные правила для лучшей видимости при отдалении
 */
const generateSLDStyle = (): string => {
  const strokeWidth = '2.67';

  // Цвета для обводки по id_tur
  const borderColors: Record<string, string> = {
    'ETID-1': '#00c5ff',
    'ETID-2': '#ffaa00',
    'ETID-3': '#005ce6',
    'ETID-4': '#ff0000',
    'ETID-5': '#55ff00',
  };

  // Цвета для заливки по статусу
  // Сделаны более прозрачными, чтобы фон карты был виден
  const fillColors: Record<string, { color: string; opacity: string }> = {
    '1': { color: '#3b82f6', opacity: '0.20' }, // tasdiqlangan (Blue) - синий
    '2': { color: '#ef4444', opacity: '0.20' }, // tasdiqlanmagan (Red) - красный
    'tekshirilgan': { color: '#10b981', opacity: '0.20' }, // tekshirilgan (Green) - зеленый
    'none': { color: 'transparent', opacity: '0.20' } // jarayonda (Yellow) - желтый
  };

  // Функция для генерации правила с комбинацией id_tur и tekshirish
  const generateRule = (
    idTur: string,
    borderColor: string,
    statusFilter: string,
    fillColor: string,
    fillOpacity: string,
    scaleName: string,
    minScale?: string,
    maxScale?: string
  ): string => {
    const scaleFilter = minScale 
      ? `<MinScaleDenominator>${minScale}</MinScaleDenominator>`
      : '';
    const maxScaleFilter = maxScale
      ? `<MaxScaleDenominator>${maxScale}</MaxScaleDenominator>`
      : '';

    // Создаем фильтр для статуса
    let statusFilterXml = '';
    if (statusFilter === 'tekshirilgan') {
      // tekshirilgan = "1" OR "2"
      statusFilterXml = `
            <ogc:Or>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsEqualTo>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
                <ogc:Literal>2</ogc:Literal>
              </ogc:PropertyIsEqualTo>
            </ogc:Or>`;
    } else if (statusFilter === 'none') {
      // jarayonda = пусто/null
      statusFilterXml = `
            <ogc:Or>
              <ogc:PropertyIsNull>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
              </ogc:PropertyIsNull>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
                <ogc:Literal></ogc:Literal>
              </ogc:PropertyIsEqualTo>
            </ogc:Or>`;
    } else {
      // tasdiqlangan (1) или tasdiqlanmagan (2)
      statusFilterXml = `
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>tekshirish</ogc:PropertyName>
              <ogc:Literal>${statusFilter}</ogc:Literal>
            </ogc:PropertyIsEqualTo>`;
    }

    return `
        <Rule>
          <Name>${idTur} - ${statusFilter} - ${scaleName}</Name>
          ${scaleFilter}
          ${maxScaleFilter}
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>id_tur</ogc:PropertyName>
                <ogc:Literal>${idTur}</ogc:Literal>
              </ogc:PropertyIsEqualTo>
              ${statusFilterXml}
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">${fillColor}</CssParameter>
              <CssParameter name="fill-opacity">${fillOpacity}</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">${borderColor}</CssParameter>
              <CssParameter name="stroke-width">${strokeWidth}</CssParameter>
              <CssParameter name="stroke-opacity">1.0</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>`;
  };

  // Генерируем правила для каждой комбинации id_tur и статуса
  // ВАЖНО: Порядок правил имеет значение в SLD! Правила применяются сверху вниз
  // Более специфичные правила должны идти первыми
  let rules = '';
  
  // Для каждого id_tur создаем правила для всех статусов и масштабов
  Object.keys(borderColors).forEach(idTur => {
    const borderColor = borderColors[idTur];
    
    // Правила для каждого статуса и масштаба
    // Порядок важен: сначала специфичные правила, затем общие
    
    // jarayonda (none/пусто) - самое специфичное условие (пустое значение)
    rules += generateRule(idTur, borderColor, 'none', fillColors['none'].color, fillColors['none'].opacity, 'Zoomed Out', '1000000');
    rules += generateRule(idTur, borderColor, 'none', fillColors['none'].color, fillColors['none'].opacity, 'Medium Zoom', '100000', '1000000');
    rules += generateRule(idTur, borderColor, 'none', fillColors['none'].color, fillColors['none'].opacity, 'Zoomed In', undefined, '100000');
    
    // tasdiqlangan (1) - специфичное правило для "1"
    rules += generateRule(idTur, borderColor, '1', fillColors['1'].color, fillColors['1'].opacity, 'Zoomed Out', '1000000');
    rules += generateRule(idTur, borderColor, '1', fillColors['1'].color, fillColors['1'].opacity, 'Medium Zoom', '100000', '1000000');
    rules += generateRule(idTur, borderColor, '1', fillColors['1'].color, fillColors['1'].opacity, 'Zoomed In', undefined, '100000');
    
    // tasdiqlanmagan (2) - специфичное правило для "2"
    rules += generateRule(idTur, borderColor, '2', fillColors['2'].color, fillColors['2'].opacity, 'Zoomed Out', '1000000');
    rules += generateRule(idTur, borderColor, '2', fillColors['2'].color, fillColors['2'].opacity, 'Medium Zoom', '100000', '1000000');
    rules += generateRule(idTur, borderColor, '2', fillColors['2'].color, fillColors['2'].opacity, 'Zoomed In', undefined, '100000');
    
    // tekshirilgan (1 OR 2) - это правило будет применяться для любых других значений tekshirish
    // которые не равны "1", "2" или пусто, но на практике tekshirish может быть только "1", "2" или пусто
    // Поэтому это правило может не применяться, но оставляем его для полноты
    rules += generateRule(idTur, borderColor, 'tekshirilgan', fillColors['tekshirilgan'].color, fillColors['tekshirilgan'].opacity, 'Zoomed Out', '1000000');
    rules += generateRule(idTur, borderColor, 'tekshirilgan', fillColors['tekshirilgan'].color, fillColors['tekshirilgan'].opacity, 'Medium Zoom', '100000', '1000000');
    rules += generateRule(idTur, borderColor, 'tekshirilgan', fillColors['tekshirilgan'].color, fillColors['tekshirilgan'].opacity, 'Zoomed In', undefined, '100000');
  });
  
  // Добавляем правила по умолчанию для случаев, когда id_tur не определен
  // Эти правила применяются, если id_tur не равен ни одному из ETID-1, ETID-2, и т.д.
  const defaultBorderColor = '#FF006E'; // Pink по умолчанию
  
  // Правила по умолчанию для каждого статуса (для полигонов без известного id_tur)
  const generateDefaultRule = (
    statusFilter: string,
    fillColor: string,
    fillOpacity: string,
    scaleName: string,
    minScale?: string,
    maxScale?: string
  ): string => {
    const scaleFilter = minScale 
      ? `<MinScaleDenominator>${minScale}</MinScaleDenominator>`
      : '';
    const maxScaleFilter = maxScale
      ? `<MaxScaleDenominator>${maxScale}</MaxScaleDenominator>`
      : '';

    let statusFilterXml = '';
    if (statusFilter === 'tekshirilgan') {
      statusFilterXml = `
            <ogc:Or>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsEqualTo>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
                <ogc:Literal>2</ogc:Literal>
              </ogc:PropertyIsEqualTo>
            </ogc:Or>`;
    } else if (statusFilter === 'none') {
      statusFilterXml = `
            <ogc:Or>
              <ogc:PropertyIsNull>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
              </ogc:PropertyIsNull>
              <ogc:PropertyIsEqualTo>
                <ogc:PropertyName>tekshirish</ogc:PropertyName>
                <ogc:Literal></ogc:Literal>
              </ogc:PropertyIsEqualTo>
            </ogc:Or>`;
    } else {
      statusFilterXml = `
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>tekshirish</ogc:PropertyName>
              <ogc:Literal>${statusFilter}</ogc:Literal>
            </ogc:PropertyIsEqualTo>`;
    }

    return `
        <Rule>
          <Name>Default - ${statusFilter} - ${scaleName}</Name>
          ${scaleFilter}
          ${maxScaleFilter}
          <ogc:Filter>
            <ogc:And>
              <ogc:Or>
                <ogc:PropertyIsNull>
                  <ogc:PropertyName>id_tur</ogc:PropertyName>
                </ogc:PropertyIsNull>
                <ogc:Not>
                  <ogc:Or>
                    <ogc:PropertyIsEqualTo>
                      <ogc:PropertyName>id_tur</ogc:PropertyName>
                      <ogc:Literal>ETID-1</ogc:Literal>
                    </ogc:PropertyIsEqualTo>
                    <ogc:PropertyIsEqualTo>
                      <ogc:PropertyName>id_tur</ogc:PropertyName>
                      <ogc:Literal>ETID-2</ogc:Literal>
                    </ogc:PropertyIsEqualTo>
                    <ogc:PropertyIsEqualTo>
                      <ogc:PropertyName>id_tur</ogc:PropertyName>
                      <ogc:Literal>ETID-3</ogc:Literal>
                    </ogc:PropertyIsEqualTo>
                    <ogc:PropertyIsEqualTo>
                      <ogc:PropertyName>id_tur</ogc:PropertyName>
                      <ogc:Literal>ETID-4</ogc:Literal>
                    </ogc:PropertyIsEqualTo>
                    <ogc:PropertyIsEqualTo>
                      <ogc:PropertyName>id_tur</ogc:PropertyName>
                      <ogc:Literal>ETID-5</ogc:Literal>
                    </ogc:PropertyIsEqualTo>
                  </ogc:Or>
                </ogc:Not>
              </ogc:Or>
              ${statusFilterXml}
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">${fillColor}</CssParameter>
              <CssParameter name="fill-opacity">${fillOpacity}</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">${defaultBorderColor}</CssParameter>
              <CssParameter name="stroke-width">${strokeWidth}</CssParameter>
              <CssParameter name="stroke-opacity">1.0</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>`;
  };
  
  // Правила по умолчанию для случаев без id_tur или с неизвестным id_tur
  rules += generateDefaultRule('none', fillColors['none'].color, fillColors['none'].opacity, 'Zoomed Out', '1000000');
  rules += generateDefaultRule('none', fillColors['none'].color, fillColors['none'].opacity, 'Medium Zoom', '100000', '1000000');
  rules += generateDefaultRule('none', fillColors['none'].color, fillColors['none'].opacity, 'Zoomed In', undefined, '100000');
  
  rules += generateDefaultRule('1', fillColors['1'].color, fillColors['1'].opacity, 'Zoomed Out', '1000000');
  rules += generateDefaultRule('1', fillColors['1'].color, fillColors['1'].opacity, 'Medium Zoom', '100000', '1000000');
  rules += generateDefaultRule('1', fillColors['1'].color, fillColors['1'].opacity, 'Zoomed In', undefined, '100000');
  
  rules += generateDefaultRule('2', fillColors['2'].color, fillColors['2'].opacity, 'Zoomed Out', '1000000');
  rules += generateDefaultRule('2', fillColors['2'].color, fillColors['2'].opacity, 'Medium Zoom', '100000', '1000000');
  rules += generateDefaultRule('2', fillColors['2'].color, fillColors['2'].opacity, 'Zoomed In', undefined, '100000');
  
  rules += generateDefaultRule('tekshirilgan', fillColors['tekshirilgan'].color, fillColors['tekshirilgan'].opacity, 'Zoomed Out', '1000000');
  rules += generateDefaultRule('tekshirilgan', fillColors['tekshirilgan'].color, fillColors['tekshirilgan'].opacity, 'Medium Zoom', '100000', '1000000');
  rules += generateDefaultRule('tekshirilgan', fillColors['tekshirilgan'].color, fillColors['tekshirilgan'].opacity, 'Zoomed In', undefined, '100000');
  
  // Финальное правило по умолчанию для всех остальных случаев
  rules += `
        <!-- Default - Zoomed Out -->
        <Rule>
          <Name>Default - Zoomed Out</Name>
          <MinScaleDenominator>1000000</MinScaleDenominator>
          <ElseFilter/>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#FF006E</CssParameter>
              <CssParameter name="fill-opacity">0.0</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">#FF006E</CssParameter>
              <CssParameter name="stroke-width">${strokeWidth}</CssParameter>
              <CssParameter name="stroke-opacity">1.0</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>
        <!-- Default - Medium Zoom -->
        <Rule>
          <Name>Default - Medium Zoom</Name>
          <MinScaleDenominator>100000</MinScaleDenominator>
          <MaxScaleDenominator>1000000</MaxScaleDenominator>
          <ElseFilter/>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#FF006E</CssParameter>
              <CssParameter name="fill-opacity">0.0</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">#FF006E</CssParameter>
              <CssParameter name="stroke-width">${strokeWidth}</CssParameter>
              <CssParameter name="stroke-opacity">1.0</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>
        <!-- Default - Zoomed In -->
        <Rule>
          <Name>Default - Zoomed In</Name>
          <MaxScaleDenominator>100000</MaxScaleDenominator>
          <ElseFilter/>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#FF006E</CssParameter>
              <CssParameter name="fill-opacity">0.0</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">#FF006E</CssParameter>
              <CssParameter name="stroke-width">${strokeWidth}</CssParameter>
              <CssParameter name="stroke-opacity">1.0</CssParameter>
            </Stroke>
          </PolygonSymbolizer>
        </Rule>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>ecology_main</Name>
    <UserStyle>
      <Name>PolygonStyle</Name>
      <FeatureTypeStyle>
        ${rules}
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`;
};

/**
 * Компонент для отображения полигонов из GeoServer через WMS слой
 */
const GeoServerLayer = ({ map, view, isMapReady, onFeatureClick, onFeatureZoom }: GeoServerLayerProps) => {
  const { t } = useLocale();
  const wmsLayerRef = useRef<__esri.WMSLayer | null>(null);
  const clickHandleRef = useRef<__esri.Handle | null>(null);
  const [isLayerInitialized, setIsLayerInitialized] = useState(false);
  const customParameters = useCombinedFilters();
  const previousCustomParametersRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!map || !isMapReady) {
      // Карта еще не готова, слой GeoServer не инициализируем
      return;
    }

    // Сравниваем текущие параметры с предыдущими, чтобы избежать лишних пересозданий
    const currentParamsString = JSON.stringify(customParameters);
    if (currentParamsString === previousCustomParametersRef.current && wmsLayerRef.current) {
      // Параметры не изменились, обновляем только customParameters существующего слоя
      if (wmsLayerRef.current && !wmsLayerRef.current.destroyed) {
        try {
          const sldStyle = generateSLDStyle();
          const finalCustomParameters: Record<string, string> = {
            SLD_BODY: sldStyle,
            ...(customParameters || {})
          };
          // Обновляем параметры слоя без пересоздания
          wmsLayerRef.current.customParameters = finalCustomParameters;
          previousCustomParametersRef.current = currentParamsString;
          return;
        } catch (error) {
          // Если не удалось обновить, пересоздаем слой
        }
      }
    }

    let isMounted = true;

    const initWMSLayer = async () => {
      const initStartedAt = performance.now();
      try {
        const [WMSLayer] = await loadArcGISJSAPIModules(['esri/layers/WMSLayer']);

        // Проверяем еще раз после загрузки модулей
        if (!isMounted || !map) {
          return;
        }

        // Удаляем старый слой, если он существует
        if (wmsLayerRef.current) {
          try {
            // Проверяем, что map и layers существуют и не уничтожены
            if (map && !map.destroyed && map.layers) {
              try {
                // Проверяем, что слой действительно в коллекции перед удалением
                if (map.layers.includes(wmsLayerRef.current)) {
                  map.layers.remove(wmsLayerRef.current);
                }
              } catch (error) {
                // Слой уже удален или произошла ошибка
              }
            }
            // Уничтожаем слой, если он еще существует
            if (wmsLayerRef.current && !wmsLayerRef.current.destroyed) {
              try {
                wmsLayerRef.current.destroy();
              } catch (error) {
                // Слой уже уничтожен
              }
            }
          } catch (error) {
            // Игнорируем ошибки при удалении старого слоя
          }
          wmsLayerRef.current = null;
        }

        // Используем объединенные фильтры из хука
        // Генерируем SLD стиль для раскраски полигонов по категориям (tur)
        const sldStyle = generateSLDStyle();
        
        // Объединяем CQL фильтр и SLD стиль в customParameters
        const finalCustomParameters: Record<string, string> = {
          SLD_BODY: sldStyle,
          ...(customParameters || {})
        };

        // Создаем WMS слой для полигонов из GeoServer
        const wmsLayer = new WMSLayer({
          url: 'http://10.0.71.2:8080/geoserver/ecology/wms',
          sublayers: [
            {
              name: 'ecology:ecology_main',
              visible: true,
            },
          ],
          opacity: 1.0, // Полная непрозрачность слоя для лучшей видимости
          title: t('layers.ecology'),
          customParameters: finalCustomParameters,
        });

        // Проверяем еще раз перед добавлением
        if (!isMounted || !map) {
          wmsLayer.destroy();
          return;
        }

        // Добавляем слой на карту
        map.add(wmsLayer);
        wmsLayerRef.current = wmsLayer;
        setIsLayerInitialized(true);
        previousCustomParametersRef.current = currentParamsString;
      } catch (error) {
      }
    };

    initWMSLayer();

    return () => {
      isMounted = false;
      setIsLayerInitialized(false);
      
      // Очистка при размонтировании
      const cleanup = () => {
        if (wmsLayerRef.current) {
          try {
            // Проверяем, что map еще существует и не уничтожен
            if (map && !map.destroyed && map.layers) {
              // Проверяем, что слой еще в коллекции слоев перед удалением
              try {
                if (map.layers.includes(wmsLayerRef.current)) {
                  map.layers.remove(wmsLayerRef.current);
                }
              } catch (error) {
                // Слой уже удален или map уничтожен
              }
            }
            // Уничтожаем слой, если он еще существует
            if (wmsLayerRef.current && !wmsLayerRef.current.destroyed) {
              try {
                wmsLayerRef.current.destroy();
              } catch (error) {
                // Слой уже уничтожен
              }
            }
            wmsLayerRef.current = null;
          } catch (error) {
            // Ошибка удаления обработана
            wmsLayerRef.current = null;
          }
        }
      };
      
      // Выполняем cleanup немедленно, но с защитой от ошибок
      cleanup();
    };
  }, [map, isMapReady, customParameters]);

  // Функция для получения данных полигона через WMS GetFeatureInfo
  const getWMSFeatureInfo = useCallback(async (event: __esri.ViewClickEvent): Promise<void> => {
    if (!view || !wmsLayerRef.current || view.destroyed) {
      return;
    }

    try {
      const requestStartedAt = performance.now();
      const point = view.toMap(event);
      if (!point) {
        return;
      }

      // Получаем экстент view для правильного BBOX
      const extent = view.extent;
      if (!extent) {
        return;
      }

      // Получаем размер view в пикселях
      const viewWidth = view.width;
      const viewHeight = view.height;
      
      // Получаем координаты клика в пикселях для запроса
      const screenPointForRequest = view.toScreen(point);
      const x = Math.round(screenPointForRequest.x);
      const y = Math.round(screenPointForRequest.y);

      // Формируем URL для WMS GetFeatureInfo запроса
      const wmsUrl = 'http://10.0.71.2:8080/geoserver/ecology/wms';
      const layerName = 'ecology:ecology_main';
      
      // BBOX в формате minx,miny,maxx,maxy для текущего экстента
      const bbox = `${extent.xmin},${extent.ymin},${extent.xmax},${extent.ymax}`;
      
      const getFeatureInfoUrl = new URL(wmsUrl);
      getFeatureInfoUrl.searchParams.set('SERVICE', 'WMS');
      getFeatureInfoUrl.searchParams.set('VERSION', '1.1.0');
      getFeatureInfoUrl.searchParams.set('REQUEST', 'GetFeatureInfo');
      getFeatureInfoUrl.searchParams.set('LAYERS', layerName);
      getFeatureInfoUrl.searchParams.set('QUERY_LAYERS', layerName);
      getFeatureInfoUrl.searchParams.set('STYLES', '');
      getFeatureInfoUrl.searchParams.set('BBOX', bbox);
      getFeatureInfoUrl.searchParams.set('FEATURE_COUNT', '10');
      getFeatureInfoUrl.searchParams.set('HEIGHT', String(viewHeight));
      getFeatureInfoUrl.searchParams.set('WIDTH', String(viewWidth));
      getFeatureInfoUrl.searchParams.set('FORMAT', 'image/png');
      getFeatureInfoUrl.searchParams.set('INFO_FORMAT', 'application/json');
      getFeatureInfoUrl.searchParams.set('X', String(x));
      getFeatureInfoUrl.searchParams.set('Y', String(y));
      getFeatureInfoUrl.searchParams.set('SRS', 'EPSG:3857'); // Web Mercator — координаты в ответе тоже в 3857

      const response = await fetch(getFeatureInfoUrl.toString());
      
      if (!response.ok) {
        return;
      }

      const featureInfo = await response.json();

      // Получаем координаты клика для позиционирования поп-апа
      const popupPosition = {
        x: screenPointForRequest.x,
        y: screenPointForRequest.y,
      };
      
      // Обрабатываем разные форматы ответа и извлекаем properties и geometry
      let foundProperties = null;
      let foundGeometry: __esri.Polygon | null = null;
      let foundFeature: any = null;
      
      if (featureInfo.features && featureInfo.features.length > 0) {
        foundFeature = featureInfo.features[0];
        foundProperties = foundFeature.properties || foundFeature.attributes;

        // Проверяем наличие геометрии в ответе
        if (foundFeature.geometry) {
          try {
            const [Polygon, SpatialReference] = await loadArcGISJSAPIModules([
              'esri/geometry/Polygon',
              'esri/geometry/SpatialReference'
            ]);
            
            // GetFeatureInfo запрошен с SRS=EPSG:3857, координаты в ответе в Web Mercator (3857)
            const getFeatureInfoSR = new SpatialReference({ wkid: 3857 });
            if (foundFeature.geometry.type === 'Polygon' && foundFeature.geometry.coordinates) {
              const rings = foundFeature.geometry.coordinates;
              foundGeometry = new Polygon({
                rings: rings,
                spatialReference: getFeatureInfoSR
              });
            } else if (foundFeature.geometry.type === 'MultiPolygon' && foundFeature.geometry.coordinates) {
              const multiCoords = foundFeature.geometry.coordinates as number[][][][];
              const allRings: number[][][] = [];
              for (const polygonRings of multiCoords) {
                if (polygonRings && polygonRings.length > 0) {
                  allRings.push(...polygonRings);
                }
              }
              if (allRings.length > 0) {
                foundGeometry = new Polygon({
                  rings: allRings,
                  spatialReference: getFeatureInfoSR
                });
              }
            } else if (foundFeature.geometry.rings) {
              foundGeometry = new Polygon({
                rings: foundFeature.geometry.rings,
                spatialReference: foundFeature.geometry.spatialReference || new SpatialReference({ wkid: 3857 })
              });
            }
          } catch {
            // игнорируем ошибки создания геометрии
          }
        }
      } else if (featureInfo.type === 'FeatureCollection' && featureInfo.features && featureInfo.features.length > 0) {
        foundFeature = featureInfo.features[0];
        foundProperties = foundFeature.properties || foundFeature.attributes;
        if (foundFeature.geometry) {
          try {
            const [Polygon, SpatialReference] = await loadArcGISJSAPIModules([
              'esri/geometry/Polygon',
              'esri/geometry/SpatialReference'
            ]);
            const getFeatureInfoSR = new SpatialReference({ wkid: 3857 });
            if (foundFeature.geometry.type === 'Polygon' && foundFeature.geometry.coordinates) {
              const rings = foundFeature.geometry.coordinates;
              foundGeometry = new Polygon({
                rings: rings,
                spatialReference: getFeatureInfoSR
              });
            } else if (foundFeature.geometry.type === 'MultiPolygon' && foundFeature.geometry.coordinates) {
              const multiCoords = foundFeature.geometry.coordinates as number[][][][];
              const allRings: number[][][] = [];
              for (const polygonRings of multiCoords) {
                if (polygonRings && polygonRings.length > 0) {
                  allRings.push(...polygonRings);
                }
              }
              if (allRings.length > 0) {
                foundGeometry = new Polygon({
                  rings: allRings,
                  spatialReference: getFeatureInfoSR
                });
              }
            } else if (foundFeature.geometry.rings) {
              foundGeometry = new Polygon({
                rings: foundFeature.geometry.rings,
                spatialReference: foundFeature.geometry.spatialReference || new SpatialReference({ wkid: 3857 })
              });
            }
          } catch {
            // Игнорируем ошибки
          }
        }
      }
      
      // Если геометрии нет в ответе — догружаем по unique_id из /api/ecology/geojson
      if (!foundGeometry && foundProperties && foundProperties.unique_id) {
        try {
          const uniqueNorm = normalizeGuidPlain(String(foundProperties.unique_id));

          // Запрашиваем геометрию через API
          const API_BASE_URL = 'https://api-test.spacemc.uz';
          const url = new URL(`${API_BASE_URL}/api/ecology/geojson`);
          const selectedSoato = localStorage.getItem('selectedSoato');
          
          if (selectedSoato && selectedSoato !== 'all') {
            const soatoLength = selectedSoato.length;
            if (soatoLength === 4) {
              url.searchParams.append('region', selectedSoato);
            } else if (soatoLength === 7) {
              url.searchParams.append('district', selectedSoato);
            } else if (soatoLength === 10) {
              url.searchParams.append('mahalla_id', selectedSoato);
            }
          }
          
          const status = localStorage.getItem('status');
          if (status && !readSelectionIsExclusivelyEtid5()) {
            url.searchParams.append('status', status);
          }
          
          const apiResponse = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'accept': 'application/json', 'Content-Type': 'application/json' },
          });
          
          if (apiResponse.ok) {
            const apiData = await apiResponse.json();
            const hints = {
              id_district: foundProperties.id_district,
              id_region: foundProperties.id_region,
              id_mfy: foundProperties.id_mfy
            };
            const matched = pickMatchingGeoJsonRecord(apiData, uniqueNorm, hints);
            let geoJsonGeom: { type?: string; coordinates?: number[][][] } | null = null;
            if (matched && typeof matched === 'object' && (matched as any).geometry) {
              geoJsonGeom = (matched as any).geometry;
            } else if (Array.isArray((apiData as any)?.features)) {
              const hit = (apiData as any).features.find((feature: any) => {
                const props = feature.properties || {};
                const u = props.unique_id ?? props.uniqueId;
                return u && normalizeGuidPlain(String(u)) === uniqueNorm;
              });
              if (hit?.geometry) geoJsonGeom = hit.geometry;
            }

            if (geoJsonGeom?.type === 'Polygon' && geoJsonGeom.coordinates) {
              const [Polygon, SpatialReference] = await loadArcGISJSAPIModules([
                'esri/geometry/Polygon',
                'esri/geometry/SpatialReference'
              ]);
              const rings = geoJsonGeom.coordinates;
              foundGeometry = new Polygon({
                rings: rings,
                spatialReference: new SpatialReference({ wkid: 4326 })
              });
            }
          }
        } catch {
          // игнорируем ошибки API
        }
      }
      
      // Если найдены properties и есть callback, вызываем его
      if (foundProperties && onFeatureClick && view && !view.destroyed) {
        onFeatureClick(foundProperties as PolygonProperties, popupPosition);
      }
      
      if (foundGeometry && onFeatureZoom && view && !view.destroyed) {
        const zoomResult = onFeatureZoom(foundGeometry);
        if (zoomResult && typeof zoomResult.catch === 'function') {
          zoomResult.catch(() => {});
        }
      }
    } catch (error) {
    }
  }, [view, onFeatureClick, onFeatureZoom]);

  // Эффект для обработки кликов на карте
  useEffect(() => {
    if (!view || !isMapReady || !isLayerInitialized) {
      return;
    }

    let isMounted = true;

    const setupClickHandler = () => {
      if (!view || !isMounted) return;

      // Удаляем предыдущий обработчик, если он есть
      if (clickHandleRef.current) {
        try {
          clickHandleRef.current.remove();
        } catch (error) {
          // Обработчик уже удален или view уничтожен
        }
        clickHandleRef.current = null;
      }

      // Проверяем, что view еще не уничтожен
      if (!view || view.destroyed || !isMounted) {
        return;
      }

      // Добавляем обработчик клика
      try {
        clickHandleRef.current = view.on('click', async (event: __esri.ViewClickEvent) => {
          if (isMounted && view && !view.destroyed) {
            await getWMSFeatureInfo(event);
          }
        });
      } catch (error) {
        // Ошибка при добавлении обработчика
        clickHandleRef.current = null;
      }
    };

    setupClickHandler();

    return () => {
      isMounted = false;
      if (clickHandleRef.current) {
        try {
          clickHandleRef.current.remove();
        } catch (error) {
          // Обработчик уже удален или view уничтожен
        }
        clickHandleRef.current = null;
      }
    };
  }, [view, isMapReady, isLayerInitialized, getWMSFeatureInfo]);

  // Компонент не рендерит ничего визуального, только управляет слоем
  return null;
};

export default GeoServerLayer;


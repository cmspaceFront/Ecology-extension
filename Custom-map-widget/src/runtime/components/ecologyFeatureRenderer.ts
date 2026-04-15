/**
 * Стили полигонов как в GeoServer SLD (GeoServerLayer generateSLDStyle):
 * — обводка по id_tur (ETID-1 … ETID-5, иначе розовый)
 * — без заливки: CIMPolygonSymbol только с CIMSolidStroke (не SimpleFillSymbol — иначе WebGL даёт «мутность» внутри)
 */
import { loadArcGISJSAPIModules } from 'jimu-arcgis';

/** Толщина контура полигона (pt), синхронно с SLD GeoServer */
const POLYGON_OUTLINE_WIDTH = 2.67;

const BORDER_HEX: Record<string, string> = {
  'ETID-1': '#00B5E2',
'ETID-2': '#F5A623',
'ETID-3': '#1E5BFF',
'ETID-4': '#FF2D2D',
'ETID-5': '#39FF14',
  default: '#FF006E',
};

function hexToRgb255(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Полигон только с контуром, без слоя заливки (полностью прозрачное «окно» на базовую карту). */
function createOutlineOnlyCIMSymbol(CIMSymbol: any, strokeHex: string): __esri.CIMSymbol {
  const [r, g, b] = hexToRgb255(strokeHex);
  return new CIMSymbol({
    data: {
      type: 'CIMSymbolReference',
      symbol: {
        type: 'CIMPolygonSymbol',
        symbolLayers: [
          {
            type: 'CIMSolidStroke',
            enable: true,
            capStyle: 'Round',
            joinStyle: 'Round',
            width: POLYGON_OUTLINE_WIDTH,
            color: [r, g, b, 255],
          },
        ],
      },
    },
  } as any);
}

/** Arcade: ключ вида "ETID-1|1", "default|none" — должен совпадать с uniqueValueInfos */
const ECOLOGY_STYLE_VALUE_EXPRESSION = `
  var idTur = $feature.id_tur;
  if (IsEmpty(idTur)) { idTur = ''; } else { idTur = Text(idTur); }
  var tek = $feature.tekshirish;
  if (IsEmpty(tek)) { tek = $feature.Tekshirish; }
  if (IsEmpty(tek)) { tek = ''; } else { tek = Text(tek); }
  var bk = 'default';
  if (idTur == 'ETID-1') { bk = 'ETID-1'; }
  else if (idTur == 'ETID-2') { bk = 'ETID-2'; }
  else if (idTur == 'ETID-3') { bk = 'ETID-3'; }
  else if (idTur == 'ETID-4') { bk = 'ETID-4'; }
  else if (idTur == 'ETID-5') { bk = 'ETID-5'; }
  var sb = 'none';
  if (tek == '1') { sb = '1'; }
  else if (tek == '2') { sb = '2'; }
  else if (tek != '') { sb = 'other'; }
  return bk + '|' + sb;
`.replace(/\s+/g, ' ').trim();

export async function createEcologyFeatureRenderer(): Promise<__esri.UniqueValueRenderer> {
  const [UniqueValueRenderer, CIMSymbol] = await loadArcGISJSAPIModules([
    'esri/renderers/UniqueValueRenderer',
    'esri/symbols/CIMSymbol',
  ]);

  const borderKeys = ['ETID-1', 'ETID-2', 'ETID-3', 'ETID-4', 'ETID-5', 'default'] as const;
  const statusKeys = ['none', '1', '2', 'other'] as const;

  const uniqueValueInfos: __esri.UniqueValueInfoProperties[] = [];

  for (const bk of borderKeys) {
    const strokeHex = bk === 'default' ? BORDER_HEX.default : BORDER_HEX[bk];
    for (const sk of statusKeys) {
      uniqueValueInfos.push({
        value: `${bk}|${sk}`,
        symbol: createOutlineOnlyCIMSymbol(CIMSymbol, strokeHex),
      });
    }
  }

  const defaultSymbol = createOutlineOnlyCIMSymbol(CIMSymbol, BORDER_HEX.default);

  return new UniqueValueRenderer({
    valueExpression: ECOLOGY_STYLE_VALUE_EXPRESSION,
    uniqueValueInfos,
    defaultSymbol,
  });
}

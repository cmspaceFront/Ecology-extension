/**
 * Контуры выбранного вилоята (оранжевая обводка) и тумана (голубая) — ArcGIS Feature Server.
 * GeoServer WMS не используется.
 */
/** @jsx jsx */
import { jsx } from 'jimu-core'
import { useEffect, useMemo, useRef } from 'react'
import { loadArcGISJSAPIModules } from 'jimu-arcgis'
import { useFilters } from './hooks/useFilters'
import {
  DISTRICT_FEATURE_SERVER_URL,
  REGION_FEATURE_SERVER_URL,
  UZBEKISTAN_BORDER_BUFFER_FEATURE_SERVER_URL,
  UZBEKISTAN_BORDER_FEATURE_SERVER_URL,
} from './masks/constants'

export interface MapWmsMaskProps {
  map: __esri.Map | null
  view: __esri.MapView | null
  isMapReady: boolean
  onLayerLoaded?: () => void
}

const MapWmsMask = ({ map, isMapReady, onLayerLoaded }: MapWmsMaskProps) => {
  const { filters } = useFilters()
  const selectedSoato = (filters as any).selectedSoato as string | null
  const selectedSoatoRef = useRef<string | null>(selectedSoato)
  const uzbekistanBlurBufferLayerRef = useRef<__esri.FeatureLayer | null>(null)
  const uzbekistanBorderLayerRef = useRef<__esri.FeatureLayer | null>(null)
  const regionOutlineLayerRef = useRef<__esri.FeatureLayer | null>(null)
  const districtOutlineLayerRef = useRef<__esri.FeatureLayer | null>(null)
  const onLayerLoadedRef = useRef(onLayerLoaded)
  onLayerLoadedRef.current = onLayerLoaded

  useEffect(() => {
    selectedSoatoRef.current = selectedSoato
  }, [selectedSoato])

  const regionOutlineWhere = useMemo(() => {
    if (!selectedSoato || selectedSoato === 'all') return null
    const soato = String(selectedSoato).trim()
    if (!soato) return null
    if (soato.length !== 4) return null
    // Для региона используем ключевое поле как раньше: parent_cod
    return `parent_cod = ${soato}`
  }, [selectedSoato])

  const districtOutlineWhere = useMemo(() => {
    if (!selectedSoato || selectedSoato === 'all') return null
    const soato = String(selectedSoato).trim()
    if (!soato) return null
    if (soato.length !== 7) return null
    return `district = '${soato.replace(/'/g, "''")}'`
  }, [selectedSoato])

  // Создаём 2 outline слоя один раз (чтобы не было гонок async create/destroy)
  useEffect(() => {
    if (!map || !isMapReady) return

    let cancelled = false

    const initOutlineLayers = async () => {
      const [
        FeatureLayer,
        SimpleRenderer,
        SimpleFillSymbol,
        SimpleLineSymbol,
        FeatureEffect,
        FeatureFilter,
      ] = await loadArcGISJSAPIModules([
        'esri/layers/FeatureLayer',
        'esri/renderers/SimpleRenderer',
        'esri/symbols/SimpleFillSymbol',
        'esri/symbols/SimpleLineSymbol',
        'esri/layers/support/FeatureEffect',
        'esri/layers/support/FeatureFilter',
      ])

      if (cancelled || !map) return

      if (!uzbekistanBlurBufferLayerRef.current) {
        const layer = new FeatureLayer({
          url: UZBEKISTAN_BORDER_BUFFER_FEATURE_SERVER_URL,
          outFields: [],
          visible: true,
          listMode: 'hide',
          // blur + normal blend averages with bright basemap → unwanted light halos; multiply only darkens
          blendMode: 'multiply',
        })
        uzbekistanBlurBufferLayerRef.current = layer
        map.add(layer)
        try {
          await layer.when()
        } catch {
          // ignore
        }

        if (!cancelled && uzbekistanBlurBufferLayerRef.current && !layer.destroyed) {
          const L = uzbekistanBlurBufferLayerRef.current
          try {
            const gt = L.geometryType
            if (gt === 'polygon') {
              L.renderer = new SimpleRenderer({
                symbol: new SimpleFillSymbol({
                  color: [4, 5, 10, 0.56],
                  outline: {
                    color: [0, 0, 0, 0],
                    width: 0,
                  },
                }),
              })
            } else if (gt === 'polyline') {
              L.renderer = new SimpleRenderer({
                symbol: new SimpleLineSymbol({
                  color: [6, 7, 13, 0.62],
                  width: 6,
                }),
              })
            }
            L.featureEffect = new FeatureEffect({
              filter: new FeatureFilter({ where: '1=1' }),
              includedEffect: 'blur(20px)',
            })
          } catch {
            // ignore
          }
        }
      }

      if (!uzbekistanBorderLayerRef.current) {
        const layer = new FeatureLayer({
          url: UZBEKISTAN_BORDER_FEATURE_SERVER_URL,
          outFields: [],
          visible: true,
          listMode: 'hide',
        })
        uzbekistanBorderLayerRef.current = layer
        map.add(layer)
        try {
          await layer.when()
        } catch {
          // ignore
        }

        if (!cancelled && uzbekistanBorderLayerRef.current && !layer.destroyed) {
          const L = uzbekistanBorderLayerRef.current
          try {
            const gt = L.geometryType
            if (gt === 'polygon') {
              L.renderer = new SimpleRenderer({
                symbol: new SimpleFillSymbol({
                  color: [0, 0, 0, 0],
                  outline: {
                    color: [255, 255, 255, 0.95],
                    width: 1,
                  },
                }),
              })
            } else if (gt === 'polyline') {
              L.renderer = new SimpleRenderer({
                symbol: new SimpleLineSymbol({
                  color: [255, 255, 255, 0.95],
                  width: 1,
                }),
              })
            }
          } catch {
            // ignore
          }
        }
      }

      if (!regionOutlineLayerRef.current) {
        const symbol = new SimpleFillSymbol({
          color: [0, 0, 0, 0],
          outline: { color: [255, 255, 255, 255], width: 1 }, // region
        })
        const renderer = new SimpleRenderer({ symbol })
        const layer = new FeatureLayer({
          url: REGION_FEATURE_SERVER_URL,
          outFields: [],
          renderer,
          visible: false,
          definitionExpression: '1=0',
          listMode: 'hide',
        })
        regionOutlineLayerRef.current = layer
        map.add(layer)
        try {
          await layer.when()
        } catch {
          // ignore
        }

        const current = selectedSoatoRef.current
        const currentTrimmed = current ? String(current).trim() : ''
        const wantsRegion = currentTrimmed.length === 4
        layer.visible = wantsRegion
        layer.definitionExpression = wantsRegion ? `parent_cod = ${currentTrimmed}` : '1=0'
      }

      if (!districtOutlineLayerRef.current) {
        const symbol = new SimpleFillSymbol({
          color: [0, 0, 0, 0],
          outline: { color: [255, 255, 255, 255], width: 1 }, // district
        })
        const renderer = new SimpleRenderer({ symbol })
        const layer = new FeatureLayer({
          url: DISTRICT_FEATURE_SERVER_URL,
          outFields: [],
          renderer,
          visible: false,
          definitionExpression: '1=0',
          listMode: 'hide',
        })
        districtOutlineLayerRef.current = layer
        map.add(layer)
        try {
          await layer.when()
        } catch {
          // ignore
        }

        const current = selectedSoatoRef.current
        const currentTrimmed = current ? String(current).trim() : ''
        const wantsDistrict = currentTrimmed.length === 7
        layer.visible = wantsDistrict
        layer.definitionExpression = wantsDistrict ? `district = '${currentTrimmed.replace(/'/g, "''")}'` : '1=0'
      }

      try {
        onLayerLoadedRef.current?.()
      } catch {
        // ignore
      }
    }

    initOutlineLayers().catch(() => {})

    return () => {
      cancelled = true
    }
  }, [map, isMapReady])

  useEffect(() => {
    if (!map || !isMapReady) return

    const regionLayer = regionOutlineLayerRef.current
    const districtLayer = districtOutlineLayerRef.current

    const isRegionSelection = Boolean(regionOutlineWhere)
    const isDistrictSelection = Boolean(districtOutlineWhere)

    if (regionLayer) {
      regionLayer.visible = isRegionSelection
      regionLayer.definitionExpression = regionOutlineWhere ?? '1=0'
    }
    if (districtLayer) {
      districtLayer.visible = isDistrictSelection
      districtLayer.definitionExpression = districtOutlineWhere ?? '1=0'
    }
  }, [map, isMapReady, regionOutlineWhere, districtOutlineWhere])

  useEffect(() => {
    return () => {
      try {
        if (map && uzbekistanBlurBufferLayerRef.current) {
          map.remove(uzbekistanBlurBufferLayerRef.current)
        }
      } catch {
        // ignore
      }
      try {
        if (uzbekistanBlurBufferLayerRef.current && !uzbekistanBlurBufferLayerRef.current.destroyed) {
          uzbekistanBlurBufferLayerRef.current.destroy()
        }
      } catch {
        // ignore
      }
      try {
        if (map && uzbekistanBorderLayerRef.current) {
          map.remove(uzbekistanBorderLayerRef.current)
        }
      } catch {
        // ignore
      }
      try {
        if (uzbekistanBorderLayerRef.current && !uzbekistanBorderLayerRef.current.destroyed) {
          uzbekistanBorderLayerRef.current.destroy()
        }
      } catch {
        // ignore
      }
      try {
        if (map && regionOutlineLayerRef.current) {
          map.remove(regionOutlineLayerRef.current)
        }
      } catch {
        // ignore
      }
      try {
        if (regionOutlineLayerRef.current && !regionOutlineLayerRef.current.destroyed) {
          regionOutlineLayerRef.current.destroy()
        }
      } catch {
        // ignore
      }
      try {
        if (map && districtOutlineLayerRef.current) {
          map.remove(districtOutlineLayerRef.current)
        }
      } catch {
        // ignore
      }
      try {
        if (districtOutlineLayerRef.current && !districtOutlineLayerRef.current.destroyed) {
          districtOutlineLayerRef.current.destroy()
        }
      } catch {
        // ignore
      }
      uzbekistanBlurBufferLayerRef.current = null
      uzbekistanBorderLayerRef.current = null
      regionOutlineLayerRef.current = null
      districtOutlineLayerRef.current = null
    }
  }, [map])

  return null
}

export default MapWmsMask

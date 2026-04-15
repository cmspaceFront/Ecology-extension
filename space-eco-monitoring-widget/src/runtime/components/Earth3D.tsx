import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import type { WidgetContext } from 'jimu-core'

// Intrinsic bounding-sphere radius of earth_high.glb at unit scale. Used so low and high match visually.
const HIGH_GLB_INTRINSIC_RADIUS = 10.454325219806831
// Module-level cache for high GLB ArrayBuffer (survives remounts; high can load from memory on re-open).
const highGlbBufferCache = new Map<string, ArrayBuffer>()
const GLOBE_RADIUS = 50
const LOCK_EARTH_CENTER_Y = 0
const FIXED_CAMERA_FOV = 50
const FIXED_DPR = 1
const FIXED_GLOBE_PIXEL_HEIGHT = 520
const FIXED_DESKTOP_CENTER_RATIO = 0.95
const FIXED_CAMERA_Z = 75

interface Earth3DProps {
  glbUrl?: string
  autoRotateSpeed?: number
  earthScale?: number
  earthPositionY?: number
  onEarthReady?: () => void
  context?: WidgetContext
}

const Earth3D: React.FC<Earth3DProps> = ({
  glbUrl,
  autoRotateSpeed = 0.5,
  earthScale = 4,
  earthPositionY = 0,
  onEarthReady,
  context
}) => {
  const mountRef = useRef<HTMLDivElement>(null)

  const earthSceneRef = useRef<THREE.Scene>()
  const earthCameraRef = useRef<THREE.PerspectiveCamera>()
  const rendererRef = useRef<THREE.WebGLRenderer>()
  const backgroundSceneRef = useRef<THREE.Scene>()
  const backgroundCameraRef = useRef<THREE.PerspectiveCamera>()

  const earthRef = useRef<THREE.Group>()
  const starsRef = useRef<THREE.Points>()

  const animationIdRef = useRef<number>()

  const earthSpeedRef = useRef<number>(autoRotateSpeed)

  const isLoadingRef = useRef<boolean>(true)
  const pendingHighEarthRef = useRef<THREE.Group | undefined>(undefined)
  const earthIntrinsicRadiusRef = useRef<number>(1)

  const cameraAnimationStartTimeRef = useRef<number>(0)
  const lastFrameTimeRef = useRef<number>(0)

  const isModelLoadedRef = useRef<boolean>(false)
  const earthPositionYRef = useRef<number>(earthPositionY)
  const cameraAnimationProgressRef = useRef<number>(0)

  const earthReadyCallbackCalledRef = useRef<boolean>(false)
  const mobileZoomKRef = useRef<number>(0) // 0..1
  // ✅ used to keep Earth fully inside the sliced canvas
  const earthWorldRadiusRef = useRef<number>(GLOBE_RADIUS * 1.05)
  const earthScaleRef = useRef<number>(earthScale || 4)
  const isDesktopRef = useRef<boolean>(false)

  // =========================
  // ✅ Resize-flash fixes
  // =========================
  const viewportTargetRef = useRef({ w: 1, h: 1, left: 0 })
  const viewportCurrentRef = useRef({ w: 1, h: 1, left: 0 })
  const fullSizeTargetRef = useRef({ w: 1, h: 1 })

  const isResizingRef = useRef(false)
  const resizeIdleTimerRef = useRef<number | null>(null)
  const forceCommitRef = useRef(false)
  const committedSizeRef = useRef({ w: 1, h: 1 })
  const currentDprRef = useRef<number>(1)

  const triggerEarthReady = () => {
    if (!earthReadyCallbackCalledRef.current && onEarthReady) {
      earthReadyCallbackCalledRef.current = true
      onEarthReady()
    }
  }
  // ✅ Camera X offset so the globe sits more to the right inside the right-half canvas.
  // Bigger magnitude => globe appears more to the right.
  const getCameraXOffset = () => -(earthScale || 4) * 35 // try 30..55 if you want more/less

  const MIN_CANVAS_SIZE = 100 // гарантия видимости глобуса при первом заходе (Enterprise)

  useEffect(() => {
    const mountEl = mountRef.current
    if (!mountEl) return

    let cancelled = false

    earthPositionYRef.current = LOCK_EARTH_CENTER_Y
    earthScaleRef.current = earthScale || 4
    isLoadingRef.current = true
    isModelLoadedRef.current = false
    cameraAnimationStartTimeRef.current = performance.now()
    lastFrameTimeRef.current = performance.now()
    cameraAnimationProgressRef.current = 0
    earthReadyCallbackCalledRef.current = false
    isResizingRef.current = false
    forceCommitRef.current = false

    const getValidSize = (): { w: number; h: number } => {
      const el = mountRef.current
      if (!el) {
        const vw = Math.round(window.visualViewport?.width || window.innerWidth || MIN_CANVAS_SIZE)
        const vh = Math.round(window.visualViewport?.height || window.innerHeight || MIN_CANVAS_SIZE)
        return { w: Math.max(MIN_CANVAS_SIZE, vw), h: Math.max(MIN_CANVAS_SIZE, vh) }
      }
      const rect = el.getBoundingClientRect()
      const rectW = Math.round(rect.width)
      const rectH = Math.round(rect.height)
      const vw = Math.round(window.visualViewport?.width || window.innerWidth || 0)
      const vh = Math.round(window.visualViewport?.height || window.innerHeight || 0)

      // Keep canvas stable after browser zoom/refresh when parent can report stale smaller rect.
      const w = Math.max(MIN_CANVAS_SIZE, rectW, vw)
      const h = Math.max(MIN_CANVAS_SIZE, rectH, vh)
      return { w, h }
    }

    const getCurrentDpr = () => FIXED_DPR

    const syncRendererDpr = () => {
      const nextDpr = getCurrentDpr()
      if (Math.abs(nextDpr - currentDprRef.current) > 0.01) {
        renderer.setPixelRatio(nextDpr)
        currentDprRef.current = nextDpr
      }
    }

    // =========================
    // Single WebGL context (critical for Enterprise stability)
    // =========================
    const backgroundScene = new THREE.Scene()
    backgroundScene.background = new THREE.Color(0x000011)
    backgroundSceneRef.current = backgroundScene

    const { w: fullW0, h: fullH0 } = getValidSize()
    fullSizeTargetRef.current = { w: fullW0, h: fullH0 }

    const backgroundCamera = new THREE.PerspectiveCamera(50, fullW0 / fullH0, 0.1, 15000)
    backgroundCamera.position.set(0, 0, 400)
    backgroundCamera.lookAt(0, 0, 0)
    backgroundCameraRef.current = backgroundCamera

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    })
    currentDprRef.current = getCurrentDpr()
    renderer.setPixelRatio(currentDprRef.current)
    renderer.setSize(fullW0, fullH0, false)
    renderer.autoClear = false
    renderer.domElement.style.position = 'absolute'
    renderer.domElement.style.top = '0'
    renderer.domElement.style.left = '0'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.zIndex = '2'
    renderer.domElement.style.pointerEvents = 'none'
    rendererRef.current = renderer
    mountEl.appendChild(renderer.domElement)

    // Stars in background
    const starsGeometry = new THREE.BufferGeometry()
    const starsCount = 10000
    const starsPositions = new Float32Array(starsCount * 3)
    for (let i = 0; i < starsCount * 3; i++) {
      starsPositions[i] = (Math.random() - 0.5) * 2000
    }
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3))
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 })
    const stars = new THREE.Points(starsGeometry, starsMaterial)
    backgroundScene.add(stars)
    starsRef.current = stars

    // =========================
    // Earth Scene
    // =========================
    const earthScene = new THREE.Scene()
    earthScene.background = null
    earthSceneRef.current = earthScene

    const earthCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 15000)
    const startCameraDistance = 3000

    earthCamera.position.set(0, 0, startCameraDistance);
    earthCamera.lookAt(0, 0, 0);


    earthCameraRef.current = earthCamera;

    // Lighting
    earthScene.add(new THREE.AmbientLight(0x606060, 1.8))

    const sunLight = new THREE.DirectionalLight(0xffffff, 9.0)
    sunLight.position.set(-800, 100, -600)
    earthScene.add(sunLight)

    const daySideLight = new THREE.DirectionalLight(0xfff8e1, 4.0)
    daySideLight.position.set(-700, 80, -500)
    earthScene.add(daySideLight)

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
    const smoothstep01 = (t: number) => t * t * (3 - 2 * t)

    const computeEarthViewportTarget = () => {
      const el = mountRef.current
      if (!el) return

      const { w, h } = getValidSize()

      isDesktopRef.current = w > 1024

      viewportTargetRef.current = { w, h, left: 0 }

      const mobileStart = 768
      const mobileEnd = 360
      const mkRaw = clamp01((mobileStart - w) / (mobileStart - mobileEnd))
      mobileZoomKRef.current = smoothstep01(mkRaw)

      const baseFov = 50
      earthCamera.fov = baseFov
      earthCamera.updateProjectionMatrix()
    }

    const updateFullSizeTarget = () => {
      fullSizeTargetRef.current = getValidSize()
    }

    const handleResize = () => {
      syncRendererDpr()
      updateFullSizeTarget()
      computeEarthViewportTarget()

      // ✅ during live browser resize: avoid earthRenderer.setSize() (GPU buffer reallocate flashes)
      isResizingRef.current = true

      if (resizeIdleTimerRef.current != null) {
        window.clearTimeout(resizeIdleTimerRef.current)
      }
      resizeIdleTimerRef.current = window.setTimeout(() => {
        isResizingRef.current = false
        forceCommitRef.current = true // commit once on next frame
      }, 200)
    }

    // ResizeObserver catches container changes (not only window resize)
    const ro = new ResizeObserver(() => requestAnimationFrame(handleResize))
    ro.observe(mountEl)

    // window resize (real browser drag)
    window.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('resize', handleResize)

    // init sizes
    handleResize()
    viewportCurrentRef.current = { ...viewportTargetRef.current }
    committedSizeRef.current = { ...fullSizeTargetRef.current }
    // initial commit (full canvas)
    renderer.setSize(fullSizeTargetRef.current.w, fullSizeTargetRef.current.h, false)
    backgroundCamera.aspect = fullSizeTargetRef.current.w / fullSizeTargetRef.current.h
    backgroundCamera.updateProjectionMatrix()
    earthCamera.aspect = viewportTargetRef.current.w / viewportTargetRef.current.h
    earthCamera.updateProjectionMatrix()

    // ===== Load GLB (progressive: сначала low, потом high) =====
    const getLowGlbPath = (): string => {
      if (context?.folderUrl) {
        const baseUrl = (context.folderUrl as string).replace(/\/experience\/\.\.\//g, '/').replace(/\/$/, '')
        return `${baseUrl}/dist/runtime/assets/earth_low.glb`
      }
      return `${window.location.origin}/widgets/space-eco-monitoring-widget/dist/runtime/assets/earth_low.glb`
    }
    const getHighGlbPath = (): string => {
      if (context?.folderUrl) {
        const baseUrl = (context.folderUrl as string).replace(/\/experience\/\.\.\//g, '/').replace(/\/$/, '')
        return `${baseUrl}/dist/runtime/assets/earth_high.glb`
      }
      return `${window.location.origin}/widgets/space-eco-monitoring-widget/dist/runtime/assets/earth_high.glb`
    }
    const lowUrl = glbUrl || getLowGlbPath()
    const highUrl = getHighGlbPath()
    const glbLoadStartTime = performance.now()

    const applyEarthMaterials = (earth: THREE.Group) => {
      earth.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshStandardMaterial
          if (material) {
            material.needsUpdate = true
            material.roughness = 0.7
            material.metalness = 0.05
            if (material.emissive) material.emissiveIntensity = 1.5
          }
        }
      })
    }

    const normalizeEarthScale = (earth: THREE.Group, targetRadius: number): number => {
      earth.scale.set(1, 1, 1)
      earth.position.set(0, 0, 0)
      earth.updateMatrixWorld(true)
      let maxDist = 0
      const bbox = new THREE.Box3().setFromObject(earth)
      const geomCenter = bbox.getCenter(new THREE.Vector3())
      earth.traverse((obj) => {
        if ((obj as any).isMesh) {
          const mesh = obj as THREE.Mesh
          const geom = mesh.geometry
          if (!geom.boundingSphere) geom.computeBoundingSphere()
          if (geom.boundingSphere) {
            const center = geom.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld)
            const r = geom.boundingSphere.radius * mesh.matrixWorld.getMaxScaleOnAxis()
            maxDist = Math.max(maxDist, center.length() + r)
          }
        }
      })
      const intrinsicR = Math.max(0.001, maxDist)
      const s = targetRadius / intrinsicR
      earth.scale.set(s, s, s)
      earth.position.set(-geomCenter.x * s, LOCK_EARTH_CENTER_Y - geomCenter.y * s, -geomCenter.z * s)
      return intrinsicR
    }

    const disposeGroup = (group: THREE.Group) => {
      group.traverse((obj) => {
        if ((obj as any).isMesh) {
          const mesh = obj as THREE.Mesh
          mesh.geometry?.dispose?.()
          const mat = mesh.material as any
          if (Array.isArray(mat)) mat.forEach((m: any) => m?.dispose?.())
          else mat?.dispose?.()
        }
      })
    }

    const finalizeHighEarth = (highEarth: THREE.Group) => {
      if (cameraAnimationProgressRef.current < 1.0) {
        if (pendingHighEarthRef.current) disposeGroup(pendingHighEarthRef.current)
        pendingHighEarthRef.current = highEarth
        return
      }
      const highIntrinsicR = normalizeEarthScale(highEarth, GLOBE_RADIUS)
      earthIntrinsicRadiusRef.current = highIntrinsicR
      earthWorldRadiusRef.current = GLOBE_RADIUS * 1.03
      applyEarthMaterials(highEarth)
      if (earthRef.current) {
        highEarth.rotation.copy(earthRef.current.rotation)
        const oldModel = earthRef.current
        earthScene.remove(oldModel)
        disposeGroup(oldModel)
      }
      earthScene.add(highEarth)
      earthRef.current = highEarth
      isModelLoadedRef.current = true
      isLoadingRef.current = false
      computeEarthViewportTarget()
    }

    const fetchAndCacheHigh = (): Promise<ArrayBuffer> => {
      const cached = highGlbBufferCache.get(highUrl)
      if (cached) return Promise.resolve(cached)
      return fetch(highUrl).then((r) => r.arrayBuffer()).then((buf) => {
        highGlbBufferCache.set(highUrl, buf)
        return buf
      })
    }

    const loader = new GLTFLoader()
    let shownQuality: 'none' | 'low' | 'high' = 'none'
    const showModel = (earth: THREE.Group, quality: 'low' | 'high') => {
      const isUpgradeToHigh = quality === 'high' && shownQuality !== 'high'
      if (shownQuality === 'high' && quality === 'low') {
        disposeGroup(earth)
        return
      }

      const intrinsicR = normalizeEarthScale(earth, GLOBE_RADIUS)
      earthIntrinsicRadiusRef.current = intrinsicR
      earthWorldRadiusRef.current = GLOBE_RADIUS * 1.03
      applyEarthMaterials(earth)

      if (earthRef.current) {
        earth.rotation.copy(earthRef.current.rotation)
        const oldModel = earthRef.current
        earthScene.remove(oldModel)
        disposeGroup(oldModel)
      } else {
        cameraAnimationStartTimeRef.current = performance.now()
      }

      earthScene.add(earth)
      earthRef.current = earth
      isModelLoadedRef.current = true
      isLoadingRef.current = false
      shownQuality = quality
      computeEarthViewportTarget()

      if (isUpgradeToHigh) {
        console.log('[Space Eco] Приоритетно переключено на earth_high.glb')
      }
    }

    // Parallel loading: low and high start together; high has priority when available.
    loader.load(
      lowUrl,
      (gltf) => {
        if (cancelled) return
        const elapsedSec = ((performance.now() - glbLoadStartTime) / 1000).toFixed(2)
        console.log(`[Space Eco] earth_low.glb загружен за ${elapsedSec} сек`)
        showModel(gltf.scene, 'low')
      },
      undefined,
      (err) => {
        if (cancelled) return
        const elapsedSec = ((performance.now() - glbLoadStartTime) / 1000).toFixed(2)
        console.error(`[Space Eco] Ошибка загрузки earth_low.glb после ${elapsedSec} сек:`, err)
      }
    )

    fetchAndCacheHigh()
      .then((buf) => {
        if (cancelled) return
        loader.parse(buf, '', (highGltf) => {
          if (cancelled) return
          const elapsedSec = ((performance.now() - glbLoadStartTime) / 1000).toFixed(2)
          console.log(`[Space Eco] earth_high.glb готов за ${elapsedSec} сек`)
          showModel(highGltf.scene, 'high')
        }, (err) => {
          if (cancelled) return
          console.error('[Space Eco] Ошибка разбора earth_high.glb:', err)
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[Space Eco] Ошибка загрузки earth_high.glb:', err)
      })

    // ===== Animation loop =====
    const animate = (currentTime: number) => {
      animationIdRef.current = requestAnimationFrame(animate)

      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000
      lastFrameTimeRef.current = currentTime
      const clampedDelta = Math.min(deltaTime, 0.033)

      // ✅ Smooth CSS viewport always
      const tgt = viewportTargetRef.current
      const cur = viewportCurrentRef.current
      const lerpAlpha = 1 - Math.exp(-12 * clampedDelta)

      cur.left = cur.left + (tgt.left - cur.left) * lerpAlpha
      cur.w = cur.w + (tgt.w - cur.w) * lerpAlpha
      cur.h = tgt.h

      const cssW = Math.max(1, Math.round(cur.w))
      const cssH = Math.max(1, Math.round(cur.h))
      const canvas = renderer.domElement

      // keep camera correct for current CSS viewport
      earthCamera.aspect = cssW / cssH
      earthCamera.updateProjectionMatrix()

      // ✅ commit REAL buffer resize only when user stopped resizing
      const shouldCommit = !isResizingRef.current || forceCommitRef.current
      if (shouldCommit) {
        forceCommitRef.current = false
        const last = committedSizeRef.current
        const full = fullSizeTargetRef.current
        if (full.w !== last.w || full.h !== last.h) {
          renderer.setSize(full.w, full.h, false)
          committedSizeRef.current = { ...full }
        }
      }

      // Keep background camera aspect in sync (cheap, avoids stretching)
      const fullNow = fullSizeTargetRef.current
      backgroundCamera.aspect = fullNow.w / fullNow.h
      backgroundCamera.updateProjectionMatrix()
      const canvasW = Math.round(fullNow.w)
      const canvasH = Math.round(fullNow.h)

      const radius = earthWorldRadiusRef.current || GLOBE_RADIUS * 1.05
      const es = earthScaleRef.current || 4

      const halfFovRad = THREE.MathUtils.degToRad(FIXED_CAMERA_FOV / 2)
      const desiredPixelHeight = Math.max(280, Math.min(FIXED_GLOBE_PIXEL_HEIGHT, canvasH - 80))
      let finalCameraDistance = FIXED_CAMERA_Z
      const approachStartZ = finalCameraDistance * 8

      const approachDuration = 2.5

      if (!isModelLoadedRef.current) {
        earthCamera.position.z = approachStartZ
        earthCamera.lookAt(0, earthPositionYRef.current, 0)
        cameraAnimationProgressRef.current = 0
      } else {
        const elapsedTime = (currentTime - cameraAnimationStartTimeRef.current) / 1000
        const t = Math.min(elapsedTime / approachDuration, 1.0)
        const eased = 1 - Math.pow(1 - t, 3)

        if (t < 1.0) {
          earthCamera.position.z = approachStartZ + (finalCameraDistance - approachStartZ) * eased
        } else {
          earthCamera.position.z += (finalCameraDistance - earthCamera.position.z) * (1 - Math.exp(-4 * clampedDelta))
        }
        earthCamera.lookAt(0, earthPositionYRef.current, 0)
        cameraAnimationProgressRef.current = eased

        if (t >= 1.0) {
          triggerEarthReady()
          if (pendingHighEarthRef.current) {
            const highEarth = pendingHighEarthRef.current
            pendingHighEarthRef.current = undefined
            const highIntrinsicR = normalizeEarthScale(highEarth, GLOBE_RADIUS)
            earthIntrinsicRadiusRef.current = highIntrinsicR
            earthWorldRadiusRef.current = GLOBE_RADIUS * 1.03
            applyEarthMaterials(highEarth)
            if (earthRef.current) {
              highEarth.rotation.copy(earthRef.current.rotation)
              const oldModel = earthRef.current
              earthScene.remove(oldModel)
              disposeGroup(oldModel)
            }
            earthScene.add(highEarth)
            earthRef.current = highEarth
            computeEarthViewportTarget()
          }
        }
      }

      if (earthRef.current) {
        const isAnimating = cameraAnimationProgressRef.current < 1.0
        earthRef.current.rotation.y += earthSpeedRef.current * (isAnimating ? 0.003 : 0.001)
      }

      if (starsRef.current) {
        starsRef.current.rotation.y += 0.0001
      }

      // ===== Render (single context) =====
      renderer.setScissorTest(false)
      const drawingBufferSize = renderer.getDrawingBufferSize(new THREE.Vector2())
      renderer.setViewport(0, 0, drawingBufferSize.x, drawingBufferSize.y)
      renderer.clear(true, true, true)
      renderer.render(backgroundScene, backgroundCamera)

      const scaleX = drawingBufferSize.x / Math.max(1, committedSizeRef.current.w)
      const scaleY = drawingBufferSize.y / Math.max(1, committedSizeRef.current.h)

      if (isDesktopRef.current) {
        const rightHalfW = Math.round(canvasW * 0.5)
        const centerRatio = FIXED_DESKTOP_CENTER_RATIO
        const globeCenterCss = Math.round(canvasW * centerRatio)

        // Используем целевую дистанцию камеры, чтобы в конце анимации не было скачка по X.
        let camZ = finalCameraDistance
        const vFov = THREE.MathUtils.degToRad(earthCamera.fov / 2)
        const globePixelH = (radius / (camZ * Math.tan(vFov))) * canvasH
        const neededHalf = Math.max(rightHalfW / 2, Math.ceil(globePixelH * 0.58))

        const vpLeftCss = Math.max(0, globeCenterCss - neededHalf)
        const vpRightCss = Math.min(canvasW, globeCenterCss + neededHalf)
        const vpW = vpRightCss - vpLeftCss

        earthCamera.aspect = vpW / canvasH
        earthCamera.updateProjectionMatrix()

        const sX = Math.max(0, Math.floor(vpLeftCss * scaleX))
        const sW = Math.max(1, Math.floor(vpW * scaleX))
        const sH = Math.max(1, Math.floor(canvasH * scaleY))

        renderer.setScissorTest(true)
        renderer.setScissor(sX, 0, sW, sH)
        renderer.setViewport(sX, 0, sW, sH)
        renderer.clearDepth()
        renderer.render(earthScene, earthCamera)
        renderer.setScissorTest(false)
      } else {
        earthCamera.aspect = canvasW / canvasH
        earthCamera.updateProjectionMatrix()

        renderer.setScissorTest(false)
        renderer.setViewport(0, 0, drawingBufferSize.x, drawingBufferSize.y)
        renderer.clearDepth()
        renderer.render(earthScene, earthCamera)
      }
    }

    animate(performance.now())

    return () => {
      cancelled = true
      ro.disconnect()
      window.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('resize', handleResize)

      if (resizeIdleTimerRef.current != null) {
        window.clearTimeout(resizeIdleTimerRef.current)
        resizeIdleTimerRef.current = null
      }

      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)

      if (pendingHighEarthRef.current) {
        disposeGroup(pendingHighEarthRef.current)
        pendingHighEarthRef.current = undefined
      }

      // remove canvases safely
      if (mountEl) {
        if (renderer.domElement && mountEl.contains(renderer.domElement)) {
          mountEl.removeChild(renderer.domElement)
        }
      }

      // dispose resources
      starsGeometry.dispose()
      starsMaterial.dispose()

      if (earthRef.current) {
        earthScene.remove(earthRef.current)
        earthRef.current.traverse((obj) => {
          if ((obj as any).isMesh) {
            const mesh = obj as THREE.Mesh
            mesh.geometry?.dispose?.()
            const mat = mesh.material as any
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
            else mat?.dispose?.()
          }
        })
        earthRef.current = undefined
      }

      renderer.dispose()
    }
  }, [glbUrl, context])

  useEffect(() => {
    earthSpeedRef.current = autoRotateSpeed
  }, [autoRotateSpeed])

  useEffect(() => {
    earthPositionYRef.current = LOCK_EARTH_CENTER_Y
    earthScaleRef.current = earthScale || 4

    if (earthCameraRef.current) {
      earthCameraRef.current.lookAt(0, LOCK_EARTH_CENTER_Y, 0)
      earthCameraRef.current.updateProjectionMatrix()
    }
  }, [earthScale, earthPositionY])

  return <div ref={mountRef} className="space-eco-earth-layer" />
}

export default Earth3D

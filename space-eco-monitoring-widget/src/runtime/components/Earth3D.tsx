import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import type { WidgetContext } from 'jimu-core'

interface Earth3DProps {
  glbUrl?: string
  autoRotateSpeed?: number
  atmosphereRotationSpeed?: number
  earthScale?: number
  earthPositionY?: number
  onEarthReady?: () => void
  context?: WidgetContext
}

const Earth3D: React.FC<Earth3DProps> = ({
  glbUrl,
  autoRotateSpeed = 0.5,
  atmosphereRotationSpeed = 0.11,
  earthScale = 4,
  earthPositionY = 0,
  onEarthReady,
  context
}) => {
  const mountRef = useRef<HTMLDivElement>(null)

  const backgroundSceneRef = useRef<THREE.Scene>()
  const backgroundRendererRef = useRef<THREE.WebGLRenderer>()
  const backgroundCameraRef = useRef<THREE.PerspectiveCamera>()

  const earthSceneRef = useRef<THREE.Scene>()
  const earthRendererRef = useRef<THREE.WebGLRenderer>()
  const earthCameraRef = useRef<THREE.PerspectiveCamera>()

  const earthRef = useRef<THREE.Group>()
  const atmosphereRef = useRef<THREE.Mesh>()
  const starsRef = useRef<THREE.Points>()

  const animationIdRef = useRef<number>()
  const atmosphereRotationRef = useRef<number>(0)

  const earthSpeedRef = useRef<number>(autoRotateSpeed)
  const atmosphereSpeedRef = useRef<number>(atmosphereRotationSpeed)

  const isLoadingRef = useRef<boolean>(true)
  const placeholderEarthRef = useRef<THREE.Mesh>()

  const cameraAnimationStartTimeRef = useRef<number>(0)
  const lastFrameTimeRef = useRef<number>(0)

  const isModelLoadedRef = useRef<boolean>(false)
  const earthPositionYRef = useRef<number>(earthPositionY)
  const cameraAnimationProgressRef = useRef<number>(0)

  const earthReadyCallbackCalledRef = useRef<boolean>(false)
  const mobileZoomKRef = useRef<number>(0) // 0..1
  // ✅ used to keep Earth fully inside the sliced canvas
  const earthWorldRadiusRef = useRef<number>((earthScale || 4) * 1.05) // approx, updated after GLB load
  const earthOffsetXRef = useRef<number>(0) // computed each frame (world X shift)

  // =========================
  // ✅ Resize-flash fixes
  // =========================
  const viewportTargetRef = useRef({ w: 1, h: 1, left: 0 })
  const viewportCurrentRef = useRef({ w: 1, h: 1, left: 0 })

  const isResizingRef = useRef(false)
  const resizeIdleTimerRef = useRef<number | null>(null)
  const forceCommitRef = useRef(false)
  const committedSizeRef = useRef({ w: 1, h: 1 })

  const triggerEarthReady = () => {
    if (!earthReadyCallbackCalledRef.current && onEarthReady) {
      earthReadyCallbackCalledRef.current = true
      onEarthReady()
    }
  }
  // ✅ Camera X offset so the globe sits more to the right inside the right-half canvas.
  // Bigger magnitude => globe appears more to the right.
  const getCameraXOffset = () => -(earthScale || 4) * 35 // try 30..55 if you want more/less

  useEffect(() => {
    const mountEl = mountRef.current
    if (!mountEl) return

    earthPositionYRef.current = earthPositionY || 0
    isLoadingRef.current = true
    isModelLoadedRef.current = false
    cameraAnimationStartTimeRef.current = performance.now()
    lastFrameTimeRef.current = performance.now()
    cameraAnimationProgressRef.current = 0
    earthReadyCallbackCalledRef.current = false
    isResizingRef.current = false
    forceCommitRef.current = false

    // =========================
    // Background Scene (FULL)
    // =========================
    const backgroundScene = new THREE.Scene()
    backgroundScene.background = new THREE.Color(0x000011)
    backgroundSceneRef.current = backgroundScene

    const rect0 = mountEl.getBoundingClientRect()
    const bgWidth = Math.max(1, Math.round(rect0.width))
    const bgHeight = Math.max(1, Math.round(rect0.height))

    const backgroundCamera = new THREE.PerspectiveCamera(50, bgWidth / bgHeight, 0.1, 15000)
    backgroundCamera.position.set(0, 0, 400)
    backgroundCamera.lookAt(0, 0, 0)
    backgroundCameraRef.current = backgroundCamera

    const backgroundRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    backgroundRenderer.setSize(bgWidth, bgHeight, false)
    backgroundRenderer.setPixelRatio(window.devicePixelRatio)
    backgroundRenderer.domElement.style.position = 'absolute'
    backgroundRenderer.domElement.style.top = '0'
    backgroundRenderer.domElement.style.left = '0'
    backgroundRenderer.domElement.style.width = '100%'
    backgroundRenderer.domElement.style.height = '100%'
    backgroundRenderer.domElement.style.zIndex = '1'
    backgroundRenderer.domElement.style.pointerEvents = 'none'
    backgroundRendererRef.current = backgroundRenderer
    mountEl.appendChild(backgroundRenderer.domElement)

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
    const startCameraDistance = 10000;
    const finalCameraDistance = 600;

    const camX = getCameraXOffset()
    earthCamera.position.set(0, 0, startCameraDistance);
    earthCamera.lookAt(0, 0, 0);


    earthCameraRef.current = earthCamera;


    const earthRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    earthRenderer.setPixelRatio(window.devicePixelRatio)
    earthRenderer.setClearColor(0x000000, 0) // ✅ stable transparent clear
    earthRenderer.domElement.style.position = 'absolute'
    earthRenderer.domElement.style.top = '0'
    earthRenderer.domElement.style.pointerEvents = 'none'
    earthRenderer.domElement.style.zIndex = '2'
    earthRenderer.domElement.style.willChange = 'left, width'
    // ✅ NO CSS transitions here (prevents resize flashing + edge cuts)
    earthRendererRef.current = earthRenderer
    mountEl.appendChild(earthRenderer.domElement)

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

      const rect = el.getBoundingClientRect()
      const w = Math.max(1, Math.round(rect.width))
      const h = Math.max(1, Math.round(rect.height))
      const start = 1024
      const end = 768

      const tRaw = clamp01((start - w) / (start - end))
      const t = smoothstep01(tRaw)
      // ✅ Desktop like original: right half (anchored right). <=1024: full width centered.
      const isCenterBand = w <= 1024

      let consumptionW = w
      let leftPx = 0

      if (!isCenterBand) {
        consumptionW = Math.max(1, Math.round(w * 0.5))
        leftPx = Math.round(w - consumptionW) // right anchored
      } else {
        consumptionW = w
        leftPx = 0 // full canvas
      }

      viewportTargetRef.current = { w: consumptionW, h, left: leftPx }

      // ✅ Mobile zoom factor: 0..1 (0 on >=768)
      const mobileStart = 768
      const mobileEnd = 360
      const mkRaw = clamp01((mobileStart - w) / (mobileStart - mobileEnd))
      mobileZoomKRef.current = smoothstep01(mkRaw)

      // FOV tuning
      const baseFov = 50
      const extraFov = 14
      earthCamera.fov = baseFov + extraFov * mobileZoomKRef.current
      earthCamera.updateProjectionMatrix()

      // Earth X desired shift (we will CLAMP it later in animate)
      const radius = earthWorldRadiusRef.current || (earthScale || 4) * 1.05

      earthOffsetXRef.current = 0
    }

    const applyBackgroundResize = () => {
      const el = mountRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const width = Math.max(1, Math.round(rect.width))
      const height = Math.max(1, Math.round(rect.height))

      backgroundCamera.aspect = width / height
      backgroundCamera.updateProjectionMatrix()
      backgroundRenderer.setSize(width, height, false)
    }

    const handleResize = () => {
      applyBackgroundResize()
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

    // init sizes
    handleResize()
    viewportCurrentRef.current = { ...viewportTargetRef.current }
    committedSizeRef.current = { w: viewportTargetRef.current.w, h: viewportTargetRef.current.h }
    // initial commit
    earthRenderer.setSize(viewportTargetRef.current.w, viewportTargetRef.current.h, false)
    earthCamera.aspect = viewportTargetRef.current.w / viewportTargetRef.current.h
    earthCamera.updateProjectionMatrix()

    // ===== Load GLB =====
    const getDefaultGlbPath = () => {
      if (context?.folderUrl) {
        const baseUrl = context.folderUrl.replace('/experience/../', '/')
        return `${baseUrl}dist/runtime/assets/earth_night.glb`
      }
      const baseUrl = window.location.origin
      return `${baseUrl}/widgets/space-eco-monitoring-widget/dist/runtime/assets/earth_night.glb`
    }

    const earthModelUrl = glbUrl || getDefaultGlbPath()

    // placeholder sphere while loading
    const placeholderGeometry = new THREE.SphereGeometry(1, 64, 64)
    const placeholderMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a3a5a,
      emissive: 0x0a1a2a,
      emissiveIntensity: 0.3,
      roughness: 0.8,
      metalness: 0.1
    })

    const placeholderEarth = new THREE.Mesh(placeholderGeometry, placeholderMaterial)
    placeholderEarth.scale.set(earthScale || 4, earthScale || 4, earthScale || 4)
    placeholderEarth.position.set(0, earthPositionYRef.current, 0)
    earthScene.add(placeholderEarth)
    placeholderEarthRef.current = placeholderEarth

    const loader = new GLTFLoader()
    loader.load(
      earthModelUrl,
      (gltf) => {
        if (placeholderEarthRef.current) {
          earthScene.remove(placeholderEarthRef.current)
          placeholderEarthRef.current.geometry.dispose()
            ; (placeholderEarthRef.current.material as THREE.Material).dispose()
          placeholderEarthRef.current = undefined
        }

        const earth = gltf.scene
        // ✅ compute real world radius (earth + atmosphere) for correct clamping
        const sphere = new THREE.Sphere()
        const box = new THREE.Box3().setFromObject(earth)
        box.getBoundingSphere(sphere)
        const earthR = Math.max(0.001, sphere.radius)
        const atmR = 1.02 * (earthScale || 4) // atmosphere radius in world units
        earthWorldRadiusRef.current = Math.max(earthR, atmR) * 1.03

        // Atmosphere
        const atmosphereGeometry = new THREE.SphereGeometry(1.02, 64, 64)
        const atmosphereMaterial = new THREE.ShaderMaterial({
          uniforms: {
            sunDirection: { value: new THREE.Vector3(-0.8, 0.1, -0.6).normalize() },
            sunIntensity: { value: 1.5 },
            atmosphereColor: { value: new THREE.Color(0x87ceeb) },
            glowColor: { value: new THREE.Color(0xffe4b5) }
          },
          vertexShader: `
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              vViewPosition = -mvPosition.xyz;
              gl_Position = projectionMatrix * mvPosition;
            }
          `,
          fragmentShader: `
            uniform vec3 sunDirection;
            uniform float sunIntensity;
            uniform vec3 atmosphereColor;
            uniform vec3 glowColor;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
              vec3 normal = normalize(vNormal);
              vec3 viewDir = normalize(vViewPosition);

              float rim = 1.0 - max(dot(viewDir, normal), 0.0);
              float rimPower = pow(rim, 2.0);

              float sunDot = max(dot(normal, sunDirection), 0.0);

              vec3 color = mix(atmosphereColor, glowColor, rimPower * 0.95);
              float intensity = rimPower * 2.0 + sunDot * 1.0;

              float terminator = smoothstep(0.2, 0.8, rim);
              intensity += terminator * 1.2;

              gl_FragColor = vec4(color, intensity * 1.2);
            }
          `,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false
        })

        const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
        atmosphere.position.set(0, earthPositionYRef.current, 0)
        atmosphere.rotation.set(0, 0, 0)
        atmosphereRotationRef.current = 0

        const currentEarthScale = earthScale || 4
        atmosphere.scale.set(currentEarthScale, currentEarthScale, currentEarthScale)

        earthScene.add(atmosphere)
        atmosphereRef.current = atmosphere

        // enhance Earth materials
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

        earth.scale.set(earthScale, earthScale, earthScale)
        earth.position.set(0, earthPositionYRef.current, 0)
        earthScene.add(earth)
        earthRef.current = earth

        isModelLoadedRef.current = true
        isLoadingRef.current = false

        // recompute after load
        computeEarthViewportTarget()
      },
      undefined,
      (err) => {
        console.error('Error loading Earth GLB:', err)
      }
    )

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
      const canvas = earthRenderer.domElement

      canvas.style.left = `${Math.round(cur.left)}px`
      canvas.style.width = `${cssW}px`
      canvas.style.height = '100%'

      // keep camera correct for current CSS viewport
      earthCamera.aspect = cssW / cssH
      earthCamera.updateProjectionMatrix()

      // ✅ commit REAL buffer resize only when user stopped resizing
      const shouldCommit = !isResizingRef.current || forceCommitRef.current
      if (shouldCommit) {
        forceCommitRef.current = false
        const last = committedSizeRef.current
        if (cssW !== last.w || cssH !== last.h) {
          earthRenderer.setSize(cssW, cssH, false)
          committedSizeRef.current = { w: cssW, h: cssH }
        }
      }

      // camera distance logic
      const startCameraDistance = 10000
      // ✅ iPad 1024: немного дальше (шар меньше и не режется)
      const radius = earthWorldRadiusRef.current || (earthScale || 4) * 1.05

      // base target (your artistic choice)
      const baseFinal = 690
      const extraFinal = 420
      const targetByDesign = baseFinal + extraFinal * mobileZoomKRef.current

      // ✅ guarantee the whole sphere fits in current aspect/FOV (prevents any side cuts)
      const v = THREE.MathUtils.degToRad(earthCamera.fov)
      const hFov = 2 * Math.atan(Math.tan(v / 2) * earthCamera.aspect)

      // distance needed so radius fits vertically AND horizontally
      const fitDistance =
        (radius * 1.08) / Math.min(Math.tan(v / 2), Math.tan(hFov / 2))

      const finalCameraDistance = Math.max(targetByDesign, fitDistance)
      // ✅ clamp X shift so earth cannot be pushed outside frustum
      const v2 = THREE.MathUtils.degToRad(earthCamera.fov) / 2
      const h2 = Math.atan(Math.tan(v2) * earthCamera.aspect)

      const halfWorldW = earthCamera.position.z * Math.tan(h2)
      const maxX = Math.max(0, halfWorldW - radius * 1.05)

      const desiredX = earthOffsetXRef.current || 0
      const xShift = Math.max(-maxX, Math.min(maxX, desiredX))

      if (earthRef.current) earthRef.current.position.x = xShift
      if (placeholderEarthRef.current) placeholderEarthRef.current.position.x = xShift
      if (atmosphereRef.current) atmosphereRef.current.position.x = xShift

      const animationDuration = 2.5

      if (isLoadingRef.current || !isModelLoadedRef.current) {
        const elapsedTime = (currentTime - cameraAnimationStartTimeRef.current) / 1000
        const progress = Math.min(elapsedTime / animationDuration, 1.0)
        const easedProgress = 1 - Math.pow(1 - progress, 3)

        const currentDistance =
          startCameraDistance - (startCameraDistance - finalCameraDistance) * easedProgress

        earthCamera.position.z = currentDistance
        earthCamera.lookAt(0, earthPositionYRef.current, 0);
        cameraAnimationProgressRef.current = easedProgress;

        earthCamera.lookAt(0, earthPositionYRef.current, 0)
        // ✅ keep earth inside sliced-canvas for iPad widths
        const xShift = earthOffsetXRef.current || 0

        if (earthRef.current) {
          earthRef.current.position.x = xShift
        }

        if (placeholderEarthRef.current) {
          placeholderEarthRef.current.position.x = xShift
        }

        if (atmosphereRef.current) {
          atmosphereRef.current.position.x = xShift
        }

        cameraAnimationProgressRef.current = easedProgress
      } else if (isModelLoadedRef.current) {
        const currentZ = earthCamera.position.z
        const distanceToTarget = finalCameraDistance - currentZ

        if (Math.abs(distanceToTarget) > 0.5) {
          const transitionSpeed = 4.0
          const newZ = currentZ + distanceToTarget * (1 - Math.exp(-transitionSpeed * clampedDelta))
          earthCamera.position.z = newZ
          earthCamera.lookAt(0, earthPositionYRef.current, 0)

          const totalDistance = startCameraDistance - finalCameraDistance
          const traveledDistance = startCameraDistance - currentZ
          cameraAnimationProgressRef.current = Math.min(traveledDistance / totalDistance, 0.99)
        } else {
          earthCamera.position.z = finalCameraDistance
          earthCamera.lookAt(0, earthPositionYRef.current, 0)
          cameraAnimationProgressRef.current = 1.0
          triggerEarthReady()
        }
      }

      if (placeholderEarthRef.current && isLoadingRef.current) {
        placeholderEarthRef.current.rotation.y += 0.002
      }

      if (earthRef.current) {
        const isAnimating = cameraAnimationProgressRef.current < 1.0
        earthRef.current.rotation.y += earthSpeedRef.current * (isAnimating ? 0.003 : 0.001)
      }

      if (atmosphereRef.current) {
        const atmosphereSpeed = atmosphereSpeedRef.current * 0.001
        atmosphereRotationRef.current += atmosphereSpeed
        atmosphereRef.current.rotation.y = atmosphereRotationRef.current
      }

      if (starsRef.current) {
        starsRef.current.rotation.y += 0.0001
      }

      backgroundRenderer.render(backgroundScene, backgroundCamera)
      earthRenderer.render(earthScene, earthCamera)
    }

    animate(performance.now())

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', handleResize)

      if (resizeIdleTimerRef.current != null) {
        window.clearTimeout(resizeIdleTimerRef.current)
        resizeIdleTimerRef.current = null
      }

      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current)

      // remove canvases safely
      if (mountEl) {
        if (backgroundRenderer.domElement && mountEl.contains(backgroundRenderer.domElement)) {
          mountEl.removeChild(backgroundRenderer.domElement)
        }
        if (earthRenderer.domElement && mountEl.contains(earthRenderer.domElement)) {
          mountEl.removeChild(earthRenderer.domElement)
        }
      }

      // dispose resources
      starsGeometry.dispose()
      starsMaterial.dispose()
      placeholderGeometry.dispose()
      placeholderMaterial.dispose()

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

      if (atmosphereRef.current) {
        earthScene.remove(atmosphereRef.current)
        atmosphereRef.current.geometry.dispose()
          ; (atmosphereRef.current.material as THREE.Material).dispose()
        atmosphereRef.current = undefined
      }

      backgroundRenderer.dispose()
      earthRenderer.dispose()
    }
  }, [glbUrl, context])

  useEffect(() => {
    earthSpeedRef.current = autoRotateSpeed
    atmosphereSpeedRef.current = atmosphereRotationSpeed
  }, [autoRotateSpeed, atmosphereRotationSpeed])

  useEffect(() => {
    earthPositionYRef.current = earthPositionY || 0
    const currentScale = earthScale || 4

    if (earthRef.current) {
      earthRef.current.scale.set(currentScale, currentScale, currentScale)
      earthRef.current.position.set(0, earthPositionYRef.current, 0)
    }

    if (placeholderEarthRef.current) {
      placeholderEarthRef.current.scale.set(currentScale, currentScale, currentScale)
      placeholderEarthRef.current.position.set(0, earthPositionYRef.current, 0)
    }

    if (atmosphereRef.current) {
      atmosphereRef.current.scale.set(currentScale * 1.02, currentScale * 1.02, currentScale * 1.02)
      atmosphereRef.current.position.set(0, earthPositionYRef.current, 0)
    }

    if (earthCameraRef.current) {
      earthCameraRef.current.lookAt(0, earthPositionYRef.current, 0)
      earthCameraRef.current.updateProjectionMatrix()
    }
  }, [earthScale, earthPositionY])

  return <div ref={mountRef} className="space-eco-earth-layer" />
}

export default Earth3D

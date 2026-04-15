import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { WidgetContext } from 'jimu-core';

interface Earth3DProps {
  glbUrl?: string;
  autoRotateSpeed?: number;
  earthScale?: number;
  /** Смещение только GLB по оси Y (из настроек виджета). */
  glbPositionY?: number;
  context?: WidgetContext;
}

const Earth3D: React.FC<Earth3DProps> = ({ glbUrl, autoRotateSpeed = 0.5, earthScale = 4, glbPositionY = -2, context }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene>();
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const earthRef = useRef<THREE.Group>();
  const animationIdRef = useRef<number>();
  const placeholderRef = useRef<THREE.Mesh>();
  const isModelLoadedRef = useRef<boolean>(false);
  const cameraAnimationStartRef = useRef<number>(0);
  const cameraAnimationProgressRef = useRef<number>(0);
  const isAnimatingRef = useRef<boolean>(false);
  const lastSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const paramsRef = useRef<{ autoRotateSpeed: number; earthScale: number; glbPositionY: number }>({
    autoRotateSpeed,
    earthScale,
    glbPositionY
  });

  const earthModelUrl = useMemo(() => {
    if (glbUrl && glbUrl.trim()) return glbUrl;

    const folderUrl = context?.folderUrl;
    if (folderUrl) {
      const baseUrl = folderUrl.replace('/experience/../', '/');
      const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      return `${normalized}dist/runtime/assets/earth_night.glb`;
    }

    return `${window.location.origin}/widgets/ecological-monitoring-widget/dist/runtime/assets/earth_night.glb`;
  }, [glbUrl, context?.folderUrl]);

  // Можно при необходимости ограничивать FPS через lastFrameTimeRef,
  // сейчас рендер идёт на полном FPS браузера для максимальной плавности
  const lastFrameTimeRef = useRef<number>(0);

  // Синхронизация paramsRef с пропсами (для анимации)
  useEffect(() => {
    paramsRef.current.autoRotateSpeed = autoRotateSpeed ?? 0.5;
    paramsRef.current.earthScale = earthScale ?? 4;
    paramsRef.current.glbPositionY = typeof glbPositionY === 'number' && !Number.isNaN(glbPositionY) ? glbPositionY : -2;
  }, [autoRotateSpeed, earthScale, glbPositionY]);

  // Только масштаб глобуса (из earthScale). Позицию не трогаем — её меняет только glbPositionY.
  useEffect(() => {
    const scale = (earthScale ?? 4) * 2.8;
    const placeholderScale = Math.max(0.03, (earthScale ?? 4) * 0.05);
    if (earthRef.current) {
      earthRef.current.scale.setScalar(scale);
      // не трогаем position — только scale
    }
    if (placeholderRef.current) {
      placeholderRef.current.scale.setScalar(placeholderScale);
    }
  }, [earthScale]);

  // Только смещение глобуса по оси Y. Scale не трогаем — только position.y.
  useEffect(() => {
    const posY = typeof glbPositionY === 'number' && !Number.isNaN(glbPositionY) ? glbPositionY : -2;
    if (earthRef.current) {
      earthRef.current.position.x = 0;
      earthRef.current.position.y = posY;
      earthRef.current.position.z = 0;
    }
    if (placeholderRef.current) {
      placeholderRef.current.position.x = 0;
      placeholderRef.current.position.y = posY;
      placeholderRef.current.position.z = 0;
    }
  }, [glbPositionY]);

  useEffect(() => {
    if (!mountRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011); // Dark blue/black starry sky
    sceneRef.current = scene;

    const startCameraDistance = 70; // немного ближе, чтобы уменьшить диапазон зума
    const finalCameraDistance = 2.2; // чуть дальше, чтобы не так резко «влетать» в глобус
    const cameraAnimationDuration = 3400; // более длительная и плавная анимация
    cameraAnimationStartRef.current = performance.now();
    cameraAnimationProgressRef.current = 0;
    isModelLoadedRef.current = false;

    // Camera setup - start much farther away to mimic fly-in effect from space widget
    const camera = new THREE.PerspectiveCamera(
      50,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    // Камера смотрит в фиксированную точку; глобус смещается по Y отдельно
    camera.position.set(0, 0, startCameraDistance);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup — ограничиваем pixel ratio для плавности глобуса
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.zIndex = '0';
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Add stars (уменьшаем количество для снижения нагрузки)
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 3200;
    const starsPositions = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i++) {
      starsPositions[i] = (Math.random() - 0.5) * 2000;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Load Earth GLB model - use provided URL or default local file
    // Placeholder mesh shown while GLB loads (mimics small far-away planet)
    // Slightly reduce the base placeholder geometry so it appears smaller on screen
    const placeholderGeometry = new THREE.SphereGeometry(0.15, 16, 16);
    const placeholderMaterial = new THREE.MeshStandardMaterial({
      color: 0x3ba7ff,
      emissive: 0x0a1f44,
      wireframe: true
    });
    const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    // Keep placeholder tiny regardless of earthScale to mimic a distant planet
    const placeholderScale = Math.max(0.03, (paramsRef.current.earthScale || 4) * 0.05);
    placeholder.scale.setScalar(placeholderScale);
    const placeholderEarthY = paramsRef.current.glbPositionY ?? -2;
    placeholder.position.set(0, placeholderEarthY, 0);
    scene.add(placeholder);
    placeholderRef.current = placeholder;

    const loader = new GLTFLoader();
    loader.load(
      earthModelUrl,
      (gltf) => {
        const earth = gltf.scene;
        const adjustedScale = (paramsRef.current.earthScale || 4) * 2.8;
        earth.scale.setScalar(adjustedScale);
        const loadedEarthY = paramsRef.current.glbPositionY ?? -2;
        earth.position.set(0, loadedEarthY, 0);
        scene.add(earth);
        earthRef.current = earth;
        if (placeholderRef.current) {
          scene.remove(placeholderRef.current);
          placeholderRef.current.geometry.dispose();
          placeholderRef.current.material.dispose();
          placeholderRef.current = undefined;
        }
        isModelLoadedRef.current = true;
        // Оптимизация глобуса в idle — меньше лагов при рендере, остальные элементы без изменений
        const optimizeGlobe = () => {
          earth.traverse((child) => {
            const obj = child as THREE.Mesh;
            if (obj.isMesh) {
              obj.frustumCulled = true;
              obj.castShadow = false;
              obj.receiveShadow = false;
              if (obj.geometry?.computeBoundingSphere) {
                obj.geometry.computeBoundingSphere();
              }
            }
          });
        };
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(optimizeGlobe, { timeout: 500 });
        } else {
          optimizeGlobe();
        }
      },
      (progress) => {
        // Loading progress
        void progress;
      },
      (error) => {
        void error;
      }
    );

    const isRenderableNow = () => {
      const el = mountRef.current;
      if (!el) return false;
      if (document.visibilityState !== 'visible') return false;
      const width = el.clientWidth;
      const height = el.clientHeight;
      return width > 0 && height > 0;
    };

    const updateSize = () => {
      const el = mountRef.current;
      if (!el) return false;
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width <= 0 || height <= 0) return false;
      if (lastSizeRef.current.width === width && lastSizeRef.current.height === height) return true;

      lastSizeRef.current = { width, height };
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      return true;
    };

    const stopAnimation = () => {
      isAnimatingRef.current = false;
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      animationIdRef.current = undefined;
    };

    // Animation loop
    const animate = () => {
      if (!isAnimatingRef.current) return;
      animationIdRef.current = requestAnimationFrame(animate);
      if (!isRenderableNow()) return;

      // Handle camera zoom similar to space widget
      const now = performance.now();
      const elapsed = now - cameraAnimationStartRef.current;
      const progress = Math.min(elapsed / cameraAnimationDuration, 1);
      cameraAnimationProgressRef.current = progress;
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      if (!isModelLoadedRef.current) {
        // Плавное приближение камеры сзади к центру
        const currentDistance = startCameraDistance - (startCameraDistance - finalCameraDistance) * easedProgress;
        camera.position.z = currentDistance;
        // Камера остается по центру по Y во время приближения
        camera.position.y = 0;
      } else {
        const damping = 0.08;
        camera.position.z += (finalCameraDistance - camera.position.z) * damping;
        camera.position.y += (0 - camera.position.y) * damping; // Камера по центру по Y
      }
      // Камера смотрит в фиксированную точку — смещается только глобус, без визуального «увеличения»
      const fixedLookAtY = 0;
      camera.lookAt(0, fixedLookAtY, 0);

      // Только смещение глобуса по Y (scale не трогаем)
      const posY = paramsRef.current.glbPositionY ?? -2;
      if (earthRef.current) {
        earthRef.current.position.x = 0;
        earthRef.current.position.y = posY;
        earthRef.current.position.z = 0;
        const isZooming = cameraAnimationProgressRef.current < 1;
        const speedMultiplier = isZooming ? 0.003 : 0.001;
        earthRef.current.rotation.y += paramsRef.current.autoRotateSpeed * speedMultiplier;
      }
      if (placeholderRef.current) {
        placeholderRef.current.position.x = 0;
        placeholderRef.current.position.y = posY;
        placeholderRef.current.position.z = 0;
        placeholderRef.current.rotation.y += 0.002;
      }

      // Rotate stars slowly
      stars.rotation.y += 0.0001;

      renderer.render(scene, camera);
    };

    const startAnimation = () => {
      if (isAnimatingRef.current) return;
      if (!updateSize()) return;
      isAnimatingRef.current = true;
      animate();
    };

    startAnimation();

    let resizeRaf = 0;
    const scheduleResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        const ok = updateSize();
        if (ok) startAnimation();
        else stopAnimation();
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        scheduleResize();
      } else {
        stopAnimation();
      }
    };

    const onWindowResize = () => scheduleResize();
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('visibilitychange', onVisibility);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => scheduleResize())
      : null;
    resizeObserver?.observe(mountRef.current);

    const onContextLost = (e: Event) => {
      // Prevent the browser from trying to auto-restore; we pause rendering.
      (e as any).preventDefault?.();
      stopAnimation();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost as EventListener, { passive: false } as any);
    renderer.domElement.addEventListener('webglcontextrestored', scheduleResize as any);

    return () => {
      stopAnimation();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', onWindowResize);
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost as EventListener);
      renderer.domElement.removeEventListener('webglcontextrestored', scheduleResize as any);

      if (placeholderRef.current) {
        scene.remove(placeholderRef.current);
        placeholderRef.current.geometry.dispose();
        placeholderRef.current.material.dispose();
        placeholderRef.current = undefined;
      }
      if (earthRef.current) {
        scene.remove(earthRef.current);
        earthRef.current.traverse((obj) => {
          const anyObj = obj as any;
          if (anyObj.geometry?.dispose) anyObj.geometry.dispose();
          if (anyObj.material) {
            const mats = Array.isArray(anyObj.material) ? anyObj.material : [anyObj.material];
            mats.forEach((m: any) => m?.dispose?.());
          }
        });
        earthRef.current = undefined;
      }
      starsGeometry.dispose();
      starsMaterial.dispose();
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      // @ts-expect-error - optional API
      renderer.forceContextLoss?.();
      renderer.dispose();
    };
  }, [earthModelUrl]);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  );
};

export default Earth3D;


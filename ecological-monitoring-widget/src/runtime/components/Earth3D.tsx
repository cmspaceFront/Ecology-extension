import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { WidgetContext } from 'jimu-core';

interface Earth3DProps {
  glbUrl?: string;
  autoRotateSpeed?: number;
  earthScale?: number;
  earthPositionY?: number;
  context?: WidgetContext;
}

const Earth3D: React.FC<Earth3DProps> = ({ glbUrl, autoRotateSpeed = 0.5, earthScale = 4, earthPositionY = -2, context }) => {
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

  useEffect(() => {
    if (!mountRef.current) return;

    console.log('Earth3D: Initializing scene...');
    console.log('Mount element dimensions:', mountRef.current.clientWidth, mountRef.current.clientHeight);

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000011); // Dark blue/black starry sky
    sceneRef.current = scene;

    const startCameraDistance = 60;
    const finalCameraDistance = 5;
    const cameraAnimationDuration = 2200; // ms
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
    camera.position.set(0, 1.5, startCameraDistance);
    camera.lookAt(0, -1, 0); // Look at point below center (do not move Earth)
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.zIndex = '0';
    rendererRef.current = renderer;
    mountRef.current.appendChild(renderer.domElement);
    console.log('Earth3D: Canvas element added to DOM');
    console.log('Canvas element:', renderer.domElement);
    console.log('Canvas dimensions:', renderer.domElement.width, renderer.domElement.height);

    // Lighting setup
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Add stars
    const starsGeometry = new THREE.BufferGeometry();
    const starsCount = 10000;
    const starsPositions = new Float32Array(starsCount * 3);

    for (let i = 0; i < starsCount * 3; i++) {
      starsPositions[i] = (Math.random() - 0.5) * 2000;
    }

    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starsPositions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
    const stars = new THREE.Points(starsGeometry, starsMaterial);
    scene.add(stars);

    // Load Earth GLB model - use provided URL or default local file
    // Construct path to GLB file relative to widget's dist folder
    const getDefaultGlbPath = () => {
      // First, try to use context.folderUrl (works in ArcGIS Enterprise)
      if (context?.folderUrl) {
        // Fix the URL construction - remove the experience/../ part that gets resolved incorrectly
        const baseUrl = context.folderUrl.replace('/experience/../', '/');
        const assetPath = `${baseUrl}dist/runtime/assets/earth_night.glb`;
        return assetPath;
      }

      // Fallback: Use window.location.origin for absolute path (works in standard deployments)
      const baseUrl = window.location.origin;
      const assetPath = `${baseUrl}/widgets/ecological-monitoring-widget/dist/runtime/assets/earth_night.glb`;
      return assetPath;
    };

    const earthModelUrl = glbUrl || getDefaultGlbPath();
    console.log('Loading Earth GLB from:', earthModelUrl);
    console.log('Base URL:', (window as any).jimuConfig?.baseUrl || window.location.origin);

    // Placeholder mesh shown while GLB loads (mimics small far-away planet)
    // Slightly reduce the base placeholder geometry so it appears smaller on screen
    const placeholderGeometry = new THREE.SphereGeometry(0.15, 32, 32);
    const placeholderMaterial = new THREE.MeshStandardMaterial({
      color: 0x3ba7ff,
      emissive: 0x0a1f44,
      wireframe: true
    });
    const placeholder = new THREE.Mesh(placeholderGeometry, placeholderMaterial);
    // Keep placeholder tiny regardless of earthScale to mimic a distant planet
    const placeholderScale = Math.max(0.03, earthScale * 0.05);
    placeholder.scale.setScalar(placeholderScale);
    placeholder.position.set(0, earthPositionY, 0);
    scene.add(placeholder);
    placeholderRef.current = placeholder;

    const loader = new GLTFLoader();
    loader.load(
      earthModelUrl,
      (gltf) => {
        console.log('Earth GLB loaded successfully!');
        const earth = gltf.scene;
        earth.scale.setScalar(earthScale);
        earth.position.set(0, earthPositionY, 0); // Position Earth lower on screen (configurable)
        scene.add(earth);
        earthRef.current = earth;
        console.log('Earth added to scene with scale:', earthScale, 'position Y:', earthPositionY);
        if (placeholderRef.current) {
          scene.remove(placeholderRef.current);
          placeholderRef.current.geometry.dispose();
          placeholderRef.current.material.dispose();
          placeholderRef.current = undefined;
        }
        isModelLoadedRef.current = true;
      },
      (progress) => {
        // Loading progress
        if (progress.lengthComputable) {
          const percentComplete = (progress.loaded / progress.total) * 100;
          console.log('Earth model loading:', percentComplete.toFixed(2) + '%');
        } else {
          console.log('Loading Earth model...', progress.loaded, 'bytes');
        }
      },
      (error) => {
        console.error('Error loading Earth GLB:', error);
        console.log('Attempted URL:', earthModelUrl);
        console.log('Context folderUrl:', context?.folderUrl);
        console.log('Base URL:', (window as any).jimuConfig?.baseUrl || window.location.origin);
        console.log('Please ensure:');
        console.log('1. Widget has been rebuilt after adding copy-files.json');
        console.log('2. File exists at: src/runtime/assets/earth_night.glb');
        console.log('3. File is copied to: dist/runtime/assets/earth_night.glb after build');
      }
    );

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);

      // Handle camera zoom similar to space widget
      const now = performance.now();
      const elapsed = now - cameraAnimationStartRef.current;
      const progress = Math.min(elapsed / cameraAnimationDuration, 1);
      cameraAnimationProgressRef.current = progress;
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      if (!isModelLoadedRef.current) {
        const currentDistance = startCameraDistance - (startCameraDistance - finalCameraDistance) * easedProgress;
        camera.position.z = currentDistance;
      } else {
        const damping = 0.08;
        camera.position.z += (finalCameraDistance - camera.position.z) * damping;
      }
      camera.lookAt(0, -1, 0);

      // Rotate Earth slowly (speed-up while zoom active)
      if (earthRef.current) {
        const isZooming = cameraAnimationProgressRef.current < 1;
        const speedMultiplier = isZooming ? 0.003 : 0.001;
        earthRef.current.rotation.y += autoRotateSpeed * speedMultiplier;
      }
      if (placeholderRef.current) {
        placeholderRef.current.rotation.y += 0.002;
      }

      // Rotate stars slowly
      stars.rotation.y += 0.0001;

      renderer.render(scene, camera);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (placeholderRef.current) {
        scene.remove(placeholderRef.current);
        placeholderRef.current.geometry.dispose();
        placeholderRef.current.material.dispose();
        placeholderRef.current = undefined;
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [glbUrl, autoRotateSpeed, earthScale, earthPositionY, context]);

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


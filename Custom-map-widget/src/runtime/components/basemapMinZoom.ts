/**
 * Минимальный уровень зума (максимальное отдаление) для не-полноэкранного режима.
 * streets / dark gray → 5; satellite / hybrid / topographic → 6.
 */
export function getMinZoomForBasemap(basemapId: string): number {
  if (basemapId === 'streets-night-vector' || basemapId === 'dark-gray-vector') {
    return 5;
  }
  if (basemapId === 'satellite' || basemapId === 'hybrid' || basemapId === 'topo') {
    return 6;
  }
  return 6;
}

/**
 * Минимальный уровень зума в полноэкранном режиме.
 * streets / dark gray → 6; satellite / hybrid / topographic → 7.
 */
export function getMinZoomForBasemapFullscreen(basemapId: string): number {
  if (basemapId === 'streets-night-vector' || basemapId === 'dark-gray-vector') {
    return 6;
  }
  if (basemapId === 'satellite' || basemapId === 'hybrid' || basemapId === 'topo') {
    return 7;
  }
  return 7;
}

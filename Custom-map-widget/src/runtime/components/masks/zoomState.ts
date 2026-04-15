/**
 * Общее состояние зума для координации между MapZoom и масками
 */
export const zoomState = {
  isZooming: false,
  listeners: new Set<() => void>()
};

/**
 * Подписка на изменения состояния зума
 */
export const subscribeToZoomState = (callback: () => void) => {
  zoomState.listeners.add(callback);
  return () => {
    zoomState.listeners.delete(callback);
  };
};

/**
 * Уведомление всех подписчиков об изменении состояния зума
 */
export const notifyZoomStateChange = () => {
  zoomState.listeners.forEach(callback => callback());
};






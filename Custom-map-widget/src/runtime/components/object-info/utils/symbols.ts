// Утилиты для создания символов полигонов

// Кастомная функция easing для плавной и красивой анимации (cubic ease-in-out)
export const smoothEasing = (t: number): number => {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const createVerticalGradientDataUrl = (start: string, end: string, opacity: number = 1): string => {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Применяем прозрачность к цветам
    const applyOpacity = (color: string, alpha: number): string => {
      // Если цвет в формате #rrggbb, конвертируем в rgba
      if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      return color;
    };
    
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, applyOpacity(start, opacity));
    gradient.addColorStop(1, applyOpacity(end, opacity));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL('image/png');
};

// Функция для получения цвета заливки и обводки на основе типа
// Цвета соответствуют цветам из category-statistics-chart
// mixedColors[0] = "#00D9FF" (cyan), mixedColors[1] = "#0066FF" (blue), 
// mixedColors[2] = "#9D4EDD" (purple), mixedColors[3] = "#FF006E" (pink), 
// mixedColors[4] = "#00FF88" (green)
export const getColorsByType = (type: number | string | null | undefined): { fillColor: string; outlineColor: [number, number, number, number] } => {
  let fillColor = '#FF006E'; // Pink/magenta по умолчанию (type 3)
  let outlineColor: [number, number, number, number] = [255, 0, 110, 1.0]; // Pink outline
  
  const typeValue = type !== undefined && type !== null ? Number(type) : null;
  
  if (typeValue === 0) {
    fillColor = '#00D9FF'; // Cyan (from colorGroups[0][0])
    outlineColor = [0, 217, 255, 1.0]; // Cyan outline
  } else if (typeValue === 1) {
    fillColor = '#0066FF'; // Blue (from colorGroups[1][0])
    outlineColor = [0, 102, 255, 1.0]; // Blue outline
  } else if (typeValue === 2) {
    fillColor = '#9D4EDD'; // Purple (from colorGroups[2][0])
    outlineColor = [157, 78, 221, 1.0]; // Purple outline
  } else if (typeValue === 3) {
    fillColor = '#FF006E'; // Pink/Magenta (from colorGroups[3][0])
    outlineColor = [255, 0, 110, 1.0]; // Pink outline
  } else if (typeValue === 4) {
    fillColor = '#00FF88'; // Green (from colorGroups[4][0])
    outlineColor = [0, 255, 136, 1.0]; // Green outline
  }
  
  return { fillColor, outlineColor };
};

// Функция для затемнения цвета (уменьшает яркость на 30%)
const darkenColor = (color: string): [number, number, number] => {
  // Конвертируем hex в RGB
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  
  // Затемняем на 30% (умножаем на 0.7)
  return [
    Math.round(r * 0.7),
    Math.round(g * 0.7),
    Math.round(b * 0.7)
  ];
};

export const createDefaultMockSymbol = (zoom?: number, cache?: Map<string, any>, type?: number | string | null): any => {
  // Чем меньше зум, тем толще обводка
  // При зуме 10 - обводка 1.5, при зуме 5 - обводка 4, при зуме 1 - обводка 8
  const baseWidth = 1.5;
  const maxWidth = 8;
  let outlineWidth = baseWidth;
  
  // Получаем цвета на основе типа используя общую функцию
  const { fillColor, outlineColor } = getColorsByType(type);
  
  const typeValue = type !== undefined && type !== null ? Number(type) : null;
  
  if (zoom !== undefined) {
    // Округляем зум для кеширования (уменьшаем количество уникальных символов)
    const roundedZoom = Math.round(zoom * 2) / 2; // Округляем до 0.5
    
    // Создаем ключ кеша с учетом типа
    const cacheKey = `${roundedZoom}_${typeValue ?? 'null'}`;
    
    // Проверяем кеш
    if (cache?.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    
    // Инвертируем зум: чем меньше зум, тем больше ширина
    // zoom от 1 до 20, при zoom=20 -> width=1.5, при zoom=1 -> width=8
    const normalizedZoom = Math.max(1, Math.min(20, roundedZoom));
    outlineWidth = baseWidth + (maxWidth - baseWidth) * (1 - (normalizedZoom - 1) / 19);
  }
  
  // Увеличиваем минимальную толщину обводки для лучшей видимости
  const minOutlineWidth = Math.max(outlineWidth, 2); // Минимум 2px вместо 1.5px
  
  // Используем simple-fill с прозрачной заливкой, только обводка
  const symbol = {
    type: 'simple-fill',
    color: [0, 0, 0, 0], // Прозрачная заливка - только границы
    outline: {
      color: outlineColor,
      width: minOutlineWidth
    }
  };
  
  // Кешируем символ
  if (zoom !== undefined && cache) {
    const roundedZoom = Math.round(zoom * 2) / 2;
    const cacheKey = `${roundedZoom}_${typeValue ?? 'null'}`;
    cache.set(cacheKey, symbol);
  }
  
  return symbol;
};

export const createActiveMockSymbol = (type?: number | string | null): any => {
  // Получаем цвета на основе типа полигона
  const { fillColor, outlineColor } = getColorsByType(type);
  
  // Для обводки делаем более яркой и толстой
  const brightOutline: [number, number, number, number] = [
    Math.min(255, Math.round(outlineColor[0] * 1.2)), // Увеличиваем яркость на 20%
    Math.min(255, Math.round(outlineColor[1] * 1.2)),
    Math.min(255, Math.round(outlineColor[2] * 1.2)),
    1.0 // Полная непрозрачность
  ];
  
  // Используем simple-fill с прозрачной заливкой, только обводка
  return {
    type: 'simple-fill',
    color: [0, 0, 0, 0], // Прозрачная заливка - только границы
    outline: {
      color: brightOutline,
      width: 3 // Увеличена толщина обводки до 3px для лучшей видимости
    }
  };
};


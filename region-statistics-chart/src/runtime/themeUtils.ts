// Утилита для работы с темами
// Получает цвет для текущей темы из localStorage

export interface ThemeColors {
  primary: string;      // Основной цвет для баров и активных элементов
  light: string;        // Светлый вариант для градиентов
  medium: string;       // Средний цвет
  dark: string;         // Темный вариант
}

// Map theme types to colors
const themeColorMap: Record<string, ThemeColors> = {
  'type1': { // Interstellar
    primary: '#4eccf2',
    light: '#91dff6',
    medium: '#4eccf2',
    dark: '#2ec3ee'
  },
  'type2': { // Solaris
    primary: '#0ea5e9',
    light: '#38bdf8',
    medium: '#0ea5e9',
    dark: '#0284c7'
  },
  'type3': { // Galaxy
    primary: '#a855f7',
    light: '#c084fc',
    medium: '#a855f7',
    dark: '#9333ea'
  },
  'type4': { // Forest
    primary: '#10b981',
    light: '#34d399',
    medium: '#10b981',
    dark: '#059669'
  },
  'type5': { // Desert
    primary: '#f59e0b',
    light: '#fbbf24',
    medium: '#f59e0b',
    dark: '#d97706'
  },
  'type6': { // Sunset
    primary: '#ef4444',
    light: '#f87171',
    medium: '#ef4444',
    dark: '#dc2626'
  },
  'type7': { // Northern Light
    primary: '#3b82f6',
    light: '#60a5fa',
    medium: '#3b82f6',
    dark: '#2563eb'
  },
  'type8': { // Kinetic
    primary: '#a78bfa',
    light: '#c4b5fd',
    medium: '#a78bfa',
    dark: '#8b5cf6'
  }
};

// Legacy hex color to theme type mapping (for backward compatibility)
const hexToThemeTypeMap: Record<string, string> = {
  '#19253b': 'type1',
  '#0b6baa': 'type2',
  '#63289e': 'type3',
  '#00888d': 'type4',
  '#793b05': 'type5',
  '#a0202c': 'type6',
  '#1e3a8a': 'type7',
  '#7c3aed': 'type8'
};

// Цвета по умолчанию (текущая тема)
const defaultColors: ThemeColors = {
  primary: '#4eccf2',
  light: '#91dff6',
  medium: '#4eccf2',
  dark: '#2ec3ee'
};

/**
 * Получает цвета для текущей темы
 */
export const getThemeColors = (): ThemeColors => {
  if (typeof window === 'undefined') {
    return defaultColors;
  }

  try {
    const selectedTheme = localStorage.getItem('selectedThemeColor');
    if (!selectedTheme) return defaultColors;

    // Check if it's a theme type (type1, type2, etc.)
    if (themeColorMap[selectedTheme]) {
      return themeColorMap[selectedTheme];
    }

    // Check if it's a legacy hex color and convert it
    if (hexToThemeTypeMap[selectedTheme]) {
      const themeType = hexToThemeTypeMap[selectedTheme];
      // Migrate to theme type format
      localStorage.setItem('selectedThemeColor', themeType);
      return themeColorMap[themeType];
    }
  } catch (e) {
    void e;
  }

  return defaultColors;
};

/**
 * Преобразует HEX цвет в RGB
 */
export const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [0, 0, 0];
};

/**
 * Преобразует RGB в HEX
 */
export const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + [r, g, b].map((x) => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("");
};

/**
 * Получает цвет для borderGlow анимации в формате rgba
 */
export const getBorderGlowColor = (opacity: number = 0.25): string => {
  const colors = getThemeColors();
  const [r, g, b] = hexToRgb(colors.primary);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};



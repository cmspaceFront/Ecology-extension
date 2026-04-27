// Утилита для работы с темами
export interface ThemeColors {
  primary: string;
  light: string;
  medium: string;
  dark: string;
}

// Map theme types to colors
const themeColorMap: Record<string, ThemeColors> = {
  // Тема 0.1 — чёрный фон; акценты для UI
  'type01': { primary: '#e5e5e5', light: '#fafafa', medium: '#d4d4d4', dark: '#737373' },
  'type0': { primary: '#4eccf2', light: '#91dff6', medium: '#4eccf2', dark: '#2ec3ee' }, // Default
  'type1': { primary: '#4eccf2', light: '#91dff6', medium: '#4eccf2', dark: '#2ec3ee' }, // Interstellar
  'type2': { primary: '#0ea5e9', light: '#38bdf8', medium: '#0ea5e9', dark: '#0284c7' }, // Solaris
  'type3': { primary: '#a855f7', light: '#c084fc', medium: '#a855f7', dark: '#9333ea' }, // Galaxy
  'type4': { primary: '#10b981', light: '#34d399', medium: '#10b981', dark: '#059669' }, // Forest
  'type5': { primary: '#f59e0b', light: '#fbbf24', medium: '#f59e0b', dark: '#d97706' }, // Desert
  'type6': { primary: '#ef4444', light: '#f87171', medium: '#ef4444', dark: '#dc2626' }, // Sunset
  'type7': { primary: '#3b82f6', light: '#60a5fa', medium: '#3b82f6', dark: '#2563eb' }, // Northern Light
  'type8': { primary: '#a78bfa', light: '#c4b5fd', medium: '#a78bfa', dark: '#8b5cf6' }  // Kinetic
};

/** primary темы type1 — для анимированного бордера шапки при выборе type01 */
export const TYPE1_PRIMARY_FOR_BORDER_GLOW = themeColorMap['type1'].primary;

// Legacy hex color to theme type mapping (for backward compatibility)
const hexToThemeTypeMap: Record<string, string> = {
  '#000000': 'type01',
  '#ffffff': 'type0',
  '#19253b': 'type1',
  '#0b6baa': 'type2',
  '#63289e': 'type3',
  '#00888d': 'type4',
  '#793b05': 'type5',
  '#a0202c': 'type6',
  '#1e3a8a': 'type7',
  '#7c3aed': 'type8'
};

const defaultColors: ThemeColors = themeColorMap['type01'];

export const getThemeColors = (): ThemeColors => {
  if (typeof window === 'undefined') return defaultColors;
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
  } catch (e) {}
  return defaultColors;
};




// Утилита для работы с темами
export interface ThemeColors {
  primary: string;
  light: string;
  medium: string;
  dark: string;
}

const themeColorMap: Record<string, ThemeColors> = {
  '#19253b': { primary: '#4eccf2', light: '#91dff6', medium: '#4eccf2', dark: '#2ec3ee' },
  '#0b6baa': { primary: '#0ea5e9', light: '#38bdf8', medium: '#0ea5e9', dark: '#0284c7' },
  '#63289e': { primary: '#a855f7', light: '#c084fc', medium: '#a855f7', dark: '#9333ea' },
  '#00888d': { primary: '#10b981', light: '#34d399', medium: '#10b981', dark: '#059669' },
  '#793b05': { primary: '#f59e0b', light: '#fbbf24', medium: '#f59e0b', dark: '#d97706' },
  '#a0202c': { primary: '#ef4444', light: '#f87171', medium: '#ef4444', dark: '#dc2626' },
  '#1e3a8a': { primary: '#3b82f6', light: '#60a5fa', medium: '#3b82f6', dark: '#2563eb' },
  '#7c3aed': { primary: '#a78bfa', light: '#c4b5fd', medium: '#a78bfa', dark: '#8b5cf6' }
};

const defaultColors: ThemeColors = {
  primary: '#4eccf2',
  light: '#91dff6',
  medium: '#4eccf2',
  dark: '#2ec3ee'
};

export const getThemeColors = (): ThemeColors => {
  if (typeof window === 'undefined') return defaultColors;
  try {
    const selectedTheme = localStorage.getItem('selectedThemeColor');
    if (selectedTheme && themeColorMap[selectedTheme]) {
      return themeColorMap[selectedTheme];
    }
  } catch (e) {
    console.error('Error getting theme color:', e);
  }
  return defaultColors;
};




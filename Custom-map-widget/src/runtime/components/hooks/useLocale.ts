import { useState, useEffect } from "react";
// @ts-ignore - JSON импорт поддерживается в webpack
import localesData from "../locales.json";

export type Locale = "uz-Cyrl" | "uz-Latn" | "ru";

const LOCALE_STORAGE_KEY = "customLocal";
// Делаем кириллицу дефолтной, чтобы при любых нераспознанных значениях
// фолбэк шёл на uz-Cyrl, а не на ru
const DEFAULT_LOCALE: Locale = "uz-Cyrl";

export function getCurrentLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored) {
      // Нормализуем значение из localStorage (обрезаем пробелы и приводим к нижнему регистру)
      const normalized = stored.trim().toLowerCase();

      // Обрабатываем разные варианты записи узбекского (кириллица)
      if (normalized === "uz" || normalized === "uz-cyrl" || normalized === "uz_cyrl") {
        return "uz-Cyrl";
      }

      // Узбекский (латиница)
      if (normalized === "uz-latn" || normalized === "uz_latn") {
        return "uz-Latn";
      }

      // Русский
      if (normalized === "ru" || normalized === "ru-ru") {
        return "ru";
      }
      // Если значение не распознано, вернём дефолтное ниже
    }
  } catch (e) {
  }
  
  return DEFAULT_LOCALE;
}

export function useLocale() {
  const [locale, setLocale] = useState<Locale>(getCurrentLocale());

  useEffect(() => {
    const intervalId = setInterval(() => {
      const currentLocale = getCurrentLocale();
      setLocale(prev => {
        if (currentLocale !== prev) {
          return currentLocale;
        }
        return prev;
      });
    }, 2000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LOCALE_STORAGE_KEY || e.key === null) {
        const newLocale = getCurrentLocale();
        setLocale(newLocale);
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      const currentLocale = getCurrentLocale();
      setLocale(prev => {
        if (currentLocale !== prev) {
          return currentLocale;
        }
        return prev;
      });
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        const currentLocale = getCurrentLocale();
        setLocale(prev => {
          if (currentLocale !== prev) {
            return currentLocale;
          }
          return prev;
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const t = (key: string, params?: Record<string, any>): string => {
    try {
      const keys = key.split(".");
      let value: any = localesData;
      
      for (const k of keys) {
        if (value === null || value === undefined) {
          return key;
        }
        value = value[k];
        if (value === undefined) {
          return key;
        }
      }
      
      if (typeof value === "object" && value !== null) {
        let result = value[locale] || value[DEFAULT_LOCALE] || key;

        // Заменяем параметры в строке
        if (params) {
          Object.keys(params).forEach(paramKey => {
            result = result.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(params[paramKey]));
          });
        }
        
        return result;
      }
      
      return String(value);
    } catch (e) {
      return key;
    }
  };

  return {
    locale,
    t
  };
}


import { useState, useEffect } from "react";
import localesData from "../locales.json";

export type Locale = "uz-Cyrl" | "uz-Latn" | "ru";

const LOCALE_STORAGE_KEY = "customLocal";
const DEFAULT_LOCALE: Locale = "ru";

export function getCurrentLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && (stored === "uz-Cyrl" || stored === "uz-Latn" || stored === "ru")) {
      return stored as Locale;
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

  // Убран слушатель click - он вызывал проверку локали при каждом клике,
  // что создавало большую нагрузку на производительность
  // Локализация обновляется через storage события и интервал

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
        return value[locale] || value[DEFAULT_LOCALE] || key;
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


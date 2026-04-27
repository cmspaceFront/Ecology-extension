/** @jsx jsx */
import {
  React,
  jsx,
  type AllWidgetProps,
} from "jimu-core";
import { useState, useEffect } from "react";
import { IMConfig } from "../config";
import { translations } from "./translations";
import YearFilter from "./components/YearFilter";
import RegionCard from "./components/RegionCard";
import regionsData from "./regions.json";
import districtsData from "./districts.json";
import mahallasData from "./mahallas.json";
import { getThemeColors } from "./themeUtils";
import "./style.scss";

// Структура данных из API
interface ApiMahalla {
  mahalla_id: number;
  quantity: number;
}

interface ApiDistrict {
  district: string;
  quantity: number;
  mahallas: ApiMahalla[];
}

interface ApiRegion {
  region: number;
  quantity: number;
  districts: ApiDistrict[];
}

interface ApiData {
  year: number;
  quantity: number;
  regions: ApiRegion[];
}

// Иерархическая структура данных: области с вложенными районами и махаллями
interface Mahalla {
  name: string;
  code: string; // Код для поиска
  value: number;
}

interface District {
  name: string;
  code: string; // Код для поиска
  value: number;
  mahallas?: Mahalla[];
}

interface RegionWithDistricts {
  name: string;
  code: string; // Код для поиска
  value: number;
  districts?: District[];
}

// Типы для JSON данных
type RegionsJson = {
  [key: string]: {
    ru?: string;
    "uz-Cyrl"?: string;
    uz?: string;
    en?: string;
    qqr?: string;
  };
};

type DistrictsJson = {
  [key: string]: {
    ru?: string;
    "uz-Cyrl"?: string;
    uz?: string;
    en?: string;
    qqr?: string;
  };
};

type MahallasJson = {
  [key: string]: {
    uz?: string;
  };
};

// Функция для нормализации имен - удаление пробелов между буквами и символами
const normalizeName = (name: string): string => {
  if (!name) return name;
  
  let normalized = name;
  
  // Многократная обработка для гарантированного удаления всех пробелов
  // Повторяем несколько раз, так как могут быть вложенные пробелы
  for (let i = 0; i < 5; i++) {
    // Удаляем пробелы между буквой "o" (в любом регистре) и апострофом - приоритетная обработка
    normalized = normalized.replace(/([oO])\s+([''ʻʼʽ`])/gi, "$1$2");
    normalized = normalized.replace(/([''ʻʼʽ`])\s+([oO])/gi, "$1$2");
    
    // Удаляем пробелы между любой буквой/цифрой и апострофом
    normalized = normalized.replace(/([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])\s+([''ʻʼʽ`])/gi, "$1$2");
    normalized = normalized.replace(/([''ʻʼʽ`])\s+([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])/gi, "$1$2");
    
    normalized = normalized.replace(/([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])\s+([\p{P}\p{S}])/gu, "$1$2");
    normalized = normalized.replace(/([\p{P}\p{S}])\s+([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])/gu, "$1$2");
    
    // Обрабатываем неразрывные пробелы и другие Unicode пробелы
    normalized = normalized.replace(/([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])[\u00A0\u2000-\u200B\u202F\u205F\u3000]+([''ʻʼʽ`])/gi, "$1$2");
    normalized = normalized.replace(/([''ʻʼʽ`])[\u00A0\u2000-\u200B\u202F\u205F\u3000]+([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])/gi, "$1$2");
    normalized = normalized.replace(/([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])[\u00A0\u2000-\u200B\u202F\u205F\u3000]+([\p{P}\p{S}])/gu, "$1$2");
    normalized = normalized.replace(/([\p{P}\p{S}])[\u00A0\u2000-\u200B\u202F\u205F\u3000]+([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])/gu, "$1$2");
  }
  
  return normalized;
};

type DistrictsTitleLocale = "uz" | "uzcryl" | "ru" | "en" | "qqr";

/**
 * Заголовок списка районов по коду региона (`regions.json`) и языку.
 * Коды совпадают с полем `region` из API после String(...).
 */
const DISTRICTS_SCREEN_TITLE: Record<string, Record<DistrictsTitleLocale, string>> = {
  "1703": {
    uz: "Andijon viloyati tumanlari",
    uzcryl: "Андижон вилояти туманлари",
    ru: "Районы Андижанской области",
    en: "Districts of Andijan Region",
    qqr: "Andijon viloyatınıń tumanları",
  },
  "1706": {
    uz: "Buxoro viloyati tumanlari",
    uzcryl: "Бухоро вилояти туманлари",
    ru: "Районы Бухарской области",
    en: "Districts of Bukhara Region",
    qqr: "Buxoro viloyatınıń tumanları",
  },
  "1708": {
    uz: "Jizzax viloyati tumanlari",
    uzcryl: "Жиззах вилояти туманлари",
    ru: "Районы Джизакской области",
    en: "Districts of Jizzakh Region",
    qqr: "Jizzax viloyatınıń tumanları",
  },
  "1710": {
    uz: "Qashqadaryo viloyati tumanlari",
    uzcryl: "Қашқадарё вилояти туманлари",
    ru: "Районы Кашкадарьинской области",
    en: "Districts of Kashkadarya Region",
    qqr: "Qashqadárya viloyatınıń tumanları",
  },
  "1712": {
    uz: "Navoiy viloyati tumanlari",
    uzcryl: "Навоий вилояти туманлари",
    ru: "Районы Навоийской области",
    en: "Districts of Navoi Region",
    qqr: "Náwáyi viloyatınıń tumanları",
  },
  "1714": {
    uz: "Namangan viloyati tumanlari",
    uzcryl: "Наманган вилояти туманлари",
    ru: "Районы Наманганской области",
    en: "Districts of Namangan Region",
    qqr: "Namangan viloyatınıń tumanları",
  },
  "1718": {
    uz: "Samarqand viloyati tumanlari",
    uzcryl: "Самарқанд вилояти туманлари",
    ru: "Районы Самаркандской области",
    en: "Districts of Samarkand Region",
    qqr: "Samarqand viloyatınıń tumanları",
  },
  "1722": {
    uz: "Surxondaryo viloyati tumanlari",
    uzcryl: "Сурхондарё вилояти туманлари",
    ru: "Районы Сурхандарьинской области",
    en: "Districts of Surkhandarya Region",
    qqr: "Surxandárya viloyatınıń tumanları",
  },
  "1724": {
    uz: "Sirdaryo viloyati tumanlari",
    uzcryl: "Сирдарё вилояти туманлари",
    ru: "Районы Сырдарьинской области",
    en: "Districts of Syrdarya Region",
    qqr: "Sirdárya viloyatınıń tumanları",
  },
  "1726": {
    uz: "Toshkent shahri tumanlari",
    uzcryl: "Тошкент шахри туманлари",
    ru: "Районы г. Ташкента",
    en: "Districts of Tashkent city",
    qqr: "Toshkent shahrınıń tumanları",
  },
  "1727": {
    uz: "Toshkent viloyati tumanlari",
    uzcryl: "Тошкент вилояти туманлари",
    ru: "Районы Ташкентской области",
    en: "Districts of Tashkent Region",
    qqr: "Toshkent viloyatınıń tumanları",
  },
  "1730": {
    uz: "Farg'ona viloyati tumanlari",
    uzcryl: "Фарғона вилояти туманлари",
    ru: "Районы Ферганской области",
    en: "Districts of Fergana Region",
    qqr: "Fergana viloyatınıń tumanları",
  },
  "1733": {
    uz: "Xorazm viloyati tumanlari",
    uzcryl: "Хоразм вилояти туманлари",
    ru: "Районы Хорезмской области",
    en: "Districts of Khorezm Region",
    qqr: "Xorazm viloyatınıń tumanları",
  },
  "1735": {
    uz: "Qoraqalpog'iston Respublikasi tumanlari",
    uzcryl: "Қорақалпоғистон Республикаси туманлари",
    ru: "Районы Республики Каракалпакстан",
    en: "Districts of the Republic of Karakalpakstan",
    qqr: "Qaraqalpaqstan Respublikasınıń tumanları",
  },
};

const getDistrictsScreenTitle = (locale: string, regionCode: string): string | null => {
  const row = DISTRICTS_SCREEN_TITLE[regionCode];
  if (!row) return null;
  const normalized = locale === "uzcryl" ? "uzcryl" : locale;
  if (
    normalized === "uz" ||
    normalized === "uzcryl" ||
    normalized === "ru" ||
    normalized === "en" ||
    normalized === "qqr"
  ) {
    return row[normalized];
  }
  return null;
};

// Функции для получения названий по кодам
const getRegionName = (code: string | number, locale: string): string => {
  const codeStr = String(code);
  const region = (regionsData as RegionsJson)[codeStr];
  if (!region) return codeStr;
  
  // Нормализуем локаль для поиска
  const normalizedLocale = locale === "uzcryl" ? "uz-Cyrl" : locale;
  
  const name = region[normalizedLocale as keyof typeof region] || 
         region.ru || 
         region.uz || 
         region.en || 
         region.qqr || 
         codeStr;
  
  return normalizeName(name);
};

const getDistrictName = (code: string, locale: string): string => {
  const district = (districtsData as DistrictsJson)[code];
  if (!district) return code;
  
  // Нормализуем локаль для поиска
  const normalizedLocale = locale === "uzcryl" ? "uz-Cyrl" : locale;
  
  const name = district[normalizedLocale as keyof typeof district] || 
         district.ru || 
         district.uz || 
         district.en || 
         district.qqr || 
         code;
  
  return normalizeName(name);
};

const getMahallaName = (code: string | number, locale: string): string => {
  const codeStr = String(code);
  const mahalla = (mahallasData as MahallasJson)[codeStr];
  if (!mahalla) return codeStr;
  
  // Для махаллей доступен только uz, используем его как fallback
  const name = mahalla.uz || codeStr;
  return normalizeName(name);
};

// Функция для получения данных из API
const fetchEcologyData = async (): Promise<ApiData[]> => {
  try {
    const response = await fetch("https://api-test.spacemc.uz/api/ecology/");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: ApiData[] = await response.json();
    return data;
  } catch (error) {
    void error;
    return [];
  }
};

const getRegionsDataByYear = async (year: number, locale: string): Promise<RegionWithDistricts[]> => {
  const apiData = await fetchEcologyData();
  
  // Фильтруем данные по году
  const yearData = apiData.find((item) => item.year === year);
  
  if (yearData) {
    // Преобразуем данные для конкретного года, заменяя коды на названия
    return yearData.regions.map((region) => {
      const regionCode = String(region.region);
      return {
        name: getRegionName(regionCode, locale),
        code: regionCode,
        value: region.quantity,
        districts: region.districts.map((district) => {
          const districtCode = district.district;
          return {
            name: getDistrictName(districtCode, locale),
            code: districtCode,
            value: district.quantity,
            mahallas: district.mahallas.map((mahalla) => {
              const mahallaCode = String(mahalla.mahalla_id);
              return {
                name: getMahallaName(mahallaCode, locale),
                code: mahallaCode,
                value: mahalla.quantity,
              };
            }),
          };
        }),
      };
    });
  }

  return [];
};

// Функции для конвертации между localStorage форматом (uz-Cyrl, uz-Latn, ru) и внутренним форматом (uzcryl, uz, ru)
const normalizeLocaleFromStorage = (locale: string | null): string => {
  if (!locale) return "ru";
  if (locale === "uz-Cyrl") return "uzcryl";
  if (locale === "uz-Latn") return "uz";
  return locale;
};

const normalizeLocaleToStorage = (locale: string): string => {
  if (locale === "uzcryl") return "uz-Cyrl";
  if (locale === "uz") return "uz-Latn";
  return locale;
};

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const savedLocaleRaw =
    (typeof window !== "undefined" && localStorage.getItem("customLocal")) ||
    "ru";
  const savedLocale = normalizeLocaleFromStorage(savedLocaleRaw);
  const [locale, setLocale] = useState<string>(savedLocale);
  // Загружаем сохраненный год из localStorage при инициализации
  const savedYear = typeof window !== "undefined" ? localStorage.getItem("selectedYear") : null;
  const initialYear = savedYear ? parseInt(savedYear, 10) : null;
  const [selectedYear, setSelectedYear] = useState<number | null>(initialYear);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedItemCode, setSelectedItemCode] = useState<string | null>(null); // Код выбранного элемента для визуального выделения
  const [regionsData, setRegionsData] = useState<RegionWithDistricts[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>("desc");
  const [themeColors, setThemeColors] = useState(getThemeColors());
  const t = translations[locale] || translations.ru;

  // Функция для изменения года с сохранением в localStorage
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    if (typeof window !== "undefined") {
      localStorage.setItem("selectedYear", String(year));
      // НЕ очищаем selectedSoato при изменении года - сохраняем выбранный регион
      // localStorage.removeItem("selectedSoato"); // Закомментировано
    }
  };

  // Listen for locale changes in localStorage
  useEffect(() => {
    const checkLocale = () => {
      try {
        const stored = localStorage.getItem("customLocal");
        if (stored) {
          const newLocale = normalizeLocaleFromStorage(stored);
          setLocale(prevLocale => {
            if (newLocale !== prevLocale) {
              return newLocale;
            }
            return prevLocale;
          });
        }
      } catch (err) {
        // Ignore errors
      }
    };

    // Check on mount
    checkLocale();

    // Listen for storage events (cross-tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "customLocal" || e.key === null) {
        checkLocale();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Poll for changes in same tab
    const interval = setInterval(checkLocale, 500);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Listen for theme changes
  useEffect(() => {
    const checkTheme = () => {
      try {
        const newColors = getThemeColors();
        setThemeColors(newColors);
      } catch (err) {
        // Ignore errors
      }
    };

    // Check on mount
    checkTheme();

    // Listen for theme change events
    const handleThemeChange = () => {
      checkTheme();
    };

    window.addEventListener("theme-color-changed", handleThemeChange);
    window.addEventListener("storage", (e) => {
      if (e.key === "selectedThemeColor" || e.key === null) {
        checkTheme();
      }
    });

    // Poll for changes in same tab
    const interval = setInterval(checkTheme, 500);

    return () => {
      window.removeEventListener("theme-color-changed", handleThemeChange);
      clearInterval(interval);
    };
  }, []);

  // Загрузка данных при монтировании
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        const apiData = await fetchEcologyData();
        
        // Извлекаем доступные годы из API данных
        const years = apiData.map(item => item.year).sort((a, b) => b - a); // Сортируем по убыванию (новые первыми)
        setAvailableYears(years);
        
        // Устанавливаем год: сначала проверяем сохраненный, затем первый доступный
        if (years.length > 0) {
          const savedYearValue = typeof window !== "undefined" ? localStorage.getItem("selectedYear") : null;
          const yearToSet = savedYearValue && years.includes(parseInt(savedYearValue, 10))
            ? parseInt(savedYearValue, 10)
            : years[0];
          
          if (selectedYear === null || selectedYear !== yearToSet) {
            setSelectedYear(yearToSet);
            if (typeof window !== "undefined") {
              localStorage.setItem("selectedYear", String(yearToSet));
            }
          }
        }
      } catch (error) {
        void error;
        setAvailableYears([]);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Загрузка данных при изменении года или локали
  useEffect(() => {
    if (selectedYear === null) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const data = await getRegionsDataByYear(selectedYear, locale);
        setRegionsData(data);
        
        // Восстанавливаем выбранный элемент из localStorage после загрузки данных
        const savedSoato = typeof window !== "undefined" ? localStorage.getItem("selectedSoato") : null;
        if (savedSoato) {
          // Проверяем, есть ли этот код в загруженных данных
          const isRegion = data.some(r => r.code === savedSoato);
          if (isRegion) {
            // Это код области
            const region = data.find(r => r.code === savedSoato);
            if (region && region.districts && region.districts.length > 0) {
              setSelectedRegion(savedSoato);
              setSelectedItemCode(savedSoato);
            } else {
              // Область без районов - просто выделяем её
              setSelectedRegion(null);
              setSelectedItemCode(savedSoato);
            }
          } else {
            // Проверяем, может быть это код района
            let found = false;
            for (const region of data) {
              if (region.districts) {
                const district = region.districts.find(d => d.code === savedSoato);
                if (district) {
                  setSelectedRegion(region.code);
                  setSelectedItemCode(savedSoato);
                  found = true;
                  break;
                }
              }
            }
            // Если код не найден ни в областях, ни в районах, сбрасываем выделение
            if (!found) {
              setSelectedItemCode(null);
              setSelectedRegion(null);
              setSelectedDistrict(null);
            }
          }
        } else {
          // Если нет сохраненного кода, сбрасываем выделение
          setSelectedItemCode(null);
          setSelectedRegion(null);
          setSelectedDistrict(null);
        }
      } catch (error) {
        void error;
        setRegionsData([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
    // НЕ сбрасываем selectedRegion и selectedDistrict здесь - они восстанавливаются из localStorage
  }, [selectedYear, locale]);

  // Получаем данные для отображения: области или районы
  const getDisplayData = (): Array<{ name: string; value: number; code: string }> => {
    if (selectedRegion) {
      // Показываем районы выбранной области
      const region = regionsData.find(r => r.code === selectedRegion);
      return region?.districts?.map(d => ({ name: d.name, value: d.value, code: d.code })) || [];
    }
    // Показываем области
    return regionsData.map(r => ({ name: r.name, value: r.value, code: r.code }));
  };

  const handleRegionClick = (regionName: string, code?: string) => {
    // Ищем регион по названию, но сохраняем код
    const region = regionsData.find(r => r.name === regionName);
    if (region) {
      const regionCode = code || region.code;
      
      // Сохраняем код области в localStorage
      if (typeof window !== "undefined" && regionCode) {
        localStorage.setItem("selectedSoato", regionCode);
      }
      
      // Устанавливаем выбранный элемент для визуального выделения
      setSelectedItemCode(regionCode);
      
      if (region.districts && region.districts.length > 0) {
        // Устанавливаем выбранную область и показываем список районов
        // НЕ выбираем район автоматически - только показываем список
        setSelectedRegion(regionCode);
        setSelectedDistrict(null); // Убеждаемся, что район не выбран
        setSortOrder("desc"); // Сбрасываем сортировку на значение по умолчанию
      }
    }
  };

  const handleDistrictClick = (districtName: string, code?: string) => {
    // Ищем район по названию, но используем код для поиска
    // Этот обработчик вызывается только когда мы уже в списке районов (selectedRegion !== null)
    const region = regionsData.find(r => r.code === selectedRegion);
    const district = region?.districts?.find(d => d.name === districtName);
    
    if (district && selectedRegion) {
      const districtCode = code || district.code;
      setSortOrder("desc");

      // Повторный клик по уже выбранному району — SOATO обратно на код области/города
      if (districtCode && selectedItemCode === districtCode) {
        if (typeof window !== "undefined") {
          localStorage.setItem("selectedSoato", selectedRegion);
        }
        setSelectedItemCode(selectedRegion);
        return;
      }

      if (typeof window !== "undefined" && districtCode) {
        localStorage.setItem("selectedSoato", districtCode);
      }
      setSelectedItemCode(districtCode ?? null);
    }
  };

  const handleBackClick = () => {
    if (selectedRegion) {
      // Возврат к областям - очищаем переменную в localStorage
      if (typeof window !== "undefined") {
        localStorage.removeItem("selectedSoato");
      }
      
      setSelectedRegion(null);
      setSelectedDistrict(null);
      setSelectedItemCode(null); // Сбрасываем визуальное выделение
      setSortOrder("desc"); // Сбрасываем сортировку на значение по умолчанию
    }
  };

  const displayData = getDisplayData();
  
  // Применяем сортировку к данным
  const sortedDisplayData = sortOrder
    ? [...displayData].sort((a, b) => {
        if (sortOrder === "asc") {
          return a.value - b.value;
        } else {
          return b.value - a.value;
        }
      })
    : displayData;
  
  // Получаем названия для заголовков
  const selectedRegionName = selectedRegion 
    ? regionsData.find(r => r.code === selectedRegion)?.name || selectedRegion
    : null;

  const selectedDistrictName =
    selectedRegion && selectedItemCode && selectedItemCode !== selectedRegion
      ? regionsData
          .find((r) => r.code === selectedRegion)
          ?.districts?.find((d) => d.code === selectedItemCode)?.name ?? null
      : null;
  
  const currentTitle = selectedRegion
    ? selectedDistrictName
      ? (t.districtTumanTitle || "{name}").replace("{name}", selectedDistrictName)
      : getDistrictsScreenTitle(locale, selectedRegion) ??
        (selectedRegionName
          ? (t.districtsTitle || "{name}").replace("{name}", selectedRegionName)
          : t.statisticsByRegion || "Viloyat kesimida statistika")
    : t.statisticsByRegion || "Viloyat kesimida statistika";

  // Вычисляем цвета для borderGlow
  const [r, g, b] = (() => {
    const hex = themeColors.primary.replace('#', '');
    return [
      parseInt(hex.substr(0, 2), 16),
      parseInt(hex.substr(2, 2), 16),
      parseInt(hex.substr(4, 2), 16),
    ];
  })();

  return (
    <div className="region-statistics-widget" style={{
      '--theme-primary': themeColors.primary,
      '--theme-light': themeColors.light,
      '--theme-medium': themeColors.medium,
      '--theme-dark': themeColors.dark,
      '--border-glow-start': `rgba(${r}, ${g}, ${b}, 0.1)`,
      '--border-glow-end': `rgba(${r}, ${g}, ${b}, 0.35)`,
    } as React.CSSProperties}>
      {loading ? (
        <div className="region-card" style={{
          animation: 'cardFadeIn 0.8s ease-out'
        }}>
          <div className="region-card__title-wrapper" style={{
            animation: 'titleFadeInUp 0.7s ease-out both'
          }}>
            <div className="region-card__title-bar">
              <div className="region-card__title-left">
                {availableYears.length > 0 && (
                  <div className="region-card__title-year">
                    <YearFilter
                      variant="chart"
                      selectedYear={selectedYear || availableYears[0] || 2025}
                      years={availableYears}
                      onYearChange={handleYearChange}
                      themeColors={themeColors}
                    />
                  </div>
                )}
              </div>
              <div className="region-card__title-right">
                <span className="region-card__title-right-spacer" aria-hidden />
              </div>
            </div>
            <div className="region-card__title-center">
              <div className="region-card__title">{t.statisticsByRegion || "Viloyat kesimida statistika"}</div>
            </div>
          </div>
          <div className="region-card__chart-host">
          <div className="region-card__chart" style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '0 16px',
            animation: 'chartFadeInScale 0.9s ease-out 0.1s both'
          }}>
            {/* Скелетоны для баров */}
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div 
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  animation: `fadeInUp 0.5s ease-out ${0.2 + i * 0.08}s both`
                }}
              >
                <div style={{
                  width: '80px',
                  height: '16px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '4px',
                  animation: `pulse 1.5s ease-in-out infinite ${0.5 + i * 0.1}s`
                }} />
                <div style={{
                  flex: 1,
                  height: '24px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '6px',
                  animation: `pulse 1.5s ease-in-out infinite ${0.6 + i * 0.1}s`
                }} />
                <div style={{
                  width: '50px',
                  height: '16px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  borderRadius: '4px',
                  animation: `pulse 1.5s ease-in-out infinite ${0.7 + i * 0.1}s`
                }} />
              </div>
            ))}
          </div>
          </div>
          <style>{`
            @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(10px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes pulse {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 0.8; }
            }
          `}</style>
        </div>
      ) : displayData.length === 0 ? (
        <div className="region-card" style={{
          animation: 'cardFadeIn 0.8s ease-out'
        }}>
          <div className="region-card__title-wrapper" style={{
            animation: 'titleFadeInUp 0.7s ease-out both'
          }}>
            <div className="region-card__title-bar">
              <div className="region-card__title-left">
                {availableYears.length > 0 && (
                  <div className="region-card__title-year">
                    <YearFilter
                      variant="chart"
                      selectedYear={selectedYear || availableYears[0] || 2025}
                      years={availableYears}
                      onYearChange={handleYearChange}
                      themeColors={themeColors}
                    />
                  </div>
                )}
              </div>
              <div className="region-card__title-right">
                <span className="region-card__title-right-spacer" aria-hidden />
              </div>
            </div>
            <div className="region-card__title-center">
              <div className="region-card__title">{t.statisticsByRegion || "Viloyat kesimida statistika"}</div>
            </div>
          </div>
          <div className="region-card__chart-host">
          <div style={{ 
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: '40px 20px',
            animation: 'chartFadeInScale 0.9s ease-out 0.1s both',
            minHeight: 0,
          }}>
            {/* Иконка "нет данных" */}
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '2px dashed rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}>
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255, 255, 255, 0.4)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
            </div>
            <div style={{
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '14px',
              fontWeight: 400,
              textAlign: 'center',
            }}>
              {t.noData || "Ma'lumotlar topilmadi"}
            </div>
          </div>
          </div>
        </div>
      ) : (
        <RegionCard
          data={sortedDisplayData}
          selectedYear={selectedYear || availableYears[0] || 2025}
          onRegionClick={selectedRegion ? handleDistrictClick : handleRegionClick}
          selectedRegion={selectedRegion}
          selectedDistrict={null}
          selectedItemCode={selectedItemCode}
          onBackClick={selectedRegion ? handleBackClick : undefined}
          title={currentTitle}
          backLabel={t.back}
          sortOrder={sortOrder}
          onSortChange={setSortOrder}
          themeColors={themeColors}
          availableYears={availableYears}
          onYearChange={handleYearChange}
        />
      )}
    </div>
  );
};

export default Widget;


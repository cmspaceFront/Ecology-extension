/** @jsx jsx */
import {
  React,
  jsx,
  type AllWidgetProps
} from "jimu-core";
import { IMConfig, StatisticsData, getApiBaseUrl } from "../config";
import { getThemeColors } from "./themeUtils";
import "./styles/widget.css";

/**
 * Список `id_tur` из localStorage `selectedTypeId` (один объект или массив).
 * В URL каждый передаётся отдельным параметром: `?id_tur=ETID-4&id_tur=ETID-3`.
 * Если выбран только ETID-5 (или один EDIT-5) — он уходит в API. Если ETID-5 вместе с другими типами — ETID-5/EDIT-5 из запроса убираем.
 */
function selectedTypeIdStorageToIdTurValues(raw: string | null): string[] {
  if (raw == null || raw.trim() === "" || raw.trim() === "[]") return [];
  try {
    const parsed = JSON.parse(raw);
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed != null && typeof parsed === "object"
        ? [parsed]
        : [];
    const parts: string[] = [];
    for (const entry of items) {
      if (!entry || typeof entry !== "object") continue;
      const item = entry as { id_tur?: unknown; id?: unknown };
      if (typeof item.id_tur === "string" && item.id_tur.trim()) {
        parts.push(item.id_tur.trim());
        continue;
      }
      const id = item.id;
      if (typeof id === "number" && id >= 0 && id <= 4) {
        parts.push(`ETID-${id + 1}`);
      }
    }
    const uniq = [...new Set(parts)];
    const isEtid5Token = (v: string) => {
      const u = v.trim().toUpperCase();
      return u === "ETID-5" || u === "EDIT-5";
    };
    const hasEtid5 = uniq.some(isEtid5Token);
    if (hasEtid5 && uniq.length > 1) {
      return uniq.filter((v) => !isEtid5Token(v));
    }
    return uniq;
  } catch {
    return [];
  }
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const [data, setData] = React.useState<StatisticsData>({
    detectedCount: props.config.detectedCount ?? 0,
    detectedArea: props.config.detectedArea ?? 0,
    checkedCount: props.config.checkedCount ?? 0,
    inProgressCount: props.config.inProgressCount ?? 0
  });
  const [loading, setLoading] = React.useState<boolean>(false);
  const [isVisible, setIsVisible] = React.useState<boolean>(false);
  const [themeColors, setThemeColors] = React.useState(getThemeColors());
  // Normalize locale from storage format (uz-Latn, uz-Cyrl, ru) to internal format
  const normalizeLocale = (locale: string | null): "uz" | "ru" | "cyr" => {
    if (!locale) return "ru";
    if (locale === "uz-Latn") return "uz";
    if (locale === "uz-Cyrl") return "cyr";
    if (locale === "uz" || locale === "ru" || locale === "cyr") return locale;
    return "ru";
  };

  const [locale, setLocale] = React.useState<"uz" | "ru" | "cyr">(() => {
    try {
      const stored = localStorage.getItem("customLocal");
      return normalizeLocale(stored);
    } catch {
      return "ru";
    }
  });

  const translations: Record<"uz" | "ru" | "cyr", {
    detectedCountLabel: string;
    detectedAreaLabel: string;
    checkedCountLabel: string;
    inProgressLabel: string;
    countUnit: string;
    areaUnit: string;
    numberLocale: string;
  }> = {
    uz: {
      detectedCountLabel: "Aniqlangan obyektlar soni",
      detectedAreaLabel: "Aniqlangan obyektlar maydoni",
      checkedCountLabel: "Tekshirilgan obyektlar soni",
      inProgressLabel: "Jarayonda",
      countUnit: "ta",
      areaUnit: "ga",
      numberLocale: "uz-UZ"
    },
    cyr: {
      detectedCountLabel: "Аниқланган объектлар сони",
      detectedAreaLabel: "Аниқланган объектлар майдони",
      checkedCountLabel: "Текширилган объектлар сони",
      inProgressLabel: "Жараёнда",
      countUnit: "та",
      areaUnit: "га",
      numberLocale: "uz-Cyrl-UZ"
    },
    ru: {
      detectedCountLabel: "Количество выявленных объектов",
      detectedAreaLabel: "Площадь выявленных объектов",
      checkedCountLabel: "Количество проверенных объектов",
      inProgressLabel: "В процессе",
      countUnit: "шт",
      areaUnit: "га",
      numberLocale: "ru-RU"
    }
  };

  // Listen for locale changes in localStorage
  React.useEffect(() => {
    const checkLocale = () => {
      try {
        const stored = localStorage.getItem("customLocal");
        const newLocale = normalizeLocale(stored);
        setLocale(prevLocale => {
          if (newLocale !== prevLocale) {
            return newLocale;
          }
          return prevLocale;
        });
      } catch (err) {
        // Ignore locale lookup errors
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

  // Trigger entrance animation on mount
  React.useEffect(() => {
    setIsVisible(true);
  }, []);

  // Listen for theme changes
  React.useEffect(() => {
    const checkTheme = () => {
      try {
        const newColors = getThemeColors();
        setThemeColors(newColors);
      } catch (err) {
        // Ignore errors
      }
    };

    checkTheme();
    const handleThemeChange = () => checkTheme();
    window.addEventListener("theme-color-changed", handleThemeChange);
    window.addEventListener("storage", (e) => {
      if (e.key === "selectedThemeColor" || e.key === null) checkTheme();
    });
    const interval = setInterval(checkTheme, 500);
    return () => {
      window.removeEventListener("theme-color-changed", handleThemeChange);
      clearInterval(interval);
    };
  }, []);

  // Get token from localStorage only (not from config)
  const getToken = () => {
    try {
      const tokenFromStorage = localStorage.getItem('authToken') || localStorage.getItem('token');
      return tokenFromStorage || null;
    } catch (e) {
      return null;
    }
  };

  // Fetch data from API
  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const token = getToken();
        const apiBaseUrl = 'https://api-test.spacemc.uz';

        // Get filters from localStorage
        const selectedYear = localStorage.getItem('selectedYear');
        const selectedSoato = localStorage.getItem('selectedSoato');
        const selectedDistrict = localStorage.getItem('selectedDistrict');
        // Build URL with query parameters
        const url = new URL(`${apiBaseUrl}/api/ecology/stats/summary`);

        // Add year filter if exists
        if (selectedYear) {
          url.searchParams.append('sana', selectedYear);
        }

        // Determine if selectedSoato is region or district
        // District codes are typically 7 digits (e.g., 1727220)
        // Region codes are typically 4 digits (e.g., 1727)
        if (selectedSoato && selectedSoato !== 'all') {
          const soatoLength = selectedSoato.length;
          // If selectedDistrict exists, or SOATO code is 7 digits or longer, it's a district
          // If SOATO code is 4 digits, it's a region
          if (selectedDistrict || soatoLength >= 7) {
            // selectedSoato is a district
            url.searchParams.append('district', selectedSoato);
          } else if (soatoLength === 4) {
            // selectedSoato is a region
            url.searchParams.append('region', selectedSoato);
          }
        }

        const idTurs = selectedTypeIdStorageToIdTurValues(localStorage.getItem('selectedTypeId'));
        for (const v of idTurs) {
          url.searchParams.append('id_tur', v);
        }

        const headers: HeadersInit = {
          'Content-Type': 'application/json'
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit',
          headers,
          cache: 'no-cache'
        });

        if (response.ok) {
          const apiData = await response.json();
          setData({
            detectedCount: apiData.total_objects ?? props.config.detectedCount ?? 0,
            detectedArea: Number(apiData.total_maydon ?? props.config.detectedArea ?? 0),
            checkedCount: apiData.checked ?? props.config.checkedCount ?? 0,
            inProgressCount: apiData.in_progress ?? props.config.inProgressCount ?? 0
          });
        } else {
          const errorText = await response.text();
          void errorText;
          // Fallback to config values on API error
          setData({
            detectedCount: props.config.detectedCount ?? 0,
            detectedArea: props.config.detectedArea ?? 0,
            checkedCount: props.config.checkedCount ?? 0,
            inProgressCount: props.config.inProgressCount ?? 0
          });
        }
      } catch (err) {
        void err;
        // Check if it's a CORS or network error
        if (err instanceof TypeError && err.message === 'Failed to fetch') {
          // CORS or network error
        }
        // Fallback to config values on error
        setData({
          detectedCount: props.config.detectedCount || 0,
          detectedArea: props.config.detectedArea || 0,
          checkedCount: props.config.checkedCount || 0,
          inProgressCount: props.config.inProgressCount || 0
        });
      } finally {
        setLoading(false);
      }
    };

    // Track previous values to avoid unnecessary API calls
    let previousYear = localStorage.getItem('selectedYear');
    let previousSoato = localStorage.getItem('selectedSoato');
    let previousDistrict = localStorage.getItem('selectedDistrict');
    let previousTypeId = localStorage.getItem('selectedTypeId');

    loadData();

    // Listen for localStorage changes to refetch data (only works across tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selectedYear' || e.key === 'selectedSoato' || e.key === 'selectedDistrict' || e.key === 'selectedTypeId') {
        const currentYear = localStorage.getItem('selectedYear');
        const currentSoato = localStorage.getItem('selectedSoato');
        const currentDistrict = localStorage.getItem('selectedDistrict');
        const currentTypeId = localStorage.getItem('selectedTypeId');

        // Only refetch if values actually changed
        if (currentYear !== previousYear || currentSoato !== previousSoato || currentDistrict !== previousDistrict || currentTypeId !== previousTypeId) {
          previousYear = currentYear;
          previousSoato = currentSoato;
          previousDistrict = currentDistrict;
          previousTypeId = currentTypeId;
          loadData();
        }
      }
    };

    // Listen for custom events from other widgets
    const handleRegionChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const currentSoato = detail || localStorage.getItem('selectedSoato');
      if (currentSoato !== previousSoato) {
        previousSoato = currentSoato;
        loadData();
      }
    };

    const handleDistrictChange = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      const currentDistrict = detail || localStorage.getItem('selectedDistrict');
      if (currentDistrict !== previousDistrict) {
        previousDistrict = currentDistrict;
        loadData();
      }
    };

    // Poll for changes in the same window (since storage events only work across tabs)
    const checkForChanges = () => {
      const currentYear = localStorage.getItem('selectedYear');
      const currentSoato = localStorage.getItem('selectedSoato');
      const currentDistrict = localStorage.getItem('selectedDistrict');
      const currentTypeId = localStorage.getItem('selectedTypeId');

      if (currentYear !== previousYear || currentSoato !== previousSoato || currentDistrict !== previousDistrict || currentTypeId !== previousTypeId) {
        previousYear = currentYear;
        previousSoato = currentSoato;
        previousDistrict = currentDistrict;
        previousTypeId = currentTypeId;
        loadData();
      }
    };

    const intervalId = setInterval(checkForChanges, 100);

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('custom-map-region-change', handleRegionChange);
    window.addEventListener('custom-map-district-change', handleDistrictChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('custom-map-region-change', handleRegionChange);
      window.removeEventListener('custom-map-district-change', handleDistrictChange);
      clearInterval(intervalId);
    };
  }, [props.config.detectedCount, props.config.detectedArea, props.config.checkedCount, props.config.inProgressCount]);

  // Format number: space as thousands separator, dot as decimal separator (so decimal part is not lost)
  const currentLocale = translations[locale] || translations.uz;

  const formatNumber = (num: number, options?: { maxFractionDigits?: number }): string => {
    // Use formatToParts so we replace only thousands separator with space and use dot for decimal
    const parts = new Intl.NumberFormat(currentLocale.numberLocale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: options?.maxFractionDigits ?? 2
    }).formatToParts(num);
    return parts
      .map((p) => {
        if (p.type === "group") return " ";
        if (p.type === "decimal") return ".";
        return p.value;
      })
      .join("");
  };

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
    <div
      className={`statistics-dashboard-widget ${isVisible ? 'visible' : ''}`}
      style={{
        '--border-glow-start': `rgba(${r}, ${g}, ${b}, 0.1)`,
        '--border-glow-end': `rgba(${r}, ${g}, ${b}, 0.35)`,
        '--theme-icon-color': themeColors.primary,
      } as React.CSSProperties}
    >
      <div className="statistics-cards-container">
        {/* Card 1: Detected Objects Count */}
        <div className="statistics-card">
          <div className="statistics-card-left">
            <div className="statistics-card-value-row">
              <span className="statistics-card-value">
                {loading ? '...' : formatNumber(data.detectedCount)}
              </span>
              <span className="statistics-card-unit">{currentLocale.countUnit}</span>
            </div>
            <div className="statistics-card-label">
              {currentLocale.detectedCountLabel}
            </div>
          </div>
          <div className="statistics-card-icon">
            <svg width="29" height="29" viewBox="0 0 29 29" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.1709 23.6111C10.1709 22.9121 10.1693 22.4605 10.1383 22.1184C10.1087 21.7914 10.0591 21.6726 10.0248 21.6132C9.92916 21.4476 9.79168 21.3102 9.62607 21.2145C9.56671 21.1803 9.44792 21.1307 9.12093 21.101C8.77881 21.07 8.32726 21.0684 7.62821 21.0684H4.72223C4.02318 21.0684 3.57162 21.07 3.2295 21.101C2.90251 21.1307 2.78373 21.1803 2.72436 21.2145C2.55875 21.3102 2.42127 21.4476 2.32564 21.6132C2.29137 21.6726 2.24178 21.7914 2.21213 22.1184C2.18112 22.4605 2.17949 22.9121 2.17949 23.6111C2.17949 24.3102 2.18112 24.7617 2.21213 25.1038C2.24178 25.4308 2.29137 25.5496 2.32564 25.609C2.42127 25.7746 2.55875 25.9121 2.72436 26.0077C2.78373 26.042 2.90251 26.0916 3.2295 26.1212C3.57162 26.1522 4.02318 26.1538 4.72223 26.1538H7.62821C8.32726 26.1538 8.77881 26.1522 9.12093 26.1212C9.44792 26.0916 9.56671 26.042 9.62607 26.0077C9.79168 25.9121 9.92916 25.7746 10.0248 25.609C10.0591 25.5496 10.1087 25.4308 10.1383 25.1038C10.1693 24.7617 10.1709 24.3102 10.1709 23.6111ZM26.1538 18.09C26.1538 17.2485 26.1526 16.7044 26.1084 16.2965C26.0665 15.9094 25.9959 15.776 25.9453 15.7062C25.878 15.6137 25.7966 15.5322 25.704 15.465C25.6343 15.4144 25.5008 15.3438 25.1138 15.3018C24.7058 15.2576 24.1618 15.2564 23.3202 15.2564H20.996C20.1545 15.2564 19.6104 15.2576 19.2025 15.3018C18.8154 15.3438 18.682 15.4144 18.6122 15.465C18.5197 15.5322 18.4382 15.6137 18.371 15.7062C18.3203 15.776 18.2498 15.9094 18.2078 16.2965C18.1636 16.7044 18.1624 17.2485 18.1624 18.09V23.3202C18.1624 24.1618 18.1636 24.7058 18.2078 25.1138C18.2498 25.5008 18.3203 25.6343 18.371 25.704C18.4382 25.7966 18.5197 25.878 18.6122 25.9453C18.682 25.9959 18.8154 26.0665 19.2025 26.1084C19.6104 26.1526 20.1545 26.1538 20.996 26.1538H23.3202C24.1618 26.1538 24.7058 26.1526 25.1138 26.1084C25.5008 26.0665 25.6343 25.9959 25.704 25.9453C25.7966 25.878 25.878 25.7966 25.9453 25.704C25.9959 25.6343 26.0665 25.5008 26.1084 25.1138C26.1526 24.7058 26.1538 24.1618 26.1538 23.3202V18.09ZM10.1709 5.01311C10.1709 4.17158 10.1697 3.62749 10.1255 3.21957C10.0836 2.8325 10.013 2.69906 9.96236 2.62929C9.89514 2.53678 9.81365 2.45529 9.72114 2.38807C9.65137 2.33743 9.51793 2.26685 9.13086 2.2249C8.72295 2.1807 8.17885 2.17949 7.33732 2.17949H5.01311C4.17158 2.17949 3.62749 2.1807 3.21957 2.2249C2.8325 2.26685 2.69906 2.33743 2.62929 2.38807C2.53678 2.45529 2.45529 2.53678 2.38807 2.62929C2.33743 2.69906 2.26685 2.8325 2.2249 3.21957C2.1807 3.62749 2.17949 4.17158 2.17949 5.01311V10.2433C2.17949 11.0848 2.1807 11.6289 2.2249 12.0368C2.26685 12.4239 2.33743 12.5574 2.38807 12.6271C2.45529 12.7196 2.53678 12.8011 2.62929 12.8683C2.69906 12.919 2.8325 12.9896 3.21957 13.0315C3.62749 13.0757 4.17158 13.0769 5.01311 13.0769H7.33732C8.17885 13.0769 8.72295 13.0757 9.13086 13.0315C9.51793 12.9896 9.65137 12.919 9.72114 12.8683C9.81365 12.8011 9.89514 12.7196 9.96236 12.6271C10.013 12.5574 10.0836 12.4239 10.1255 12.0368C10.1697 11.6289 10.1709 11.0848 10.1709 10.2433V5.01311ZM26.1538 4.72223C26.1538 4.02318 26.1522 3.57162 26.1212 3.2295C26.0916 2.90251 26.042 2.78373 26.0077 2.72436C25.9121 2.55875 25.7746 2.42127 25.609 2.32564C25.5496 2.29137 25.4308 2.24178 25.1038 2.21213C24.7617 2.18112 24.3102 2.17949 23.6111 2.17949H20.7051C20.0061 2.17949 19.5545 2.18112 19.2124 2.21213C18.8854 2.24178 18.7666 2.29137 18.7073 2.32564C18.5417 2.42127 18.4042 2.55875 18.3085 2.72436C18.2743 2.78373 18.2247 2.90251 18.195 3.2295C18.164 3.57162 18.1624 4.02318 18.1624 4.72223C18.1624 5.42127 18.164 5.87283 18.195 6.21495C18.2247 6.54194 18.2743 6.66072 18.3085 6.72009C18.4042 6.8857 18.5417 7.02318 18.7073 7.11881C18.7666 7.15308 18.8854 7.20267 19.2124 7.23232C19.5545 7.26333 20.0061 7.26496 20.7051 7.26496H23.6111C24.3102 7.26496 24.7617 7.26333 25.1038 7.23232C25.4308 7.20267 25.5496 7.15308 25.609 7.11881C25.7746 7.02318 25.9121 6.8857 26.0077 6.72009C26.042 6.66072 26.0916 6.54194 26.1212 6.21495C26.1522 5.87283 26.1538 5.42127 26.1538 4.72223ZM12.3504 23.6111C12.3504 24.27 12.3513 24.8377 12.3093 25.3011C12.2659 25.7791 12.1696 26.2525 11.912 26.6987C11.6251 27.1955 11.2126 27.608 10.7158 27.8949C10.2696 28.1525 9.79624 28.2488 9.31816 28.2922C8.85484 28.3342 8.28715 28.3333 7.62821 28.3333H4.72223C4.06329 28.3333 3.49559 28.3342 3.03227 28.2922C2.55419 28.2488 2.0808 28.1525 1.63462 27.8949C1.13779 27.608 0.725348 27.1955 0.438456 26.6987C0.180856 26.2525 0.0845314 25.7791 0.0411536 25.3011C-0.00083835 24.8377 4.44253e-06 24.27 4.44253e-06 23.6111C4.44253e-06 22.9522 -0.00083835 22.3845 0.0411536 21.9212C0.0845314 21.4431 0.180856 20.9697 0.438456 20.5235C0.725348 20.0267 1.13779 19.6142 1.63462 19.3273C2.0808 19.0697 2.55419 18.9734 3.03227 18.93C3.49559 18.888 4.06329 18.8889 4.72223 18.8889H7.62821C8.28715 18.8889 8.85484 18.888 9.31816 18.93C9.79624 18.9734 10.2696 19.0697 10.7158 19.3273C11.2126 19.6142 11.6251 20.0267 11.912 20.5235C12.1696 20.9697 12.2659 21.4431 12.3093 21.9212C12.3513 22.3845 12.3504 22.9522 12.3504 23.6111ZM28.3333 23.3202C28.3333 24.113 28.335 24.7954 28.2752 25.3479C28.2131 25.9207 28.0744 26.4822 27.709 26.9853C27.5074 27.2629 27.2629 27.5074 26.9853 27.709C26.4822 28.0744 25.9207 28.2131 25.3479 28.2752C24.7954 28.335 24.113 28.3333 23.3202 28.3333H20.996C20.2032 28.3333 19.5208 28.335 18.9683 28.2752C18.3955 28.2131 17.834 28.0744 17.3309 27.709C17.0534 27.5074 16.8089 27.2629 16.6072 26.9853C16.2418 26.4822 16.1031 25.9207 16.0411 25.3479C15.9813 24.7954 15.9829 24.113 15.9829 23.3202V18.09C15.9829 17.2973 15.9813 16.6149 16.0411 16.0624C16.1031 15.4895 16.2418 14.928 16.6072 14.4249C16.8089 14.1474 17.0534 13.9029 17.3309 13.7013C17.834 13.3358 18.3955 13.1972 18.9683 13.1351C19.5208 13.0753 20.2032 13.0769 20.996 13.0769H23.3202C24.113 13.0769 24.7954 13.0753 25.3479 13.1351C25.9207 13.1972 26.4822 13.3358 26.9853 13.7013C27.2629 13.9029 27.5074 14.1474 27.709 14.4249C28.0744 14.928 28.2131 15.4895 28.2752 16.0624C28.335 16.6149 28.3333 17.2973 28.3333 18.09V23.3202ZM12.3504 10.2433C12.3504 11.0361 12.3521 11.7185 12.2923 12.271C12.2302 12.8438 12.0915 13.4053 11.7261 13.9084C11.5245 14.186 11.28 14.4304 11.0024 14.6321C10.4993 14.9975 9.93785 15.1362 9.36499 15.1982C8.8125 15.2581 8.13009 15.2564 7.33732 15.2564H5.01311C4.22034 15.2564 3.53793 15.2581 2.98545 15.1982C2.41259 15.1362 1.85111 14.9975 1.34799 14.6321C1.07045 14.4304 0.825981 14.186 0.624337 13.9084C0.258891 13.4053 0.120246 12.8438 0.0581808 12.271C-0.00163695 11.7185 4.44253e-06 11.0361 4.44253e-06 10.2433V5.01311C4.44253e-06 4.22034 -0.00163684 3.53793 0.0581808 2.98545C0.120246 2.41259 0.258891 1.85111 0.624337 1.34799C0.825981 1.07045 1.07045 0.825981 1.34799 0.624337C1.85111 0.258891 2.41259 0.120246 2.98545 0.0581808C3.53793 -0.00163684 4.22034 4.4417e-06 5.01311 4.4417e-06H7.33732C8.13009 4.4417e-06 8.8125 -0.00163683 9.36499 0.0581808C9.93785 0.120246 10.4993 0.258891 11.0024 0.624337C11.28 0.825981 11.5245 1.07045 11.7261 1.34799C12.0915 1.85111 12.2302 2.41259 12.2923 2.98545C12.3521 3.53793 12.3504 4.22034 12.3504 5.01311V10.2433ZM28.3333 4.72223C28.3333 5.38116 28.3342 5.94886 28.2922 6.41218C28.2488 6.89026 28.1525 7.36365 27.8949 7.80983C27.608 8.30666 27.1955 8.7191 26.6987 9.00599C26.2525 9.26359 25.7791 9.35992 25.3011 9.4033C24.8377 9.44529 24.27 9.44445 23.6111 9.44445H20.7051C20.0462 9.44445 19.4785 9.44529 19.0152 9.4033C18.5371 9.35992 18.0637 9.26359 17.6175 9.00599C17.1207 8.7191 16.7082 8.30666 16.4214 7.80983C16.1638 7.36365 16.0674 6.89026 16.0241 6.41218C15.9821 5.94886 15.9829 5.38116 15.9829 4.72223C15.9829 4.06329 15.9821 3.49559 16.0241 3.03227C16.0674 2.55419 16.1638 2.0808 16.4214 1.63462C16.7082 1.13779 17.1207 0.725348 17.6175 0.438456C18.0637 0.180856 18.5371 0.0845314 19.0152 0.0411536C19.4785 -0.000838347 20.0462 4.44161e-06 20.7051 4.4417e-06H23.6111C24.27 4.44161e-06 24.8377 -0.000838347 25.3011 0.0411536C25.7791 0.0845314 26.2525 0.180856 26.6987 0.438456C27.1955 0.725348 27.608 1.13779 27.8949 1.63462C28.1525 2.0808 28.2488 2.55419 28.2922 3.03227C28.3342 3.49559 28.3333 4.06329 28.3333 4.72223Z" fill="white" />
            </svg>
          </div>
        </div>

        {/* Card 2: Detected Objects Area */}
        <div className="statistics-card">
          <div className="statistics-card-left">
            <div className="statistics-card-value-row">
              <span className="statistics-card-value">
                {loading ? '...' : formatNumber(data.detectedArea)}
              </span>
              <span className="statistics-card-unit">{currentLocale.areaUnit}</span>
            </div>
            <div className="statistics-card-label">
              {currentLocale.detectedAreaLabel}
            </div>
          </div>
          <div className="statistics-card-icon">
            <svg width="34" height="27" viewBox="0 0 34 27" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M0.610991 21.0742H33.393C33.4917 21.0742 33.5889 21.0394 33.6763 20.973C33.7636 20.9065 33.8383 20.8104 33.8941 20.6929C33.9498 20.5754 33.9848 20.4401 33.996 20.2987C34.0073 20.1573 33.9945 20.0141 33.9586 19.8815L32.8474 15.768C32.7867 15.5565 32.6709 15.3876 32.5248 15.2977C32.3787 15.2077 32.214 15.2039 32.066 15.287C31.918 15.3701 31.7984 15.5335 31.733 15.7421C31.6676 15.9508 31.6615 16.1881 31.7161 16.4031L32.5047 19.3239H22.9731L22.2635 9.87901H29.9598L30.7751 12.9019C30.835 13.1149 30.9507 13.2853 31.0971 13.3763C31.2436 13.4673 31.4089 13.4716 31.5575 13.3883C31.7061 13.305 31.826 13.1407 31.8913 12.9311C31.9566 12.7214 31.962 12.4831 31.9064 12.2677L28.7489 0.558089C28.7046 0.393764 28.6269 0.25256 28.526 0.152977C28.425 0.0533944 28.3056 7.36396e-05 28.1833 0H17.5214C17.3618 0.00325804 17.2096 0.096901 17.0976 0.260678C16.9855 0.424455 16.9228 0.645204 16.9228 0.875193C16.9228 1.10518 16.9856 1.32593 17.0976 1.4897C17.2096 1.65347 17.3619 1.7471 17.5214 1.75034H20.4313L20.9105 8.12866H13.0875L13.5667 1.75034H15.0927C15.2521 1.74693 15.4043 1.65323 15.5162 1.48947C15.6282 1.32572 15.6909 1.10506 15.6909 0.875171C15.6909 0.645284 15.6282 0.424627 15.5162 0.260871C15.4043 0.0971158 15.2521 0.00340949 15.0927 0H5.81474C5.69242 7.36396e-05 5.57297 0.0533944 5.47203 0.152977C5.3711 0.25256 5.29338 0.393764 5.24906 0.558089C3.99817 5.19974 1.31223 15.1786 0.0447193 19.8828C0.0101957 20.0155 -0.00163959 20.1582 0.0102157 20.2988C0.0220711 20.4395 0.0572679 20.5739 0.112825 20.6908C0.168383 20.8077 0.242665 20.9036 0.329382 20.9703C0.416098 21.0371 0.512694 21.0727 0.610991 21.0742ZM21.6527 1.75034H27.7676L29.4878 8.12866H22.132L21.6527 1.75034ZM21.0421 9.87901L21.7517 19.3239H12.2463L12.956 9.87901H21.0421ZM6.23042 1.75034H12.3453L11.866 8.12866H4.51258L6.23042 1.75034ZM4.04118 9.87901H11.7346L11.0249 19.3239H1.49745L4.04118 9.87901Z" fill="white" />
              <path d="M33.1107 22.5857C33.05 22.374 32.9342 22.2051 32.7881 22.1151C32.642 22.0252 32.4773 22.0213 32.3292 22.1044C32.1812 22.1875 32.0616 22.3509 31.9962 22.5596C31.9308 22.7683 31.9248 23.0057 31.9794 23.2207L32.5047 25.1663H1.4933L2.01866 23.2207C2.07427 23.0053 2.06887 22.767 2.00362 22.5573C1.93838 22.3477 1.81853 22.1834 1.66996 22.1C1.52139 22.0166 1.35602 22.0208 1.20958 22.1117C1.06314 22.2026 0.947375 22.3728 0.887295 22.5857L0.0393821 25.724C0.00465145 25.8566 -0.00736392 25.9994 0.00435538 26.1402C0.0160747 26.281 0.0511829 26.4156 0.106701 26.5327C0.162219 26.6497 0.236508 26.7458 0.323266 26.8126C0.410023 26.8795 0.506688 26.9151 0.605058 26.9167H33.393C33.4917 26.9166 33.5889 26.8819 33.6763 26.8155C33.7636 26.749 33.8383 26.6529 33.8941 26.5354C33.9498 26.4179 33.9848 26.2826 33.996 26.1412C34.0073 25.9998 33.9945 25.8566 33.9586 25.724L33.1107 22.5857Z" fill="white" />
            </svg>
          </div>
        </div>

        {/* Card 3: Checked Objects Count */}
        <div className="statistics-card">
          <div className="statistics-card-left">
            <div className="statistics-card-value-row">
              <span className="statistics-card-value">
                {loading ? '...' : formatNumber(data.checkedCount)}
              </span>
              <span className="statistics-card-unit">{currentLocale.countUnit}</span>
            </div>
            <div className="statistics-card-label">
              {currentLocale.checkedCountLabel}
            </div>
          </div>
          <div className="statistics-card-icon">
            <svg width="29" height="29" viewBox="0 0 29 29" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10.358 1.65357C12.4188 -0.551095 15.915 -0.551285 17.9757 1.65357C18.5805 2.3007 19.4355 2.65553 20.3208 2.62569C23.337 2.52376 25.8096 4.99536 25.708 8.01146C25.678 8.89685 26.0329 9.75306 26.6801 10.358C28.8843 12.4187 28.8845 15.9151 26.6801 17.9757C26.0329 18.5805 25.6781 19.4355 25.708 20.3208C25.8099 23.3371 23.3371 25.8099 20.3208 25.708C19.4355 25.6781 18.5805 26.0329 17.9757 26.6801C15.9151 28.8845 12.4187 28.8843 10.358 26.6801C9.75306 26.0329 8.89684 25.678 8.01146 25.708C4.99536 25.8096 2.52376 23.337 2.62569 20.3208C2.65553 19.4355 2.3007 18.5805 1.65357 17.9757C-0.551285 15.915 -0.551095 12.4188 1.65357 10.358C2.30079 9.75306 2.65561 8.89684 2.62569 8.01146C2.52405 4.99552 4.99552 2.52405 8.01146 2.62569C8.89684 2.65561 9.75306 2.30079 10.358 1.65357ZM16.4086 3.11873C15.1958 1.82108 13.1379 1.82109 11.9251 3.11873C10.8973 4.21847 9.44325 4.82051 7.93883 4.76966C6.16419 4.71007 4.71007 6.16419 4.76966 7.93883C4.82051 9.44325 4.21847 10.8973 3.11873 11.9251C1.82109 13.1379 1.82108 15.1958 3.11873 16.4086C4.21826 17.4364 4.82048 18.8892 4.76966 20.3934C4.70968 22.1684 6.16397 23.6236 7.93883 23.564C9.44325 23.5132 10.8973 24.1152 11.9251 25.2149C13.1379 26.5122 15.1959 26.5124 16.4086 25.2149C17.4364 24.1152 18.889 23.5132 20.3934 23.564C22.1686 23.624 23.624 22.1686 23.564 20.3934C23.5132 18.889 24.1152 17.4364 25.2149 16.4086C26.5124 15.1959 26.5122 13.1379 25.2149 11.9251C24.1152 10.8973 23.5132 9.44325 23.564 7.93883C23.6236 6.16397 22.1684 4.70968 20.3934 4.76966C18.8892 4.82048 17.4364 4.21826 16.4086 3.11873Z" fill="white" />
              <path d="M18.4059 9.84117C18.8205 9.41806 19.501 9.41117 19.9241 9.82581C20.3472 10.2405 20.3541 10.9209 19.9395 11.344L13.9238 17.4813C13.7365 17.6724 13.5335 17.8818 13.3428 18.0372C13.1374 18.2045 12.8395 18.401 12.4349 18.4534C12.2374 18.4789 12.0363 18.4716 11.8413 18.431C11.4415 18.3479 11.159 18.129 10.9669 17.9464C10.7887 17.7768 10.6027 17.5521 10.4306 17.3472L8.33969 14.8582C7.95867 14.4046 8.01742 13.728 8.47099 13.347C8.92459 12.9659 9.60119 13.0247 9.98224 13.4782L12.0731 15.9672C12.1302 16.0352 12.181 16.0939 12.2254 16.146C12.2737 16.0973 12.3293 16.0433 12.3916 15.9798L18.4059 9.84117Z" fill="white" />
            </svg>
          </div>
        </div>

        {/* Card 4: In Progress */}
        <div className="statistics-card">
          <div className="statistics-card-left">
            <div className="statistics-card-value-row">
              <span className="statistics-card-value">
                {loading ? '...' : formatNumber(data.inProgressCount)}
              </span>
              <span className="statistics-card-unit">{currentLocale.countUnit}</span>
            </div>
            <div className="statistics-card-label">
              {currentLocale.inProgressLabel}
            </div>
          </div>
          <div className="statistics-card-icon">
            <svg width="29" height="29" viewBox="0 0 122.533 122.879" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M59.815,5.136c-1.235,0-2.365,0.211-3.384,0.633c-1.026,0.425-1.97,1.068-2.827,1.932L53.6,7.706l0.005,0.005 c-0.887,0.888-1.543,1.831-1.964,2.829c-0.417,0.99-0.627,2.089-0.627,3.298c0,1.228,0.213,2.349,0.636,3.364 c0.424,1.018,1.077,1.967,1.956,2.846c0.042,0.042,0.083,0.086,0.122,0.13c0.828,0.807,1.734,1.416,2.713,1.824 c1.02,0.425,2.146,0.638,3.376,0.638c1.235,0,2.358-0.213,3.37-0.637c1.014-0.424,1.946-1.07,2.797-1.934 c0.854-0.866,1.489-1.814,1.909-2.842c0.418-1.025,0.626-2.155,0.626-3.389c0-1.214-0.205-2.32-0.616-3.318 c-0.417-1.011-1.056-1.953-1.919-2.829c-0.849-0.862-1.78-1.503-2.797-1.926C62.177,5.346,61.054,5.136,59.815,5.136L59.815,5.136z M54.465,1.034C56.13,0.344,57.917,0,59.815,0c1.905,0,3.684,0.342,5.337,1.03c1.646,0.685,3.14,1.708,4.482,3.069 c1.327,1.348,2.327,2.838,3.001,4.474c0.68,1.648,1.019,3.402,1.019,5.264c0,1.894-0.335,3.665-1.008,5.314 c-0.672,1.647-1.675,3.15-3.012,4.507c-1.34,1.36-2.833,2.387-4.482,3.078c-1.65,0.692-3.429,1.039-5.337,1.039 c-1.898,0-3.682-0.348-5.342-1.04c-1.592-0.663-3.045-1.639-4.354-2.923c-0.05-0.042-0.099-0.088-0.146-0.135 c-1.347-1.347-2.368-2.851-3.06-4.511c-0.69-1.658-1.037-3.435-1.037-5.331c0-1.867,0.351-3.629,1.049-5.284 c0.695-1.647,1.712-3.138,3.048-4.474l0.005,0.005C51.322,2.732,52.821,1.716,54.465,1.034L54.465,1.034z M24.407,21.61 c-0.934,0-1.788,0.162-2.562,0.485c-0.79,0.33-1.524,0.832-2.203,1.505c-0.669,0.669-1.169,1.401-1.495,2.196 c-0.323,0.785-0.485,1.672-0.485,2.66c0,0.979,0.163,1.861,0.486,2.646c0.326,0.792,0.825,1.523,1.494,2.192 c0.678,0.673,1.413,1.175,2.203,1.505c0.774,0.323,1.627,0.485,2.562,0.485c0.979,0,1.862-0.163,2.647-0.486 c0.792-0.326,1.523-0.825,2.192-1.494l0.01-0.01l0,0c0.674-0.667,1.176-1.401,1.506-2.197c0.327-0.788,0.49-1.669,0.49-2.641 c0-0.988-0.163-1.876-0.489-2.665c-0.326-0.789-0.829-1.52-1.508-2.192l-0.01-0.01l0,0c-0.669-0.669-1.4-1.167-2.192-1.494 C26.27,21.773,25.386,21.61,24.407,21.61L24.407,21.61z M19.879,17.36c1.414-0.59,2.924-0.887,4.528-0.887 c1.627,0,3.16,0.297,4.593,0.888c1.425,0.587,2.714,1.457,3.866,2.605l0.002,0.002c1.161,1.149,2.038,2.442,2.631,3.877 c0.594,1.436,0.891,2.973,0.891,4.611c0,1.637-0.297,3.174-0.892,4.607c-0.589,1.42-1.466,2.709-2.63,3.862 c-1.152,1.15-2.442,2.021-3.868,2.608c-1.433,0.59-2.965,0.887-4.593,0.887c-1.604,0-3.114-0.296-4.528-0.887 c-1.403-0.586-2.687-1.456-3.848-2.608c-1.155-1.154-2.029-2.448-2.618-3.878c-0.591-1.433-0.888-2.965-0.888-4.592 c0-1.635,0.297-3.171,0.887-4.606c0.589-1.432,1.462-2.726,2.619-3.882C17.192,18.816,18.476,17.946,19.879,17.36L19.879,17.36z M10.01,58.65c-0.685,0-1.3,0.114-1.841,0.342c-0.556,0.234-1.079,0.598-1.566,1.092l-0.03,0.03v0 c-0.494,0.488-0.858,1.012-1.093,1.568c-0.229,0.541-0.343,1.155-0.343,1.84s0.114,1.299,0.342,1.841 c0.237,0.563,0.605,1.095,1.104,1.594l0.01,0.01l0,0c0.483,0.483,1.008,0.844,1.571,1.08c0.554,0.231,1.171,0.349,1.846,0.349 c0.712,0,1.349-0.117,1.908-0.349c0.564-0.234,1.078-0.588,1.54-1.061c0.491-0.502,0.853-1.037,1.085-1.604 c0.226-0.55,0.339-1.171,0.339-1.86s-0.113-1.312-0.34-1.86c-0.23-0.56-0.588-1.086-1.074-1.578l-0.02-0.021l-0.001,0 c-0.459-0.476-0.969-0.83-1.524-1.062C11.36,58.768,10.722,58.65,10.01,58.65L10.01,58.65z M6.182,54.277 c1.208-0.509,2.486-0.764,3.828-0.764c1.381,0,2.676,0.251,3.88,0.754s2.29,1.251,3.25,2.245v0c0.94,0.957,1.653,2.026,2.138,3.202 c0.494,1.2,0.741,2.47,0.741,3.807c0,1.335-0.247,2.604-0.74,3.807c-0.486,1.184-1.203,2.261-2.148,3.229 c-0.961,0.983-2.044,1.725-3.245,2.223c-1.204,0.5-2.498,0.751-3.875,0.751c-1.347,0-2.62-0.252-3.813-0.751 c-1.179-0.493-2.256-1.225-3.224-2.19l-0.002-0.003l-0.005-0.005l-0.004-0.005c-0.967-0.969-1.7-2.046-2.198-3.229 C0.254,66.14,0,64.862,0,63.522c0-1.342,0.255-2.619,0.764-3.827c0.499-1.181,1.231-2.255,2.198-3.215 C3.923,55.511,4.999,54.776,6.182,54.277L6.182,54.277z M24.407,94.219c-0.603,0-1.154,0.105-1.653,0.314 c-0.505,0.212-0.983,0.542-1.431,0.99c-0.037,0.037-0.075,0.072-0.113,0.106c-0.398,0.421-0.694,0.86-0.888,1.319 c-0.202,0.481-0.304,1.033-0.304,1.657c0,0.644,0.104,1.215,0.313,1.716c0.209,0.5,0.529,0.961,0.961,1.382l0.02,0.02 c0.446,0.438,0.919,0.761,1.417,0.966c0.494,0.204,1.054,0.306,1.677,0.306c0.653,0,1.241-0.104,1.762-0.315 c0.522-0.212,1.004-0.533,1.442-0.966l0.01-0.01l0,0c0.432-0.421,0.752-0.882,0.961-1.382c0.208-0.5,0.313-1.072,0.313-1.716 c0-0.608-0.104-1.16-0.313-1.657c-0.021-0.049-0.04-0.099-0.058-0.149c-0.208-0.438-0.52-0.862-0.934-1.276 c-0.452-0.453-0.932-0.783-1.436-0.99C25.646,94.324,25.063,94.219,24.407,94.219L24.407,94.219z M20.768,89.798 c1.136-0.477,2.351-0.716,3.639-0.716c1.302,0,2.534,0.239,3.694,0.716c1.162,0.479,2.204,1.177,3.121,2.094 c0.848,0.848,1.509,1.793,1.982,2.839c0.041,0.075,0.078,0.152,0.112,0.233c0.476,1.133,0.714,2.346,0.714,3.643 c0,1.313-0.238,2.54-0.714,3.683c-0.477,1.143-1.186,2.171-2.125,3.087l0,0c-0.928,0.913-1.961,1.6-3.097,2.059 c-1.15,0.466-2.381,0.697-3.688,0.697c-1.271,0-2.479-0.235-3.623-0.707c-1.121-0.463-2.14-1.143-3.054-2.041l-0.008-0.008 c-0.939-0.916-1.647-1.944-2.124-3.087c-0.477-1.143-0.715-2.369-0.715-3.683c0-1.281,0.242-2.494,0.725-3.643 c0.449-1.066,1.094-2.036,1.938-2.913c0.046-0.055,0.095-0.107,0.146-0.159C18.614,90.97,19.641,90.271,20.768,89.798 L20.768,89.798z M59.706,107.981c-0.682,0-1.292,0.113-1.83,0.341c-0.559,0.235-1.088,0.604-1.587,1.104l-0.01,0.01l0,0 c-0.487,0.487-0.852,1.019-1.093,1.594c-0.022,0.053-0.046,0.105-0.072,0.155c-0.187,0.504-0.28,1.066-0.28,1.687 c0,0.682,0.114,1.291,0.341,1.83c0.23,0.547,0.602,1.076,1.114,1.587c0.511,0.512,1.041,0.883,1.587,1.113 c0.539,0.228,1.148,0.341,1.83,0.341c1.378,0,2.537-0.475,3.465-1.424c0.492-0.504,0.855-1.036,1.086-1.597 c0.226-0.547,0.339-1.164,0.339-1.851c0-0.69-0.113-1.312-0.339-1.862c-0.232-0.565-0.595-1.101-1.086-1.604 c-0.469-0.479-0.986-0.838-1.551-1.072C61.057,108.099,60.419,107.981,59.706,107.981L59.706,107.981z M55.89,103.607 c1.205-0.509,2.476-0.763,3.816-0.763c1.38,0,2.675,0.251,3.881,0.753c1.202,0.501,2.288,1.246,3.256,2.236 c0.946,0.968,1.662,2.045,2.148,3.229c0.494,1.203,0.741,2.473,0.741,3.809s-0.247,2.601-0.74,3.796 c-0.487,1.183-1.204,2.256-2.149,3.224c-1.947,1.992-4.334,2.988-7.137,2.988c-1.341,0-2.612-0.254-3.816-0.762 c-1.196-0.505-2.273-1.237-3.232-2.197c-0.96-0.96-1.693-2.036-2.198-3.232c-0.508-1.204-0.763-2.476-0.763-3.816 c0-1.254,0.223-2.452,0.668-3.593c0.024-0.079,0.053-0.157,0.085-0.235c0.492-1.17,1.227-2.246,2.204-3.227l0.003-0.003 l0.005-0.005l0.005-0.005C53.636,104.838,54.709,104.105,55.89,103.607L55.89,103.607z M94.304,93.37 c-1.374,0-2.52,0.475-3.447,1.424l-0.028,0.028c-0.477,0.486-0.829,1.008-1.057,1.56c-0.227,0.55-0.34,1.171-0.34,1.859 c0,0.73,0.113,1.372,0.339,1.924c0.221,0.54,0.576,1.055,1.066,1.545c0.489,0.49,1.004,0.846,1.544,1.066 c0.552,0.226,1.192,0.339,1.923,0.339c0.689,0,1.311-0.114,1.861-0.34c0.566-0.232,1.102-0.595,1.604-1.085 c0.481-0.472,0.84-0.986,1.074-1.546c0.233-0.56,0.351-1.193,0.351-1.903c0-1.318-0.481-2.465-1.444-3.417l-0.005-0.005 l-0.005,0.005c-0.498-0.498-1.03-0.866-1.594-1.103C95.587,93.487,94.973,93.37,94.304,93.37L94.304,93.37z M87.185,91.223 c1.948-1.993,4.313-2.989,7.119-2.989c1.356,0,2.633,0.251,3.828,0.753c1.186,0.498,2.267,1.233,3.238,2.206l-0.004,0.005 c1.976,1.957,2.964,4.32,2.964,7.044c0,1.381-0.251,2.67-0.753,3.87c-0.501,1.2-1.247,2.283-2.236,3.25 c-0.968,0.946-2.046,1.663-3.229,2.149c-1.202,0.493-2.473,0.741-3.808,0.741c-1.359,0-2.642-0.248-3.85-0.74 c-1.219-0.499-2.302-1.223-3.249-2.17c-0.948-0.948-1.672-2.031-2.17-3.251c-0.493-1.208-0.74-2.49-0.74-3.85 c0-1.336,0.247-2.606,0.741-3.806c0.485-1.178,1.199-2.247,2.14-3.203L87.185,91.223L87.185,91.223z M109.297,56.601 c-1.149,0-2.194,0.193-3.132,0.582c-0.928,0.384-1.799,0.981-2.61,1.793c-0.813,0.812-1.41,1.683-1.794,2.61 c-0.388,0.938-0.581,1.983-0.581,3.132c0,1.134,0.193,2.172,0.582,3.108s0.985,1.81,1.793,2.617 c0.812,0.812,1.683,1.409,2.61,1.793c0.938,0.388,1.982,0.581,3.132,0.581c1.134,0,2.171-0.193,3.108-0.582 c0.936-0.388,1.81-0.985,2.616-1.792c0.808-0.808,1.404-1.681,1.792-2.617c0.389-0.937,0.583-1.975,0.583-3.108 c0-1.148-0.193-2.193-0.582-3.132c-0.384-0.927-0.981-1.798-1.793-2.61c-0.807-0.807-1.681-1.404-2.616-1.792 C111.468,56.795,110.431,56.601,109.297,56.601L109.297,56.601z M104.219,52.447c1.586-0.656,3.279-0.983,5.078-0.983 c1.798,0,3.491,0.327,5.075,0.984c1.574,0.653,3.003,1.618,4.281,2.896c1.274,1.275,2.239,2.708,2.896,4.296 c0.656,1.586,0.983,3.28,0.983,5.078s-0.327,3.492-0.984,5.075c-0.652,1.574-1.617,3.003-2.896,4.281s-2.707,2.243-4.281,2.896 c-1.584,0.656-3.277,0.983-5.075,0.983c-1.799,0-3.492-0.327-5.078-0.983c-1.588-0.656-3.021-1.621-4.296-2.896 c-1.278-1.278-2.243-2.707-2.896-4.281c-0.657-1.583-0.984-3.277-0.984-5.075s0.327-3.491,0.983-5.078 c0.657-1.588,1.622-3.021,2.896-4.296C101.197,54.069,102.631,53.104,104.219,52.447L104.219,52.447z M94.91,14.762 c4.284,0,7.968,1.521,11.012,4.564c1.512,1.512,2.652,3.206,3.426,5.086c0.771,1.877,1.155,3.89,1.155,6.044 c0,2.133-0.385,4.131-1.158,5.991c-0.766,1.843-1.908,3.522-3.429,5.033l0.006,0.005c-1.505,1.505-3.187,2.642-5.039,3.41 c-1.857,0.77-3.851,1.155-5.973,1.155c-4.304,0-7.986-1.521-11.029-4.564c-1.507-1.507-2.649-3.192-3.423-5.051 c-0.771-1.856-1.159-3.849-1.159-5.978c0-2.156,0.389-4.169,1.162-6.044c0.771-1.868,1.912-3.558,3.42-5.076l0.005-0.005 l-0.005-0.005c1.501-1.501,3.186-2.638,5.052-3.41C90.793,15.146,92.786,14.762,94.91,14.762L94.91,14.762z M102.29,22.958 c-2.04-2.04-4.509-3.06-7.38-3.06c-1.474,0-2.818,0.251-4.031,0.753c-1.204,0.498-2.327,1.267-3.366,2.307l-0.006-0.005 c-1.031,1.039-1.803,2.174-2.311,3.405c-0.506,1.227-0.761,2.592-0.761,4.098c0,1.461,0.254,2.799,0.758,4.012 c0.506,1.218,1.28,2.348,2.319,3.386c2.039,2.04,4.509,3.06,7.397,3.06c1.458,0,2.795-0.251,4.007-0.753 c1.213-0.503,2.338-1.272,3.373-2.306l0.005,0.005l0.005-0.005c1.032-1.025,1.802-2.15,2.311-3.373 c0.504-1.215,0.757-2.558,0.757-4.024c0-1.508-0.251-2.873-0.755-4.098C104.11,25.138,103.337,24.005,102.29,22.958L102.29,22.958z" fill="white" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Widget;
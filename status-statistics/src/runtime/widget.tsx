/** @jsx jsx */
import { React, jsx, type AllWidgetProps } from "jimu-core";
import {
  IMConfig,
  StatusStatisticsData,
  defaultConfig
} from "../config";
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

// Map between Uzbek status values and internal status names
const statusMap: Record<string, "checked" | "approved" | "rejected" | "inProgress"> = {
  "tasdiqlangan": "approved",
  "tasdiqlanmagan": "rejected",
  "tekshirilgan": "checked",
  "jarayonda": "inProgress"
};

const reverseStatusMap: Record<"checked" | "approved" | "rejected" | "inProgress", string> = {
  "approved": "tasdiqlangan",
  "rejected": "tasdiqlanmagan",
  "checked": "tekshirilgan",
  "inProgress": "jarayonda"
};

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const safeConfig: IMConfig = {
    ...defaultConfig,
    ...(props.config || {})
  };

  const [data, setData] = React.useState<StatusStatisticsData>({
    checkedCount: safeConfig.checkedCount ?? 2000,
    approvedCount: safeConfig.approvedCount ?? 1000,
    rejectedCount: safeConfig.rejectedCount ?? 600,
    inProgressCount: safeConfig.inProgressCount ?? 400
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
  const [selectedStatus, setSelectedStatus] = React.useState<
    "checked" | "approved" | "rejected" | "inProgress" | null
  >(null);

  const translations: Record<"uz" | "ru" | "cyr", {
    title: string;
    checkedLabel: string;
    approvedLabel: string;
    rejectedLabel: string;
    inProgressLabel: string;
    unit: string;
    numberLocale: string;
  }> = {
    uz: {
      title: "Statuslar bo‘yicha statistika",
      checkedLabel: "Tekshirilganlar",
      approvedLabel: "Tasdiqlangan",
      rejectedLabel: "Tasdiqlanmagan",
      inProgressLabel: "Jarayonda",
      unit: "ta",
      numberLocale: "uz-UZ"
    },
    cyr: {
      title: "Статуслар бўйича статистика",
      checkedLabel: "Текширилганлар",
      approvedLabel: "Тасдиқланган",
      rejectedLabel: "Тасдиқланмаган",
      inProgressLabel: "Жараёнда",
      unit: "та",
      numberLocale: "uz-Cyrl-UZ"
    },
    ru: {
      title: "Статистика по статусам",
      checkedLabel: "Проверенные",
      approvedLabel: "Подтвержденные",
      rejectedLabel: "Неподтвержденные",
      inProgressLabel: "В процессе",
      unit: "шт",
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

  // Listen for status changes in localStorage continuously
  React.useEffect(() => {
    const checkStatus = () => {
      try {
        const storedStatus = localStorage.getItem("status");
        if (storedStatus && statusMap[storedStatus]) {
          setSelectedStatus(prevStatus => {
            const newStatus = statusMap[storedStatus];
            if (newStatus !== prevStatus) {
              return newStatus;
            }
            return prevStatus;
          });
        } else if (!storedStatus) {
          // If status is removed from localStorage, deselect
          setSelectedStatus(prevStatus => {
            if (prevStatus !== null) {
              return null;
            }
            return prevStatus;
          });
        }
      } catch (err) {
        // Ignore status lookup errors
      }
    };

    // Check on mount
    checkStatus();

    // Listen for storage events (cross-tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "status" || e.key === null) {
        checkStatus();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Poll for changes in same tab (since storage events only work across tabs)
    const interval = setInterval(checkStatus, 100);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
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

  React.useEffect(() => {
    setIsVisible(true);
  }, []);

  // Cleanup: remove status from localStorage when widget is deactivated/unmounted
  React.useEffect(() => {
    return () => {
      try {
        localStorage.removeItem("status");
      } catch {
        // ignore storage errors
      }
    };
  }, []);

  // Fetch data from API
  React.useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Get filters from localStorage
        const selectedYear = localStorage.getItem('selectedYear');
        const selectedSoato = localStorage.getItem('selectedSoato');
        const selectedDistrict = localStorage.getItem('selectedDistrict');
        const apiBaseUrl = 'https://api-test.spacemc.uz';

        // Build URL with query parameters
        const url = new URL(`${apiBaseUrl}/api/ecology/stats/status`);

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

        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
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

          // Use API values directly, ensuring they are numbers
          const newData = {
            checkedCount: typeof apiData.tekshirilgan === 'number' ? apiData.tekshirilgan : Number(apiData.tekshirilgan) || 0,
            approvedCount: typeof apiData.tasdiqlangan === 'number' ? apiData.tasdiqlangan : Number(apiData.tasdiqlangan) || 0,
            rejectedCount: typeof apiData.tasdiqlanmagan === 'number' ? apiData.tasdiqlanmagan : Number(apiData.tasdiqlanmagan) || 0,
            inProgressCount: typeof apiData.jarayonda === 'number' ? apiData.jarayonda : Number(apiData.jarayonda) || 0
          };
          setData(newData);
        } else {
          const errorText = await response.text();
          void errorText;
          // Fallback to config values on API error
          setData({
            checkedCount: safeConfig.checkedCount ?? 2000,
            approvedCount: safeConfig.approvedCount ?? 1000,
            rejectedCount: safeConfig.rejectedCount ?? 600,
            inProgressCount: safeConfig.inProgressCount ?? 400
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
          checkedCount: safeConfig.checkedCount ?? 2000,
          approvedCount: safeConfig.approvedCount ?? 1000,
          rejectedCount: safeConfig.rejectedCount ?? 600,
          inProgressCount: safeConfig.inProgressCount ?? 400
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
    let previousStatusPoll = localStorage.getItem('status');

    loadData();

    // Listen for localStorage changes to refetch data (only works across tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selectedYear' || e.key === 'selectedSoato' || e.key === 'selectedDistrict' || e.key === 'selectedTypeId' || e.key === 'status' || e.key === null) {
        const currentYear = localStorage.getItem('selectedYear');
        const currentSoato = localStorage.getItem('selectedSoato');
        const currentDistrict = localStorage.getItem('selectedDistrict');
        const currentTypeId = localStorage.getItem('selectedTypeId');
        const currentStatus = localStorage.getItem('status');

        if (
          currentYear !== previousYear ||
          currentSoato !== previousSoato ||
          currentDistrict !== previousDistrict ||
          currentTypeId !== previousTypeId ||
          currentStatus !== previousStatusPoll
        ) {
          previousYear = currentYear;
          previousSoato = currentSoato;
          previousDistrict = currentDistrict;
          previousTypeId = currentTypeId;
          previousStatusPoll = currentStatus;
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

    // Listen for data refresh events (e.g., after polygon save)
    const handleDataRefresh = () => {
      loadData();
    };

    // Poll for changes in the same window (since storage events only work across tabs)
    const checkForChanges = () => {
      const currentYear = localStorage.getItem('selectedYear');
      const currentSoato = localStorage.getItem('selectedSoato');
      const currentDistrict = localStorage.getItem('selectedDistrict');
      const currentTypeId = localStorage.getItem('selectedTypeId');
      const currentStatus = localStorage.getItem('status');

      if (
        currentYear !== previousYear ||
        currentSoato !== previousSoato ||
        currentDistrict !== previousDistrict ||
        currentTypeId !== previousTypeId ||
        currentStatus !== previousStatusPoll
      ) {
        previousYear = currentYear;
        previousSoato = currentSoato;
        previousDistrict = currentDistrict;
        previousTypeId = currentTypeId;
        previousStatusPoll = currentStatus;
        loadData();
      }
    };

    const intervalId = setInterval(checkForChanges, 100);

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('custom-map-region-change', handleRegionChange);
    window.addEventListener('custom-map-district-change', handleDistrictChange);
    window.addEventListener('status-statistics-refresh', handleDataRefresh);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('custom-map-region-change', handleRegionChange);
      window.removeEventListener('custom-map-district-change', handleDistrictChange);
      window.removeEventListener('status-statistics-refresh', handleDataRefresh);
      clearInterval(intervalId);
    };
  }, []);

  const currentLocale = translations[locale] || translations.uz;

  const formatNumber = (num: number): string => {
    return num
      .toLocaleString(currentLocale.numberLocale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })
      .replace(/,/g, " ");
  };

  // Compute bar height (in %) based strictly on value/maxValue,
  // so visual height is directly proportional to the number.
  const getBarHeight = (value: number): string => {
    const values = [
      data.checkedCount,
      data.approvedCount,
      data.rejectedCount,
      data.inProgressCount
    ];
    const max = Math.max(...values);
    if (!max || value <= 0) {
      return "4%"; // keep 0-values barely visible
    }

    const ratio = value / max; // 0–1
    const height = ratio * 100;
    return `${height}%`;
  };

  const handleSelect = (status: "checked" | "approved" | "rejected" | "inProgress") => {
    // If clicking the same status, deselect it
    if (selectedStatus === status) {
      setSelectedStatus(null);
      try {
        localStorage.removeItem("status");
      } catch {
        // ignore storage errors
      }
    } else {
      // Otherwise, select the new status
      setSelectedStatus(status);
      try {
        const uzbekStatus = reverseStatusMap[status];
        localStorage.setItem("status", uzbekStatus);
      } catch {
        // ignore storage errors
      }
    }
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
      className={`status-statistics-widget ${isVisible ? "visible" : ""}`}
      style={{
        '--border-glow-start': `rgba(${r}, ${g}, ${b}, 0.1)`,
        '--border-glow-end': `rgba(${r}, ${g}, ${b}, 0.35)`,
      } as React.CSSProperties}
    >
      <div className="status-statistics-header">
        <span className="status-statistics-title">{currentLocale.title}</span>
      </div>

      <div className="status-statistics-columns">
        {/* Tekshirilgan */}
        <div
          className={
            "status-statistics-column status-checked" +
            (selectedStatus === "checked" ? " status-selected" : "")
          }
          onClick={() => handleSelect("checked")}
        >
          <div className="status-statistics-top">
            <div className="status-statistics-value">
              {loading ? "..." : formatNumber(data.checkedCount)}
            </div>
            {/* <div className="status-statistics-unit">{currentLocale.unit}</div> */}
            <div className="status-statistics-label">
              {currentLocale.checkedLabel}
            </div>
          </div>
          <div
            className="status-statistics-bar status-checked-bar"
            style={{ height: getBarHeight(data.checkedCount) }}
          />
        </div>

        {/* Tadiqlangan */}
        <div
          className={
            "status-statistics-column status-approved" +
            (selectedStatus === "approved" ? " status-selected" : "")
          }
          onClick={() => handleSelect("approved")}
        >
          <div className="status-statistics-top">
            <div className="status-statistics-value">
              {loading ? "..." : formatNumber(data.approvedCount)}
            </div>
            {/* <div className="status-statistics-unit">{currentLocale.unit}</div> */}
            <div className="status-statistics-label">
              {currentLocale.approvedLabel}
            </div>
          </div>
          <div
            className="status-statistics-bar status-approved-bar"
            style={{ height: getBarHeight(data.approvedCount) }}
          />
        </div>

        {/* Tasdiqlanmagan */}
        <div
          className={
            "status-statistics-column status-rejected" +
            (selectedStatus === "rejected" ? " status-selected" : "")
          }
          onClick={() => handleSelect("rejected")}
        >
          <div className="status-statistics-top">
            <div className="status-statistics-value">
              {loading ? "..." : formatNumber(data.rejectedCount)}
            </div>
            {/* <div className="status-statistics-unit">{currentLocale.unit}</div> */}
            <div className="status-statistics-label">
              {currentLocale.rejectedLabel}
            </div>
          </div>
          <div
            className="status-statistics-bar status-rejected-bar"
            style={{ height: getBarHeight(data.rejectedCount) }}
          />
        </div>

        {/* Jarayonda */}
        <div
          className={
            "status-statistics-column status-in-progress" +
            (selectedStatus === "inProgress" ? " status-selected" : "")
          }
          onClick={() => handleSelect("inProgress")}
        >
          <div className="status-statistics-top">
            <div className="status-statistics-value">
              {loading ? "..." : formatNumber(data.inProgressCount)}
            </div>
            {/* <div className="status-statistics-unit">{currentLocale.unit}</div> */}
            <div className="status-statistics-label">
              {currentLocale.inProgressLabel}
            </div>
          </div>
          <div
            className="status-statistics-bar status-in-progress-bar"
            style={{ height: getBarHeight(data.inProgressCount) }}
          />
        </div>
      </div>
    </div>
  );
};

export default Widget;



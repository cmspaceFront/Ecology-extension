/** @jsx jsx */
import {
  React,
  jsx,
  type AllWidgetProps,
  LinkType,
  jimuHistory
} from "jimu-core";
import { IMConfig, getApiBaseUrl } from "../config";
import MonitoringResultsTable from "./components/MonitoringResultsTable";
import { MonitoringResultItem } from "./types/monitoringTypes";
import { translations } from "./translations";
import { getThemeColors } from "./themeUtils";
import "./styles/widget.css";

const SELECTED_ID_STORAGE_KEY = "selectedId";
const SEARCH_VALUE_STORAGE_KEY = "searchValue";

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

/** Same keys as space-eco-header after ArcGIS login. */
function getSpaceApiAccessTokenFromStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const t = localStorage.getItem("authToken") || localStorage.getItem("token");
    return t && t.trim().length > 0 ? t.trim() : null;
  } catch {
    return null;
  }
}
/** After this many ms from mount, continuous CSS animations (glow, pulses, row fades) are turned off. Reload starts them again. */
const INTRO_ANIMATIONS_DURATION_MS = 10_000;
const API_PAGE_LIMIT = 200;

function isFullPageReload(): boolean {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (entry) {
      return entry.type === "reload";
    }
    const legacy = (performance as unknown as { navigation?: { type?: number } }).navigation;
    return legacy?.type === 1;
  } catch {
    return false;
  }
}

const isSearchValuePresentInStorage = (): boolean => {
  try {
    const v = localStorage.getItem(SEARCH_VALUE_STORAGE_KEY);
    return !!(v && v.trim() !== "");
  } catch {
    return false;
  }
};

/** Parse API / stored date to unix ms: ISO, DD.MM.YYYY, or epoch (sec/ms). */
function parseApiDateToMs(raw: string | number | null | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1e12) return Math.floor(raw);
    if (raw > 1e9 && raw < 1e12) return Math.floor(raw * 1000);
    return undefined;
  }
  const s = String(raw).trim();
  const dm = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dm) {
    const t = new Date(+dm[3], +dm[2] - 1, +dm[1]).getTime();
    return Number.isNaN(t) ? undefined : t;
  }
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? undefined : t;
}

/** Format to date-only (DD.MM.YYYY) for display */
function formatDateOnly(isoString: string | null | undefined): string | undefined {
  const ms = parseApiDateToMs(isoString);
  if (ms === undefined) return undefined;
  const d = new Date(ms);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

/** ID в таблице: без `{}`, CAPS только для отображения. */
function formatMonitoringDisplayId(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s.replace(/^\{/, "").replace(/\}$/, "").replace(/[{}]/g, "").toUpperCase();
}

/** selectedId / searchValue: как в API — без скобок, без смены регистра. */
function stripMonitoringIdForStorage(raw: string | null | undefined): string {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (!s) return "";
  return s.replace(/[{}]/g, "");
}

function monitoringRowIdsEqual(a: string | undefined | null, b: string | undefined | null): boolean {
  const ca = stripMonitoringIdForStorage(a).toLowerCase();
  const cb = stripMonitoringIdForStorage(b).toLowerCase();
  return ca !== "" && ca === cb;
}

// Normalize locale from storage format (uz-Latn, uz-Cyrl, ru, en, qqr) to internal format
const normalizeLocale = (locale: string | null): "uz" | "uzcryl" | "ru" | "en" | "qqr" => {
  if (!locale) return "ru";
  if (locale === "uz-Latn") return "uz";
  if (locale === "uz-Cyrl") return "uzcryl";
  if (locale === "uz" || locale === "uzcryl" || locale === "ru" || locale === "en" || locale === "qqr") return locale;
  return "ru";
};

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const [locale, setLocale] = React.useState<"uz" | "uzcryl" | "ru" | "en" | "qqr">(() => {
    try {
      const stored = localStorage.getItem("customLocal");
      return normalizeLocale(stored);
    } catch {
      return "ru";
    }
  });
  const t = translations[locale] || translations.ru;
  const getSelectedIdFromStorage = () => {
    try {
      return localStorage.getItem(SELECTED_ID_STORAGE_KEY) || undefined;
    } catch {
      return undefined;
    }
  };

  const [selectedRowId, setSelectedRowId] = React.useState<string | undefined>(() => {
    try {
      if (isFullPageReload()) {
        localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
      }
      if (!isSearchValuePresentInStorage()) {
        return undefined;
      }
      return getSelectedIdFromStorage();
    } catch {
      return undefined;
    }
  });
  const lastUserSelectionRef = React.useRef<number>(0);
  const [data, setData] = React.useState<MonitoringResultItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [loadingMore, setLoadingMore] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState<boolean>(true);
  const nextOffsetRef = React.useRef<number>(0);
  const loadDataRef = React.useRef<((mode: "reset" | "append") => Promise<void>) | null>(null);
  const [themeColors, setThemeColors] = React.useState(getThemeColors());
  const [introAnimationsActive, setIntroAnimationsActive] = React.useState(true);

  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setIntroAnimationsActive(false);
    }, INTRO_ANIMATIONS_DURATION_MS);
    return () => window.clearTimeout(id);
  }, []);

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

  // Get token from localStorage or config
  const getToken = () => {
    try {
      return getSpaceApiAccessTokenFromStorage() || props.config.apiToken;
    } catch (e) {
      return props.config.apiToken;
    }
  };

  const [token, setToken] = React.useState<string | null>(getToken());

  // Sync JWT when space-eco-header saves authToken (same-tab: poll; cross-tab: storage)
  React.useEffect(() => {
    const resolveToken = (): string | null => {
      const fromStorage = getSpaceApiAccessTokenFromStorage();
      const merged = fromStorage || props.config.apiToken;
      if (merged == null || merged === "") return null;
      return String(merged);
    };

    const syncToken = () => {
      const next = resolveToken();
      setToken((prev) => (prev !== next ? next : prev));
    };

    syncToken();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "authToken" || e.key === "token" || e.key === null) {
        syncToken();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    const intervalId = setInterval(syncToken, 500);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(intervalId);
    };
  }, [props.config.apiToken]);

  // Fetch data from API
  React.useEffect(() => {
    const loadData = async (mode: "reset" | "append") => {
      if (mode === "reset") {
        setLoading(true);
        setError(null);
        setHasMore(true);
        nextOffsetRef.current = 0;
      } else {
        setLoadingMore(true);
        setError(null);
      }

      try {
        // Get filters from localStorage
        const selectedYear = localStorage.getItem('selectedYear');
        const selectedSoato = localStorage.getItem('selectedSoato');
        const selectedDistrict = localStorage.getItem('selectedDistrict');
        const status = localStorage.getItem('status');

        const selectedIdTurs = selectedTypeIdStorageToIdTurValues(localStorage.getItem('selectedTypeId'));

        const offset = mode === "reset" ? 0 : nextOffsetRef.current;

        // Build API URL.
        // IMPORTANT: Always use the known working backend base URL.
        // We intentionally ignore portal-relative values (like "/AdminAI/api")
        // to avoid requests going to the portal host instead of the API host.
        const apiBaseUrl = getApiBaseUrl(); // e.g. https://api-test.spacemc.uz/api
        const url = new URL('ecology/', `${apiBaseUrl}/`);

        // Add year filter if exists
        if (selectedYear) {
          url.searchParams.append('year', selectedYear);
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

        for (const v of selectedIdTurs) {
          url.searchParams.append('id_tur', v);
        }

        // Backend pagination
        url.searchParams.append('limit', String(API_PAGE_LIMIT));
        url.searchParams.append('offset', offset.toString());

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch(url.toString(), {
          headers
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API request failed: ${response.status} ${response.statusText}: ${errorText}`);
        }

        const apiResponse = await response.json();
        const pageItems: any[] = Array.isArray(apiResponse?.data) ? apiResponse.data : [];
        const receivedPageCount = pageItems.length;

        // Filter data based on status from localStorage
        // jarayonda → tekshirish: null
        // tasdiqlanmagan → tekshirish: 2
        // tasdiqlangan → tekshirish: 1
        // tekshirilgan → tekshirish: 1 or 2
        let filteredData = pageItems;

          if (status) {
          filteredData = filteredData.filter((item: any) => {
            const tek = item.tekshirish;

            switch (status) {
              case 'jarayonda':
                // Only items with tekshirish: null (in progress)
                return tek === null;
              case 'tasdiqlanmagan':
                // Only items with tekshirish: 2 (rejected)
                return tek === 2 || tek === "2";
              case 'tasdiqlangan':
                // Only items with tekshirish: 1 (approved)
                return tek === 1 || tek === "1";
              case 'tekshirilgan':
                // Items with tekshirish: 1 or 2 (checked - both approved and rejected)
                return tek === 1 || tek === "1" || tek === 2 || tek === "2";
              default:
                return true;
            }
          });
        }

        // Мультивыбор типов: если API вернул лишние записи, оставляем только выбранные id_tur
        if (selectedIdTurs.length > 0) {
          const allow = new Set(selectedIdTurs.map((s) => s.trim().toUpperCase()).filter(Boolean));
          if (allow.size > 0) {
            filteredData = filteredData.filter((item: any) => {
              const idTurRaw = item?.id_tur;
              if (typeof idTurRaw === 'string' && idTurRaw.trim()) {
                return allow.has(idTurRaw.trim().toUpperCase());
              }
              const turNum = item?.tur;
              if (typeof turNum === 'number' && turNum >= 0 && turNum <= 4) {
                return allow.has(`ETID-${turNum + 1}`.toUpperCase());
              }
              return false;
            });
          }
        }

        // Debug: Check what statuses are in the filtered response
        const totalFilteredCount = filteredData.length;

        // Transform API response to MonitoringResultItem format
        const transformedData: MonitoringResultItem[] = filteredData.map((item: any) => {
          // Helper function to convert 2 to false, 1 to true, null stays null
          // Handles both string "1" and number 1
          const convertToBooleanOrNull = (value: any): boolean | null => {
            if (value === null || value === undefined) {
              return null;
            }
            if (value === 2 || value === "2") {
              return false;
            }
            // Check for string "1" or number 1
            return value === 1 || value === "1";
          };

          // Helper function to convert null/2 to false, 1 to true (for other fields)
          const convertToBoolean = (value: any): boolean => {
            if (value === null || value === undefined || value === 2 || value === "2") {
              return false;
            }
            // Check for string "1" or number 1
            return value === 1 || value === "1";
          };

          // Helper function to determine ekologiya status based on value
          const getEkologiyaStatus = (value: boolean | null): 'pending' | 'warning' | 'caution' | 'completed' => {
            if (value === null) return 'pending';
            if (!value) return 'pending';
            // If value is true, determine status - default to 'completed' if we don't have more info
            // You can adjust this logic based on your business rules
            return 'completed';
          };

          // Convert fields: null stays null, 2 = false, 1 = true (for ekologiya)
          // For other fields: null/2 = false, 1 = true
          const uzspaceValue = convertToBoolean(item.uzspace);
          const tekshirishValue = convertToBooleanOrNull(item.tekshirish); // Preserve null
          const prokuraturaValue = convertToBoolean(item.prokuratura);

          const rowId = item.unique_id || `{${item.gid}}`;
          const idForStorage =
            stripMonitoringIdForStorage(rowId) || String(rowId).trim();
          const displayId =
            formatMonitoringDisplayId(rowId) || idForStorage;
          return {
            // localStorage / карта — оригинальный регистр unique_id; в таблице — displayId (CAPS)
            id: idForStorage,
            displayId,
            lastEditedDate: formatDateOnly(item.last_edited_date),
            lastEditedAt: parseApiDateToMs(item.last_edited_date),
            uzcosmos: {
              status: uzspaceValue ? 'completed' : 'pending',
              progress: 100 // Always 100% as per mock data pattern
            },
            ekologiya: {
              status: getEkologiyaStatus(tekshirishValue),
              value: tekshirishValue // Can be true, false, or null
            },
            prokuratura: {
              status: prokuraturaValue ? 'completed' : 'pending',
              progress: prokuraturaValue ? 100 : 0
            }
          };
        });

        // Update pagination state: if backend returned less than limit, no more pages.
        const nextOffset = offset + receivedPageCount;
        nextOffsetRef.current = nextOffset;
        setHasMore(receivedPageCount === API_PAGE_LIMIT);

        if (mode === "reset") {
          setData(transformedData);
        } else {
          setData((prev) => [...prev, ...transformedData]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        if (mode === "reset") setLoading(false);
        setLoadingMore(false);
      }
    };

    const getSelectedIdTur = (): string | null => {
      const arr = selectedTypeIdStorageToIdTurValues(localStorage.getItem('selectedTypeId'));
      return arr.length > 0 ? [...arr].sort().join(',') : null;
    };

    // Track previous values to avoid unnecessary API calls
    let previousYear = localStorage.getItem('selectedYear');
    let previousSoato = localStorage.getItem('selectedSoato');
    let previousDistrict = localStorage.getItem('selectedDistrict');
    let previousStatus = localStorage.getItem('status');
    let previousIdTur = getSelectedIdTur();

    loadDataRef.current = loadData;
    loadData("reset");

    // Listen for localStorage changes to refetch data (only works across tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'selectedYear' || e.key === 'selectedSoato' || e.key === 'selectedDistrict' || e.key === 'status' || e.key === 'selectedTypeId') {
        const currentYear = localStorage.getItem('selectedYear');
        const currentSoato = localStorage.getItem('selectedSoato');
        const currentDistrict = localStorage.getItem('selectedDistrict');
        const currentStatus = localStorage.getItem('status');
        const currentIdTur = getSelectedIdTur();

        // Only refetch if values actually changed
        if (currentYear !== previousYear || currentSoato !== previousSoato || currentDistrict !== previousDistrict || currentStatus !== previousStatus || currentIdTur !== previousIdTur) {
          previousYear = currentYear;
          previousSoato = currentSoato;
          previousDistrict = currentDistrict;
          previousStatus = currentStatus;
          previousIdTur = currentIdTur;
          loadData("reset");
        }
      }
    };

    // Listen for custom events from other widgets
    const handleRegionChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      const currentSoato = detail || localStorage.getItem('selectedSoato');
      if (currentSoato !== previousSoato) {
        previousSoato = currentSoato;
        loadData("reset");
      }
    };

    const handleDistrictChange = (event: Event) => {
      const detail = (event as CustomEvent<string | null>).detail;
      const currentDistrict = detail || localStorage.getItem('selectedDistrict');
      if (currentDistrict !== previousDistrict) {
        previousDistrict = currentDistrict;
        loadData("reset");
      }
    };

    // Poll for changes in the same window (since storage events only work across tabs)
    const checkForChanges = () => {
      const currentYear = localStorage.getItem('selectedYear');
      const currentSoato = localStorage.getItem('selectedSoato');
      const currentDistrict = localStorage.getItem('selectedDistrict');
      const currentStatus = localStorage.getItem('status');
      const currentIdTur = getSelectedIdTur();

      if (currentYear !== previousYear || currentSoato !== previousSoato || currentDistrict !== previousDistrict || currentStatus !== previousStatus || currentIdTur !== previousIdTur) {
        previousYear = currentYear;
        previousSoato = currentSoato;
        previousDistrict = currentDistrict;
        previousStatus = currentStatus;
        previousIdTur = currentIdTur;
        loadData("reset");
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
      loadDataRef.current = null;
    };
  }, [token, props.config.apiBaseUrl]);

  const handleLoadMore = React.useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void loadDataRef.current?.("append");
  }, [loading, loadingMore, hasMore]);

  React.useEffect(() => {
    const applySelectionFromStorage = () => {
      // Снять отметку только если в поиске нет айди (второй клик по строке чистит и поиск, и selectedId)
      if (!isSearchValuePresentInStorage()) {
        setSelectedRowId(prev => (prev !== undefined ? undefined : prev));
        return;
      }
      const now = Date.now();
      if (now - lastUserSelectionRef.current < 600) {
        return;
      }
      const storedId = getSelectedIdFromStorage();
      // Пока в поиске есть текст — не сбрасываем строку из‑за временно пустого selectedId
      if (storedId != null && storedId !== "") {
        setSelectedRowId(prev => (prev !== storedId ? storedId : prev));
      }
    };

    applySelectionFromStorage();

    const handleStorageChange = (event: StorageEvent) => {
      if (Date.now() - lastUserSelectionRef.current < 400) return;
      if (event.key === SEARCH_VALUE_STORAGE_KEY) {
        const has =
          event.newValue != null && String(event.newValue).trim() !== "";
        if (!has) {
          setSelectedRowId(undefined);
        } else {
          applySelectionFromStorage();
        }
        return;
      }
      if (event.key !== SELECTED_ID_STORAGE_KEY) return;
      const newId = event.newValue;
      if (!newId) {
        if (!isSearchValuePresentInStorage()) {
          setSelectedRowId(undefined);
        }
        return;
      }
      if (!isSearchValuePresentInStorage()) {
        setSelectedRowId(undefined);
        return;
      }
      setSelectedRowId(newId);
    };

    const handleCustomStorageChange = () => {
      applySelectionFromStorage();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("localStorageChange", handleCustomStorageChange);

    const intervalId = setInterval(applySelectionFromStorage, 500);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("localStorageChange", handleCustomStorageChange);
      clearInterval(intervalId);
    };
  }, []);

  const handleRowClick = (item: MonitoringResultItem) => {
    lastUserSelectionRef.current = Date.now();

    if (monitoringRowIdsEqual(selectedRowId, item.id)) {
      setSelectedRowId(undefined);
      try {
        localStorage.removeItem(SELECTED_ID_STORAGE_KEY);
        localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
        window.dispatchEvent(
          new CustomEvent("localStorageChange", {
            detail: { key: SELECTED_ID_STORAGE_KEY, value: "" }
          })
        );
      } catch {
        // Swallow storage errors (e.g., blocked access)
      }
      return;
    }

    setSelectedRowId(item.id);
    try {
      localStorage.setItem(SELECTED_ID_STORAGE_KEY, item.id);
      // Для отображения в верхнем поиске (header) — displayId (unique_id или fallback)
      localStorage.setItem(SEARCH_VALUE_STORAGE_KEY, item.id);
      window.dispatchEvent(
        new CustomEvent("localStorageChange", {
          detail: { key: SELECTED_ID_STORAGE_KEY, value: item.id }
        })
      );
    } catch {
      // Swallow storage errors (e.g., blocked access)
    }

    const linkParam = props.config.linkParam;

    if (!linkParam || !linkParam.linkType || linkParam.linkType === LinkType.None) {
      return;
    }

    // Handle page navigation
    if (linkParam.linkType === LinkType.Page && linkParam.value) {
      const targetPage = linkParam.value;
      const openType = linkParam.openType || "_self";

      if (openType === "_blank") {
        const currentUrl = window.location.href.split('#')[0];
        const newUrl = `${currentUrl}page/${targetPage}/`;
        window.open(newUrl, '_blank');
      } else if (openType === "_top") {
        const currentUrl = window.top.location.href.split('#')[0];
        window.top.location.href = `${currentUrl}page/${targetPage}/`;
      } else {
        jimuHistory.changePage(targetPage);
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
      className={`monitoring-results-widget${introAnimationsActive ? "" : " monitoring-results-animations-settled"}`}
      style={{
        '--border-glow-start': `rgba(${r}, ${g}, ${b}, 0.1)`,
        '--border-glow-end': `rgba(${r}, ${g}, ${b}, 0.35)`,
        '--theme-primary': themeColors.primary,
        '--theme-light': themeColors.light,
      } as React.CSSProperties}
    >
      {/* <div className="monitoring-results-header">
        <h1 className="monitoring-results-title">MONITORING NATIJASI</h1>
      </div> */}
      <div className="monitoring-results-content">
        <div className="monitoring-results-table-section">
          <MonitoringResultsTable
            data={data}
            loading={loading}
            error={error}
            selectedRowId={selectedRowId}
            onRowClick={handleRowClick}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={handleLoadMore}
          />
        </div>
      </div>
    </div>
  );
};

export default Widget;

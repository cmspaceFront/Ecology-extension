/** @jsx jsx */
import { React, jsx, type AllWidgetProps } from "jimu-core";
import { useState, useEffect, useCallback, useMemo } from "react";
import { IMConfig } from "../config";
import { translations } from "./translations";
import CategoryChart from "./components/CategoryChart";
import { getThemeColors } from "./themeUtils";
import "./style.scss";

interface CategoryData {
  name: string;
  value: number;
  color?: string;
  tur?: number; // ✅ stable category id
}

interface TurStat {
  tur: number;
  quantity: number;
}

interface ApiDataItem {
  gid: number;
  tur: number;
  yer_toifa: string;
  natija: string;
  sana: string;
  latitude: string;
  longitude: string;
  maydon: number;
  tuman: string;
  viloyat: string;
  globalid: string;
  region: number;
  district: string;
  mahalla_id: number;
  [key: string]: any;
}

interface ApiResponse {
  total: number;
  limit: number;
  offset: number;
  data: ApiDataItem[];
}

// Base names for API requests (uz-cyrl)
const TUR_API_NAMES: { [key: number]: string } = {
  0: "Аҳоли яшаш жойларида эҳтимоли юқори бўлган ноқонуний чиқинди полигонлари сони",
  1: "Дарё муҳофаза ҳудудидаги ноқонуний полигонлар сони",
  2: "Саноат зоналарида эҳтимоли юқори бўлган ноқонуний чиқинди полигонлари сони",
  3: "Қонуний чиқинди полигонлари чегарасидан ташқарига чиқиш ҳолати сони",
  4: "Қонуний чиқинди полигонларининг умумий сони",
};

const TUR_TRANSLATIONS: { [key: number]: { [locale: string]: string } } = {
  0: {
    uz: "Aholi yashash joylarida ehtimoli yuqori bo'lgan noqonuniy chiqindi poligonlari soni",
    uzcryl: "Аҳоли яшаш жойларида эҳтимоли юқори бўлган ноқонуний чиқинди полигонлари сони",
    ru: "Количество незаконных полигонов отходов с высокой вероятностью в местах проживания населения",
    en: "Number of illegal waste landfills with high probability in residential areas",
    qqr: "Тұрғындар тұратын жерлерде ықтималдығы жоғары заңсыз қалдық полигондарының саны",
  },
  1: {
    uz: "Daryo muhofaza hududidagi noqonuniy poligonlar soni",
    uzcryl: "Дарё муҳофаза ҳудудидаги ноқонуний полигонлар сони",
    ru: "Количество незаконных полигонов в водоохранной зоне",
    en: "Number of illegal landfills in water protection zone",
    qqr: "Су қорғау аймағындағы заңсыз полигондардың саны",
  },
  2: {
    uz: "Sanoat zonlarida ehtimoli yuqori bo'lgan noqonuniy chiqindi poligonlari soni",
    uzcryl: "Саноат зоналарида эҳтимоли юқори бўлган ноқонуний чиқинди полигонлари сони",
    ru: "Количество незаконных полигонов отходов с высокой вероятностью в промышленных зонах",
    en: "Number of illegal waste landfills with high probability in industrial zones",
    qqr: "Өнеркәсіптік аймақтарда ықтималдығы жоғары заңсыз қалдық полигондарының саны",
  },
  3: {
    uz: "Qonuniy chiqindi poligonlari chegarasidan tashqariga chiqish holati soni",
    uzcryl: "Қонуний чиқинди полигонлари чегарасидан ташқарига чиқиш ҳолати сони",
    ru: "Количество случаев выхода за границы законных полигонов отходов",
    en: "Number of cases of exceeding boundaries of legal waste landfills",
    qqr: "Заңды қалдық полигондарының шекарасынан тыс шығу жағдайларының саны",
  },
  4: {
    uz: "Qonuniy chiqindi poligonlarining umumiy soni",
    uzcryl: "Қонуний чиқинди полигонларининг умумий сони",
    ru: "Общее количество законных полигонов отходов",
    en: "Total number of legal waste landfills",
    qqr: "Заңды қалдық полигондарының жалпы саны",
  },
};

const getTurName = (turId: number, locale: string): string => {
  const t = TUR_TRANSLATIONS[turId];
  if (!t) return `Тип ${turId}`;
  const normalizedLocale = locale === "uzcryl" ? "uzcryl" : locale;
  return t[normalizedLocale] || t.ru || t.uzcryl || TUR_API_NAMES[turId] || `Тип ${turId}`;
};

const normalizeLocaleFromStorage = (locale: string | null): string => {
  if (!locale) return "ru";
  if (locale === "uz-Cyrl") return "uzcryl";
  if (locale === "uz-Latn") return "uz";
  return locale;
};

const fetchEcologyData = async (
  locale: string,
  selectedYear?: string | null,
  selectedSoato?: string | null
): Promise<CategoryData[]> => {
  try {
    let url = `https://api-test.spacemc.uz/api/ecology/?limit=10000&offset=0`;

    if (selectedYear) url += `&year=${selectedYear}`;

    if (selectedSoato) {
      const soatoLength = selectedSoato.length;
      if (soatoLength === 4) {
        url += `&region=${selectedSoato}`;
      } else if (soatoLength === 7) {
        const regionCode = selectedSoato.substring(0, 4);
        url += `&region=${regionCode}&district=${selectedSoato}`;
      }
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const apiData: ApiResponse = await response.json();
    const allData: ApiDataItem[] = apiData.data || [];

    const turStatsMap: Map<number, number> = new Map();
    allData.forEach((item) => {
      const tur = item.tur;
      if (tur !== undefined && tur !== null) {
        turStatsMap.set(tur, (turStatsMap.get(tur) || 0) + 1);
      }
    });

    const allTurStats: TurStat[] = Array.from(turStatsMap.entries()).map(([tur, quantity]) => ({
      tur,
      quantity,
    }));

    const sortedStats = allTurStats.sort((a, b) => b.quantity - a.quantity);

    return sortedStats.map(({ tur, quantity }) => ({
      name: getTurName(tur, locale),
      value: quantity,
      tur,
    }));
  } catch (error) {
    console.error("Error fetching ecology data:", error);
    return [];
  }
};

const BREAKPOINT = 1400;

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const savedLocaleRaw =
    (typeof window !== "undefined" && localStorage.getItem("customLocal")) || "ru";
  const savedLocale = normalizeLocaleFromStorage(savedLocaleRaw);

  const [locale, setLocale] = useState<string>(savedLocale);
  const [data, setData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc" | null>("desc");
  const [themeColors, setThemeColors] = useState(getThemeColors());
  const [selectedYear, setSelectedYear] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("selectedYear") : null
  );
  const [selectedSoato, setSelectedSoato] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem("selectedSoato") : null
  );

  const t = translations[locale] || translations.ru;

  // ✅ compact + expand state
  const [isCompact, setIsCompact] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${BREAKPOINT}px)`).matches;
  });
  const [expandedTur, setExpandedTur] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${BREAKPOINT}px)`);

    const apply = () => {
      const compact = mq.matches;
      setIsCompact(compact);
      if (!compact) setExpandedTur(null);
    };

    apply();

    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, []);

  // optional: close expand on outside click (<=1400)
  useEffect(() => {
    if (!isCompact) return;

    const onDocDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".category-chart__legend-item")) return;
      setExpandedTur(null);
    };

    document.addEventListener("mousedown", onDocDown, true);
    document.addEventListener("touchstart", onDocDown, true);

    return () => {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("touchstart", onDocDown, true);
    };
  }, [isCompact]);

  // locale changes
  useEffect(() => {
    const checkLocale = () => {
      try {
        const stored = localStorage.getItem("customLocal");
        if (stored) {
          const newLocale = normalizeLocaleFromStorage(stored);
          setLocale((prev) => (newLocale !== prev ? newLocale : prev));
        }
      } catch { }
    };

    checkLocale();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "customLocal" || e.key === null) checkLocale();
    };

    window.addEventListener("storage", handleStorageChange);
    const interval = setInterval(checkLocale, 500);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // theme changes
  useEffect(() => {
    const checkTheme = () => {
      try {
        setThemeColors(getThemeColors());
      } catch { }
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

  // selectedYear changes
  useEffect(() => {
    const checkSelectedYear = () => {
      try {
        const stored = localStorage.getItem("selectedYear");
        setSelectedYear((prev) => (prev !== stored ? stored : prev));
      } catch { }
    };

    checkSelectedYear();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "selectedYear" || e.key === null) checkSelectedYear();
    };

    window.addEventListener("storage", handleStorageChange);
    const interval = setInterval(checkSelectedYear, 100);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // selectedSoato changes
  useEffect(() => {
    const checkSelectedSoato = () => {
      try {
        const stored = localStorage.getItem("selectedSoato");
        setSelectedSoato((prev) => (prev !== stored ? stored : prev));
      } catch { }
    };

    checkSelectedSoato();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "selectedSoato" || e.key === null) checkSelectedSoato();
    };

    window.addEventListener("storage", handleStorageChange);
    const interval = setInterval(checkSelectedSoato, 100);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // load data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const fetchedData = await fetchEcologyData(locale, selectedYear, selectedSoato);
      setData(fetchedData);
      setLoading(false);
    };

    loadData();
  }, [locale, selectedYear, selectedSoato]);

  // ✅ selection by tur; backward-compatible storage {id,name}
  const handleTypeClick = useCallback(
    (index: number | null) => {
      if (index === null) {
        localStorage.removeItem("selectedTypeId");
        return;
      }

      const item = data[index];
      if (!item || item.value <= 0) return;

      const turId = item.tur;
      if (turId === undefined || turId === null) return;

      localStorage.setItem(
        "selectedTypeId",
        JSON.stringify({
          id: turId,
          name: TUR_API_NAMES[turId] || `Тип ${turId}`,
        })
      );
    },
    [data]
  );

  // ✅ <=1400: expand first (by tur), then selection
  const handleLegendClickWithExpand = useCallback(
    (index: number | null) => {
      if (index === null) {
        setExpandedTur(null);
        handleTypeClick(null);
        return;
      }

      const tur = data[index]?.tur;

      if (isCompact && tur !== undefined && tur !== null) {
        setExpandedTur((prev) => (prev === tur ? null : tur));
      }

      handleTypeClick(index);
    },
    [data, isCompact, handleTypeClick]
  );

  // (compat) findIndexByName: kept only for legacy fallback usage in chart
  const findIndexByName = useCallback(
    (name: string): number | null => {
      let turId: number | null = null;
      for (const [idStr, apiName] of Object.entries(TUR_API_NAMES)) {
        if (apiName === name) {
          turId = parseInt(idStr, 10);
          break;
        }
      }
      if (turId === null) return null;

      const translatedName = getTurName(turId, locale);
      const index = data.findIndex((item) => item.name === translatedName);
      return index >= 0 ? index : null;
    },
    [data, locale]
  );

  const borderRGB = useMemo(() => {
    const hex = (themeColors.primary || "#4eccf2").replace("#", "");
    return [
      parseInt(hex.substr(0, 2), 16),
      parseInt(hex.substr(2, 2), 16),
      parseInt(hex.substr(4, 2), 16),
    ] as const;
  }, [themeColors.primary]);

  const [r, g, b] = borderRGB;

  if (loading) {
    return (
      <div
        className="category-statistics-widget"
        style={
          {
            "--theme-primary": themeColors.primary,
            "--theme-light": themeColors.light,
          } as React.CSSProperties
        }
      >
        <div className="category-chart category-chart--skeleton" aria-busy="true" aria-label="Loading">
          <div className="category-chart__title-wrapper">
            <div className="cs-skeleton__title" />
          </div>

          <div className="cs-skeleton__content">
            <div className="cs-skeleton__left">
              <div className="cs-skeleton__disc">
                <div className="cs-skeleton__pause">
                  <span />
                  <span />
                </div>
              </div>
            </div>

            <div className="cs-skeleton__right">
              <div className="cs-skeleton__rows">
                <div className="cs-skeleton__row">
                  <div className="cs-skeleton__line cs-skeleton__line--w1" />
                  <div className="cs-skeleton__chip" />
                </div>

                <div className="cs-skeleton__row">
                  <div className="cs-skeleton__line cs-skeleton__line--w2" />
                  <div className="cs-skeleton__chip" />
                </div>

                <div className="cs-skeleton__row">
                  <div className="cs-skeleton__line cs-skeleton__line--w3" />
                  <div className="cs-skeleton__chip" />
                </div>
              </div>

              <div className="cs-skeleton__scrollbar" aria-hidden="true">
                <div className="cs-skeleton__scrollbtn cs-skeleton__scrollbtn--top" />
                <div className="cs-skeleton__scrolltrack">
                  <div className="cs-skeleton__scrollthumb" />
                </div>
                <div className="cs-skeleton__scrollbtn cs-skeleton__scrollbtn--bottom" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div
        className="category-statistics-widget"
        style={
          {
            "--border-glow-start": `rgba(78, 204, 242, 0.1)`,
            "--border-glow-end": `rgba(78, 204, 242, 0.35)`,
            "--theme-primary": themeColors.primary,
            "--theme-light": themeColors.light,
          } as React.CSSProperties
        }
      >
        <div className="category-chart" style={{ animation: "fadeIn 0.5s ease-out" }}>
          <div className="category-chart__title-wrapper" style={{ animation: "fadeInUp 0.6s ease-out" }}>
            <div className="category-chart__title">{t.title}</div>
          </div>

          <div
            className="category-chart__content"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              padding: "40px 20px",
            }}
          >
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                background: "rgba(255, 255, 255, 0.03)",
                border: "2px dashed rgba(255, 255, 255, 0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "24px",
                animation: "fadeInScale 0.7s ease-out 0.1s both",
              }}
            >
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(255, 255, 255, 0.4)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ animation: "pulse 2s ease-in-out infinite" }}
              >
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                <path d="M22 12A10 10 0 0 0 12 2v10z" />
                <circle cx="12" cy="12" r="1" fill="rgba(255, 255, 255, 0.4)" />
              </svg>
            </div>

            <div
              style={{
                color: "rgba(255, 255, 255, 0.6)",
                fontSize: "16px",
                fontWeight: 400,
                textAlign: "center",
                lineHeight: 1.5,
                animation: "fadeInUp 0.6s ease-out 0.2s both",
              }}
            >
              {t.noData}
            </div>

            <div
              style={{
                color: "rgba(255, 255, 255, 0.35)",
                fontSize: "13px",
                fontWeight: 300,
                textAlign: "center",
                marginTop: "8px",
                animation: "fadeInUp 0.6s ease-out 0.3s both",
              }}
            >
              {t.noDataHint}
            </div>
          </div>
        </div>

        <style>{`
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes fadeInUp { from { opacity: 0; transform: translateY(10px);} to { opacity: 1; transform: translateY(0);} }
          @keyframes fadeInScale { from { opacity: 0; transform: scale(0.9);} to { opacity: 1; transform: scale(1);} }
          @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 0.7; } }
        `}</style>
      </div>
    );
  }

  return (
    <div
      className="category-statistics-widget"
      style={
        {
          "--border-glow-start": `rgba(${r}, ${g}, ${b}, 0.1)`,
          "--border-glow-end": `rgba(${r}, ${g}, ${b}, 0.35)`,
          "--theme-primary": themeColors.primary,
          "--theme-light": themeColors.light,
        } as React.CSSProperties
      }
    >
      <CategoryChart
        data={data}
        title={t.title}
        onTypeClick={handleLegendClickWithExpand} // ✅ IMPORTANT
        sortOrder={sortOrder}
        onSortChange={setSortOrder}
        findIndexByName={findIndexByName} // legacy fallback
        isCompact={isCompact}
        expandedTur={expandedTur}
      />
    </div>
  );
};

export default Widget;

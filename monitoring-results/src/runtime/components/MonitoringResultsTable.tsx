/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { MonitoringResultItem } from "../types/monitoringTypes";
import StatusIndicator from "./StatusIndicator";
import { translations } from "../translations";
import "../styles/MonitoringResultsTable.css";
import { createPortal } from "react-dom";

// Normalize locale from storage format (uz-Latn, uz-Cyrl, ru, en, qqr) to internal format
const normalizeLocale = (locale: string | null): "uz" | "uzcryl" | "ru" | "en" | "qqr" => {
  if (!locale) return "ru";
  if (locale === "uz-Latn") return "uz";
  if (locale === "uz-Cyrl") return "uzcryl";
  if (locale === "uz" || locale === "uzcryl" || locale === "ru" || locale === "en" || locale === "qqr") return locale;
  return "ru";
};

function monitoringRowIdKey(s: string | undefined | null): string {
  const t = String(s ?? "").trim().replace(/[{}]/g, "").toLowerCase();
  return t;
}

function monitoringRowIdsEqual(a: string | undefined, b: string | undefined): boolean {
  const ka = monitoringRowIdKey(a);
  const kb = monitoringRowIdKey(b);
  return ka !== "" && ka === kb;
}

interface MonitoringResultsTableProps {
  data: MonitoringResultItem[];
  loading: boolean;
  error: string | null;
  selectedRowId?: string;
  onRowClick?: (item: MonitoringResultItem) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

type IdTooltipState = {
  visible: boolean;
  text: string;
  x: number;
  y: number;
};

/** Sort key = column date: timestamp from API, else DD.MM.YYYY from cell text */
function getDateSortKey(item: MonitoringResultItem): number | undefined {
  if (typeof item.lastEditedAt === "number" && !Number.isNaN(item.lastEditedAt)) {
    return item.lastEditedAt;
  }
  const s = item.lastEditedDate;
  if (!s || s === "—") return undefined;
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return undefined;
  const t = new Date(+m[3], +m[2] - 1, +m[1]).getTime();
  return Number.isNaN(t) ? undefined : t;
}

const MonitoringResultsTable: React.FC<MonitoringResultsTableProps> = ({
  data,
  loading,
  error,
  selectedRowId,
  onRowClick,
  hasMore,
  loadingMore,
  onLoadMore
}) => {
  const [locale, setLocale] = React.useState<"uz" | "uzcryl" | "ru" | "en" | "qqr">(() => {
    try {
      const stored = localStorage.getItem("customLocal");
      return normalizeLocale(stored);
    } catch {
      return "ru";
    }
  });
  const t = translations[locale] || translations.ru;

  const tbodyContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [showBottomFade, setShowBottomFade] = React.useState<boolean>(false);

  // ✅ ID tooltip (custom popup)
  const [idTip, setIdTip] = React.useState<IdTooltipState>({
    visible: false,
    text: "",
    x: 0,
    y: 0
  });

  const rafRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);
  const TOOLTIP_OFFSET_X = 14;
  const TOOLTIP_OFFSET_Y = 14;
  
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  
  const showIdTip = (text: string, x: number, y: number) => {
    const maxX = window.innerWidth - 16;
    const maxY = window.innerHeight - 16;
  
    setIdTip({
      visible: true,
      text,
      x: clamp(x + TOOLTIP_OFFSET_X, 8, maxX),
      y: clamp(y + TOOLTIP_OFFSET_Y, 8, maxY) // ✅ BELOW (was -)
    });
  };

  const moveIdTip = (x: number, y: number) => {
    if (!idTip.visible) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  
    rafRef.current = requestAnimationFrame(() => {
      const maxX = window.innerWidth - 16;
      const maxY = window.innerHeight - 16;
  
      setIdTip(prev =>
        prev.visible
          ? {
              ...prev,
              x: clamp(x + TOOLTIP_OFFSET_X, 8, maxX),
              y: clamp(y + TOOLTIP_OFFSET_Y, 8, maxY) // ✅ BELOW
            }
          : prev
      );
    });
  };

  const hideIdTip = () => {
    setIdTip(prev => (prev.visible ? { ...prev, visible: false } : prev));
  };

  const showIdTipFromEl = (text: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // ✅ anchor to the bottom edge of the cell
    showIdTip(text, r.left + r.width / 2, r.bottom);
  };

  type DateSortOrder = "asc" | "desc";
  const [dateSortOrder, setDateSortOrder] = React.useState<DateSortOrder>("desc");

  const sortedData = React.useMemo(() => {
    if (data.length === 0) return data;
    const rows = [...data];
    rows.sort((a, b) => {
      const at = getDateSortKey(a);
      const bt = getDateSortKey(b);
      if (at == null && bt == null) return 0;
      if (at == null) return 1;
      if (bt == null) return -1;
      return dateSortOrder === "asc" ? at - bt : bt - at;
    });
    return rows;
  }, [data, dateSortOrder]);

  const hasMoreData = !!hasMore;

  React.useEffect(() => {
    const checkLocale = () => {
      try {
        const stored = localStorage.getItem("customLocal");
        const newLocale = normalizeLocale(stored);
        setLocale(prevLocale => (newLocale !== prevLocale ? newLocale : prevLocale));
      } catch {}
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

  React.useEffect(() => {
    if (!selectedRowId || !tbodyContainerRef.current) return;

    const rows = tbodyContainerRef.current.querySelectorAll("tr[data-row-id]");
    const row = Array.from(rows).find((r) =>
      monitoringRowIdsEqual(r.getAttribute("data-row-id") ?? undefined, selectedRowId)
    );

    if (row instanceof HTMLElement) {
      const t = setTimeout(() => {
        row.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 80);
      return () => clearTimeout(t);
    }
  }, [selectedRowId, data]);

  React.useEffect(() => {
    const el = tbodyContainerRef.current;
    if (!el) return;
    const onUpdate = () => {
      const maxScroll = el.scrollHeight - el.clientHeight;
      setShowBottomFade(maxScroll > 0 && el.scrollTop < maxScroll - 10);
    };
    onUpdate();
    window.addEventListener("resize", onUpdate);
    return () => window.removeEventListener("resize", onUpdate);
  }, [sortedData.length]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight;
    const clientHeight = target.clientHeight;
    const maxScroll = scrollHeight - clientHeight;
    const isNearBottom = maxScroll > 0 && scrollTop < maxScroll - 10;
    setShowBottomFade(isNearBottom);
  };

  if (error) {
    return (
      <div className="monitoring-results-error">
        <p>{t.error}: {error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="monitoring-results-loading">
        <p>{t.loading}</p>
      </div>
    );
  }

  // Empty state when no data available
  if (data.length === 0) {
    return (
      <div className="monitoring-results-empty-state">
        <div className="monitoring-results-empty-icon-wrapper">
          <div className="monitoring-results-empty-ring" />
          <div className="monitoring-results-empty-dots">
            <div className="monitoring-results-empty-dot" />
            <div className="monitoring-results-empty-dot" />
            <div className="monitoring-results-empty-dot" />
            <div className="monitoring-results-empty-dot" />
          </div>
          <div className="monitoring-results-empty-icon">
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        <div className="monitoring-results-empty-title">{t.noData}</div>
        <div className="monitoring-results-empty-line" />
        <div className="monitoring-results-empty-subtitle">{t.noDataHint}</div>
      </div>
    );
  }

  return (
    <div className="monitoring-results-table-wrapper">
      <table className="monitoring-results-table">
        <thead>
          <tr>
            <th className="monitoring-results-header-id">{t.idColumn}</th>
            <th className="monitoring-results-header-date">
              <div className="monitoring-results-header-date-inner">
                <span className="monitoring-results-header-date-label">{t.dateColumn}</span>
                <button
                  type="button"
                  className={`monitoring-results-date-sort-btn ${dateSortOrder === "desc" ? "is-desc" : "is-asc"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDateSortOrder((o) => (o === "asc" ? "desc" : "asc"));
                  }}
                  title={
                    dateSortOrder === "desc"
                      ? t.dateSortNewestFirst
                      : t.dateSortOldestFirst
                  }
                  aria-label={
                    dateSortOrder === "desc"
                      ? t.dateSortNewestFirst
                      : t.dateSortOldestFirst
                  }
                >
                  <span className="monitoring-results-sort-arrows" aria-hidden>
                    <svg viewBox="0 0 12 8" className="sort-arrow-up">
                      <path
                        d="M6 1 L11 7 H1 Z"
                        fill="currentColor"
                      />
                    </svg>
                    <svg viewBox="0 0 12 8" className="sort-arrow-down">
                      <path
                        d="M6 7 L11 1 H1 Z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                </button>
              </div>
            </th>
            <th className="monitoring-results-header-status" colSpan={3}>
              <div className="monitoring-results-header-columns">
                <span className="monitoring-results-column-label">{t.uzcosmos}</span>
                <span className="monitoring-results-column-label">{t.ekologiya}</span>
                <span className="monitoring-results-column-label">{t.prokuratura}</span>
              </div>
            </th>
          </tr>
        </thead>
      </table>

      <div
        className="monitoring-results-tbody-container"
        ref={tbodyContainerRef}
        onScroll={handleScroll}
      >
        <table className="monitoring-results-table">
          <colgroup>
            <col className="monitoring-results-col-id" />
            <col className="monitoring-results-col-date" />
            <col className="monitoring-results-col-status" />
          </colgroup>
          <tbody className="monitoring-results-table-body">
            {sortedData.map((item) => {
              const isSelected = monitoringRowIdsEqual(selectedRowId, item.id);
              const shownId = (item as any).displayId ?? item.id;

              return (
                <tr
                  key={item.id}
                  className={`monitoring-results-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => onRowClick && onRowClick(item)}
                  data-row-id={item.id}
                >
                  <td
                    className="monitoring-results-id"
                    // ❌ removed title={item.id} because native tooltip can't be styled
                    tabIndex={0}
                    aria-label={shownId}
                    onMouseEnter={(e) => showIdTip(shownId, e.clientX, e.clientY)}
                    onMouseMove={(e) => moveIdTip(e.clientX, e.clientY)}
                    onMouseLeave={hideIdTip}
                    onFocus={(e) => showIdTipFromEl(shownId, e.currentTarget)}
                    onBlur={hideIdTip}
                  >
                    {shownId}
                  </td>

                  <td className="monitoring-results-date">
                    {item.lastEditedDate ?? "—"}
                  </td>

                  <td className="monitoring-results-status-cell" colSpan={3}>
                    <StatusIndicator
                      uzcosmosStatus={item.uzcosmos.status}
                      uzcosmosProgress={item.uzcosmos.progress}
                      ekologiyaStatus={item.ekologiya.status}
                      ekologiya={item.ekologiya.value}
                      prokraturaStatus={item.prokuratura.status}
                      prokraturaProgress={item.prokuratura.progress}
                    />
                  </td>
                </tr>
              );
            })}

            {hasMoreData && (
              <tr className="monitoring-results-load-more-row">
                <td colSpan={5}>
                  <button
                    className="monitoring-results-load-more-button"
                    type="button"
                    onClick={() => onLoadMore && onLoadMore()}
                    disabled={!!loadingMore}
                  >
                    <span className="load-more-text">
                      {loadingMore ? t.loading : t.loadMore}
                    </span>
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showBottomFade && <div className="monitoring-results-bottom-fade" />}

      {/* ✅ Tooltip portal (so it never gets clipped by the scroll container) */}
      {idTip.visible && typeof document !== "undefined" &&
        createPortal(
          <div
            className="monitoring-id-tooltip"
            style={{ left: `${idTip.x}px`, top: `${idTip.y}px` }}
          >
            {idTip.text}
          </div>,
          document.body
        )
      }
    </div>
  );
};


export default MonitoringResultsTable;
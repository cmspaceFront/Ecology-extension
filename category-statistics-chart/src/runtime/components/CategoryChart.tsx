/** @jsx jsx */
import { React, jsx } from "jimu-core";
import ReactECharts from "echarts-for-react";
import { useRef, useEffect, useState, useMemo } from "react";

interface CategoryData {
  name: string;
  value: number;
  color?: string;
  tur?: number;
  id_tur?: string;
}

interface CategoryChartProps {
  data: CategoryData[];
  title?: string;
  /** Мультивыбор: массив originalIndex; пустой — снять выбор. Второй аргумент — кликнутый индекс (для expand на узком экране). */
  onTypeClick?: (selectedOriginalIndices: number[], lastToggledOriginalIndex: number | null) => void;
  sortOrder?: "asc" | "desc" | null;
  onSortChange?: (order: "asc" | "desc" | null) => void;
  findIndexByName?: (name: string) => number | null;

  // ✅ expand support
  isCompact?: boolean;
  expandedTur?: number | null;
}

function indicesFromSelectedTypeStorage(
  raw: string,
  data: CategoryData[],
  findIndexByName?: (name: string) => number | null
): number[] {
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : parsed != null ? [parsed] : [];
  const idxSet = new Set<number>();
  for (const p of items) {
    if (!p || typeof p !== "object") continue;
    const idTur: string | null = typeof p.id_tur === "string" ? p.id_tur : null;
    if (idTur != null) {
      const i = data.findIndex((x) => x.id_tur === idTur);
      if (i >= 0) idxSet.add(i);
      continue;
    }
    const turId: number | null = typeof p.id === "number" ? p.id : null;
    if (turId !== null) {
      const i = data.findIndex((x) => x.tur === turId);
      if (i >= 0) idxSet.add(i);
      continue;
    }
    const legacyName: string | null = typeof p.name === "string" ? p.name : null;
    if (legacyName && findIndexByName) {
      const i = findIndexByName(legacyName);
      if (i !== null && i >= 0) idxSet.add(i);
    }
  }
  return [...idxSet].sort((a, b) => a - b);
}

const CategoryChart: React.FC<CategoryChartProps> = ({
  data,
  title = "Toifa kesimida ma'lumot",
  onTypeClick,
  sortOrder = "desc",
  onSortChange,
  findIndexByName,
  isCompact = false,
  expandedTur = null,
}) => {
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const donutContainerRef = useRef<HTMLDivElement>(null);

  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [chartKey, setChartKey] = useState<number>(0);

  const sortedData = useMemo(() => {
    if (!sortOrder) return data.map((item, index) => ({ ...item, originalIndex: index }));
    return [...data]
      .map((item, index) => ({ ...item, originalIndex: index }))
      .sort((a, b) => (sortOrder === "asc" ? a.value - b.value : b.value - a.value));
  }, [data, sortOrder]);

  // Восстановление выбора из localStorage (один объект или массив)
  useEffect(() => {
    if (typeof window === "undefined" || data.length === 0) return;

    try {
      const raw = localStorage.getItem("selectedTypeId");
      if (!raw || raw.trim() === "" || raw.trim() === "[]") {
        setSelectedIndices([]);
        return;
      }
      const next = indicesFromSelectedTypeStorage(raw, data, findIndexByName);
      setSelectedIndices(next);
    } catch {
      setSelectedIndices([]);
    }
  }, [data, findIndexByName]);

  // Colors
  const TUR_COLORS: { [key: number]: string } = {
    0: "#00c5ff",
    1: "#ffaa00",
    2: "#005ce6",
    3: "#ff0000",
    4: "#55ff00",
  };

  const colorGroups = [
    ["#00c5ff", "#00b3e6", "#009fcc", "#00d4ff"],
    ["#ffaa00", "#e69900", "#cc8800", "#ffb833"],
    ["#005ce6", "#0049b8", "#00368a", "#1a6feb"],
    ["#ff0000", "#e60000", "#cc0000", "#ff3333"],
    ["#55ff00", "#4ae600", "#3fcc00", "#6fff33"],
    ["#00F5FF", "#00D9E6", "#00BDCC", "#1AFFFF"],
    ["#FF6B00", "#E65C00", "#CC4D00", "#FF7A1A"],
    ["#FF0033", "#E6002E", "#CC0029", "#FF1A4D"],
    ["#FFD700", "#FFC107", "#FFB300", "#FFE033"],
    ["#00FFA3", "#00E694", "#00CC85", "#1AFFB3"],
    ["#BFFF00", "#A6E600", "#8CCC00", "#CCFF1A"],
    ["#4B00FF", "#3D00CC", "#2E0099", "#5C1AFF"],
    ["#FF4444", "#E63D3D", "#CC3636", "#FF5C5C"],
    ["#00FFCC", "#00E6B8", "#00CCA3", "#1AFFD6"],
    ["#FF0066", "#E6005C", "#CC0052", "#FF1A77"],
    ["#0066FF", "#0052CC", "#003D99", "#1A77FF"],
  ];

  const mixedColors: string[] = [];
  const maxGroupLength = Math.max(...colorGroups.map((group) => group.length));
  for (let i = 0; i < maxGroupLength; i++) {
    colorGroups.forEach((group) => {
      if (i < group.length) mixedColors.push(group[i]);
    });
  }

  const defaultColor = "#00c5ff";
  const getColorForTur = (tur: number): string => {
    if (TUR_COLORS[tur] !== undefined) return TUR_COLORS[tur];
    if (mixedColors.length === 0) return defaultColor;
    return mixedColors[tur % mixedColors.length] ?? defaultColor;
  };

  const getColorForIndex = (index: number): string => {
    if (mixedColors.length === 0) return defaultColor;
    return mixedColors[index % mixedColors.length] ?? defaultColor;
  };

  const lightenColor = (hex: string, percent: number): string => {
    if (hex == null || typeof hex !== "string") return defaultColor;
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
    const g = Math.min(
      255,
      Math.floor(((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * percent)
    );
    const b = Math.min(255, Math.floor((num & 0x0000ff) + (255 - (num & 0x0000ff)) * percent));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  };

  const darkenColor = (hex: string, percent: number): string => {
    if (hex == null || typeof hex !== "string") return defaultColor;
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00ff) * (1 - percent)));
    const b = Math.max(0, Math.floor((num & 0x0000ff) * (1 - percent)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  };

  const chartData = useMemo(() => {
    return sortedData
      .filter((item) => item.value > 0)
      .map((item, index) => {
        const originalIndex = (item as any).originalIndex ?? index;
        const baseColor =
          (item.tur !== undefined ? getColorForTur(item.tur) : getColorForIndex(originalIndex)) ??
          defaultColor;

        const isSelected = selectedIndices.includes(originalIndex);

        const itemColor =
          selectedIndices.length === 0
            ? baseColor
            : isSelected
              ? lightenColor(baseColor, 0.5)
              : darkenColor(baseColor, 0.6);

        return {
          name: item.name,
          value: item.value,
          itemStyle: {
            color: itemColor,
            borderColor: "rgba(16, 28, 50, 0.3)",
            borderWidth: 2,
            shadowBlur: isSelected ? 12 : 0,
            shadowColor: isSelected ? itemColor : "transparent",
            shadowOffsetX: 0,
            shadowOffsetY: 0,
          },
        };
      });
  }, [sortedData, selectedIndices]);

  const scrollToLegendItem = (index: number) => {
    if (!legendRef.current) return;
    const items = legendRef.current.children;
    if (!items[index]) return;

    const item = items[index] as HTMLElement;
    const container = legendRef.current;

    const itemTop = item.offsetTop;
    const itemHeight = item.offsetHeight;
    const containerHeight = container.clientHeight;
    const scrollTop = container.scrollTop;

    if (itemTop < scrollTop) {
      container.scrollTo({ top: itemTop - 8, behavior: "smooth" });
    } else if (itemTop + itemHeight > scrollTop + containerHeight) {
      container.scrollTo({ top: itemTop + itemHeight - containerHeight + 8, behavior: "smooth" });
    }
  };

  const handleChartClick = (params: any) => {
    if (!params || params.dataIndex === undefined) return;

    const chartDataIndex = params.dataIndex;
    const filteredSortedData = sortedData.filter((item) => item.value > 0);

    if (chartDataIndex < 0 || chartDataIndex >= filteredSortedData.length) return;

    const clickedItem = filteredSortedData[chartDataIndex];
    const originalIndex = (clickedItem as any).originalIndex ?? chartDataIndex;

    const nextSet = new Set(selectedIndices);
    if (nextSet.has(originalIndex)) nextSet.delete(originalIndex);
    else nextSet.add(originalIndex);
    const arr = [...nextSet].sort((a, b) => a - b);
    setSelectedIndices(arr);

    if (arr.length === 0) setChartKey((p) => p + 1);
    else scrollToLegendItem(originalIndex);

    onTypeClick?.(arr, originalIndex);
  };

  const handleLegendClick = (index: number) => {
    const item = data[index];
    if (!item || item.value <= 0) return;

    const nextSet = new Set(selectedIndices);
    if (nextSet.has(index)) nextSet.delete(index);
    else nextSet.add(index);
    const arr = [...nextSet].sort((a, b) => a - b);
    setSelectedIndices(arr);

    if (arr.length === 0) setChartKey((p) => p + 1);

    onTypeClick?.(arr, index);
  };

  const handleLegendMouseEnter = (e: React.MouseEvent<HTMLDivElement>, text: string) => {
    const element = e.currentTarget;
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;

    const tooltipWidth = 300;
    const tooltipHeight = 60;

    let left = rect.left + rect.width / 2;
    let top = rect.top - tooltipHeight - 12;

    if (left - tooltipWidth / 2 < 10) left = tooltipWidth / 2 + 10;
    else if (left + tooltipWidth / 2 > viewportWidth - 10) left = viewportWidth - tooltipWidth / 2 - 10;

    if (top < 10) top = rect.bottom + 12;

    setTooltip({ text, x: left, y: top });
  };

  const handleLegendMouseLeave = () => setTooltip(null);

  useEffect(() => {
    setChartKey((p) => p + 1);
  }, [selectedIndices]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chartInstance = chartRef.current?.getEchartsInstance?.();
    if (!chartInstance) return;

    const timer = setTimeout(() => {
      chartInstance.dispatchAction({ type: "downplay", seriesIndex: 0 });

      const filteredSortedData = sortedData.filter((item) => item.value > 0);
      if (selectedIndices.length > 0) {
        filteredSortedData.forEach((item, idx) => {
          const orig = (item as any).originalIndex as number;
          if (!selectedIndices.includes(orig)) {
            chartInstance.dispatchAction({ type: "blur", seriesIndex: 0, dataIndex: idx });
          }
        });
        selectedIndices.forEach((origIdx) => {
          const chartDataIndex = filteredSortedData.findIndex(
            (item) => (item as any).originalIndex === origIdx
          );
          if (chartDataIndex >= 0) {
            chartInstance.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: chartDataIndex });
          }
        });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedIndices, sortedData, chartKey]);

  // Синхронизация: selectedTypeId сброшен или изменён в другом виджете
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkStorage = () => {
      try {
        const value = localStorage.getItem("selectedTypeId");
        if (!value || value.trim() === "" || value.trim() === "[]") {
          setSelectedIndices((prev) => (prev.length === 0 ? prev : []));
          return;
        }
        if (data.length === 0) return;
        const next = indicesFromSelectedTypeStorage(value, data, findIndexByName);
        setSelectedIndices((prev) => {
          if (prev.length === next.length && prev.every((v, i) => v === next[i])) return prev;
          return next;
        });
      } catch { }
    };

    checkStorage();

    const interval = window.setInterval(checkStorage, 150);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "selectedTypeId" || e.key === null) checkStorage();
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("storage", handleStorage);
    };
  }, [data, findIndexByName]);

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      animation: true,
      animationDuration: 1200,
      animationEasing: "cubicOut",
      animationDurationUpdate: 600,
      animationEasingUpdate: "cubicOut",
      tooltip: false,
      series: [
        {
          type: "pie",
          radius: ["55%", "85%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: false,
          tooltip: { show: false },
          animation: true,
          animationType: "scale",
          animationDuration: 1200,
          animationEasing: "elasticOut",
          animationDurationUpdate: 600,
          animationEasingUpdate: "cubicOut",
          animationThreshold: 2000,
          startAngle: 90,
          clockwise: true,
          padAngle: 0,
          minAngle: 0,
          stillShowZeroSum: false,
          minShowLabelAngle: 0,
          // Rounded sector ends: [inner arc corners, outer arc corners] for donut; increase for rounder “caps”
          itemStyle: { borderRadius: [12, 16] },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            label: { show: false },
            itemStyle: {
              borderRadius: [12, 16],
              shadowBlur: 10,
              shadowColor: "rgba(255, 255, 255, 0.3)",
            },
            scale: true,
            scaleSize: 8,
            focus: "none",
            blurScope: "none",
          },
          blur: { itemStyle: { opacity: 0.25 } },
          data: chartData,
        },
      ],
    }),
    [chartData]
  );

  useEffect(() => {
    if (!chartRef.current) return;
    const chartInstance = chartRef.current.getEchartsInstance();
    if (!chartInstance) return;

    chartInstance.dispatchAction({ type: "hideTip" });

    const tooltipElements = document.querySelectorAll(".echarts-tooltip");
    tooltipElements.forEach((el: any) => {
      if (el) {
        el.style.display = "none";
        el.style.visibility = "hidden";
        el.style.opacity = "0";
      }
    });
  }, [option]);

  useEffect(() => {
    if (!donutContainerRef.current || !chartRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      const chartInstance = chartRef.current?.getEchartsInstance?.();
      if (chartInstance) chartInstance.resize();
    });

    resizeObserver.observe(donutContainerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="category-chart">
      <div className="category-chart__title-wrapper">
        <div className="category-chart__title">{title}</div>

        {onSortChange && (
          <button
            className="category-chart__sort-button"
            data-active={sortOrder !== null ? "true" : "false"}
            onClick={() => {
              if (sortOrder === "desc") onSortChange("asc");
              else if (sortOrder === "asc") onSortChange(null);
              else onSortChange("desc");
            }}
            title="Сортировка"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {sortOrder === "asc" ? (
                <g>
                  <path d="M11 11h4" />
                  <path d="M11 15h7" />
                  <path d="M11 19h10" />
                  <path d="M9 7 6 4 3 7" />
                  <path d="M6 6v14" />
                </g>
              ) : sortOrder === "desc" ? (
                <g>
                  <path d="M11 11h4" />
                  <path d="M11 15h7" />
                  <path d="M11 19h10" />
                  <path d="M9 15 6 18 3 15" />
                  <path d="M6 18V4" />
                </g>
              ) : (
                <g>
                  <path d="M3 6h18" />
                  <path d="M7 12h10" />
                  <path d="M10 18h4" />
                </g>
              )}
            </svg>
          </button>
        )}
      </div>

      <div className="category-chart__content">
        <div className="category-chart__donut" ref={donutContainerRef}>
          <ReactECharts
            key={chartKey}
            ref={chartRef}
            option={option}
            style={{ width: "100%", height: "100%" }}
            notMerge={false}
            lazyUpdate={false}
            opts={{ renderer: "canvas", devicePixelRatio: 2 }}
            onEvents={{
              click: handleChartClick,
              mouseover: () => {
                const chartInstance = chartRef.current?.getEchartsInstance?.();
                if (chartInstance) chartInstance.dispatchAction({ type: "hideTip" });
              },
            }}
          />
        </div>

        <div className="category-chart__legend-wrapper">
          <div ref={legendRef} className="category-chart__legend">
            {sortedData.map((item, index) => {
              const originalIndex = (item as any).originalIndex ?? index;
              const isSelected = selectedIndices.includes(originalIndex);
              const hasValue = item.value > 0;

              // ✅ FIX: compute isExpanded here (no TS error, stable behavior)
              const isExpanded =
                !!isCompact &&
                expandedTur !== null &&
                item.tur !== undefined &&
                item.tur === expandedTur;

              return (
                <div
                  key={originalIndex}
                  className={[
                    "category-chart__legend-item",
                    isSelected ? "category-chart__legend-item--active" : "",
                    isExpanded ? "is-expanded" : "",
                  ].join(" ")}
                  onClick={() => handleLegendClick(originalIndex)}
                  onMouseEnter={(e) => handleLegendMouseEnter(e, item.name)}
                  onMouseLeave={handleLegendMouseLeave}
                  style={{ cursor: hasValue ? "pointer" : "default" }}
                >
                  <div className="category-chart__legend-text">{item.name}</div>

                  {hasValue && (
                    <div
                      className="category-chart__legend-badge"
                      style={{
                        background:
                          item.tur !== undefined ? getColorForTur(item.tur) : getColorForIndex(originalIndex),
                      }}
                    >
                      {item.value.toLocaleString("ru-RU")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {tooltip && (
        <div
          className="category-chart__tooltip"
          style={{
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
};

export default CategoryChart;
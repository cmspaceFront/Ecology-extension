/** @jsx jsx */
import { React, jsx } from "jimu-core";
import ReactECharts from "echarts-for-react";
import { useRef, useEffect, useState, useMemo } from "react";

interface CategoryData {
  name: string;
  value: number;
  color?: string;
  tur?: number;
}

interface CategoryChartProps {
  data: CategoryData[];
  title?: string;
  onTypeClick?: (index: number | null) => void;
  sortOrder?: "asc" | "desc" | null;
  onSortChange?: (order: "asc" | "desc" | null) => void;
  findIndexByName?: (name: string) => number | null;

  // ✅ expand support
  isCompact?: boolean;
  expandedTur?: number | null;
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

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [chartKey, setChartKey] = useState<number>(0);

  const sortedData = useMemo(() => {
    if (!sortOrder) return data.map((item, index) => ({ ...item, originalIndex: index }));
    return [...data]
      .map((item, index) => ({ ...item, originalIndex: index }))
      .sort((a, b) => (sortOrder === "asc" ? a.value - b.value : b.value - a.value));
  }, [data, sortOrder]);

  // ✅ Restore selection from localStorage:
  // priority: parsed.id (tur) -> stable
  // fallback: parsed.name (legacy)
  useEffect(() => {
    if (typeof window === "undefined" || data.length === 0) return;

    try {
      const raw = localStorage.getItem("selectedTypeId");

      // If removed anywhere -> keep deselected
      if (!raw) {
        if (selectedIndex !== null) {
          setSelectedIndex(null);
          setChartKey((p) => p + 1);
        }
        return;
      }

      const parsed = JSON.parse(raw);

      const turId: number | null =
        typeof parsed?.id === "number" ? parsed.id : null;

      if (turId !== null) {
        const found = data.findIndex((x) => x.tur === turId);
        if (found >= 0) {
          if (found !== selectedIndex) {
            setSelectedIndex(found);
          }
          return;
        }
      }

      // legacy fallback by name
      const legacyName: string | null =
        typeof parsed?.name === "string" ? parsed.name : null;

      if (legacyName && findIndexByName) {
        const foundIndex = findIndexByName(legacyName);
        if (foundIndex !== null && foundIndex >= 0 && foundIndex < data.length) {
          if (foundIndex !== selectedIndex) {
            setSelectedIndex(foundIndex);
          }
        }
      }
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Colors
  const TUR_COLORS: { [key: number]: string } = {
    0: "#00D9FF",
    1: "#0066FF",
    2: "#9D4EDD",
    3: "#FF006E",
    4: "#00FF88",
  };

  const colorGroups = [
    ["#00D9FF", "#00C4E6", "#00B8D9", "#00E6FF"],
    ["#0066FF", "#0052CC", "#003D99", "#007AFF"],
    ["#9D4EDD", "#7B2CBF", "#5A189A", "#C77DFF"],
    ["#FF006E", "#E0005F", "#C0004F", "#FF1A7E"],
    ["#00FF88", "#00E67A", "#00CC6B", "#1AFF99"],
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

  const getColorForTur = (tur: number): string => {
    if (TUR_COLORS[tur] !== undefined) return TUR_COLORS[tur];
    return mixedColors[tur % mixedColors.length];
  };

  const getColorForIndex = (index: number) => mixedColors[index % mixedColors.length];

  const lightenColor = (hex: string, percent: number): string => {
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
          item.tur !== undefined ? getColorForTur(item.tur) : getColorForIndex(originalIndex);

        const isSelected = selectedIndex === originalIndex;

        const itemColor =
          selectedIndex === null
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
  }, [sortedData, selectedIndex]);

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

    const newSelectedIndex = originalIndex === selectedIndex ? null : originalIndex;
    setSelectedIndex(newSelectedIndex);

    if (newSelectedIndex === null) setChartKey((p) => p + 1);
    if (newSelectedIndex !== null) scrollToLegendItem(newSelectedIndex);

    onTypeClick?.(newSelectedIndex);
  };

  const handleLegendClick = (index: number) => {
    const item = data[index];
    if (!item || item.value <= 0) return;

    const newSelectedIndex = index === selectedIndex ? null : index;
    setSelectedIndex(newSelectedIndex);

    if (newSelectedIndex === null) setChartKey((p) => p + 1);

    onTypeClick?.(newSelectedIndex);
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
  }, [selectedIndex]);

  useEffect(() => {
    if (!chartRef.current) return;
    const chartInstance = chartRef.current?.getEchartsInstance?.();
    if (!chartInstance) return;

    const timer = setTimeout(() => {
      chartInstance.dispatchAction({ type: "downplay", seriesIndex: 0 });

      if (selectedIndex !== null) {
        const filteredSortedData = sortedData.filter((item) => item.value > 0);
        const chartDataIndex = filteredSortedData.findIndex(
          (item) => (item as any).originalIndex === selectedIndex
        );

        if (chartDataIndex >= 0) {
          filteredSortedData.forEach((_, idx) => {
            if (idx !== chartDataIndex) {
              chartInstance.dispatchAction({ type: "blur", seriesIndex: 0, dataIndex: idx });
            }
          });
          chartInstance.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: chartDataIndex });
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectedIndex, sortedData, chartKey]);

  // ✅ storage sync: if selectedTypeId removed elsewhere -> stay deselected
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkStorage = () => {
      try {
        const value = localStorage.getItem("selectedTypeId");
        if (!value && selectedIndex !== null) {
          setSelectedIndex(null);
          setChartKey((p) => p + 1);
        }
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
  }, [selectedIndex]);

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
          itemStyle: { borderRadius: 8 },
          label: { show: false },
          labelLine: { show: false },
          emphasis: {
            label: { show: false },
            itemStyle: { shadowBlur: 10, shadowColor: "rgba(255, 255, 255, 0.3)" },
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
              const isSelected = selectedIndex === originalIndex;
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

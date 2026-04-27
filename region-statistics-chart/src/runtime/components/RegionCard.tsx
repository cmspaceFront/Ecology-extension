/** @jsx jsx */
import { React, jsx } from "jimu-core";
import ReactECharts from "echarts-for-react";
import { useRef, useEffect, useMemo, useState } from "react";
import { ThemeColors, hexToRgb, rgbToHex } from "../themeUtils";
import YearFilter from "./YearFilter";

interface RegionData {
  name: string;
  value: number;
  code?: string; // Код для сохранения в localStorage
}

interface RegionCardProps {
  data: RegionData[];
  selectedYear: number;
  onRegionClick?: (regionName: string, code?: string) => void;
  selectedRegion?: string | null;
  selectedDistrict?: string | null;
  selectedItemCode?: string | null; // Код выбранного элемента для визуального выделения
  onBackClick?: () => void;
  title?: string;
  backLabel?: string;
  sortOrder?: "asc" | "desc" | null;
  onSortChange?: (order: "asc" | "desc" | null) => void;
  themeColors?: ThemeColors;
  availableYears?: number[];
  onYearChange?: (year: number) => void;
}

const RegionCard: React.FC<RegionCardProps> = ({
  data,
  selectedYear,
  onRegionClick,
  selectedRegion,
  selectedDistrict,
  selectedItemCode,
  onBackClick,
  title,
  backLabel,
  sortOrder = null,
  onSortChange,
  themeColors,
  availableYears,
  onYearChange,
}) => {
  const chartRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(300);
  const textColor = "#e8e8e8";
  const resolvedBackLabel = backLabel || "Orqaga";

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dataMaxValue = Math.max(...data.map((item) => item.value), 0);
  const dataMinValue = Math.min(...data.map((item) => item.value), 0);
  const valueRange = dataMaxValue - dataMinValue || 1; // Избегаем деления на ноль

  // Используем цвета из темы или цвета по умолчанию
  const primaryColor = themeColors?.primary || "#4eccf2";  // Основной насыщенный цвет для всех баров

  // Функция для вычисления цвета - все бары используют одинаковый насыщенный цвет
  const getColorByValue = (value: number): string => {
    // Все бары используют одинаковый насыщенный цвет независимо от значения
    return primaryColor;
  };

  // Улучшенная логика округления с учетом максимального значения
  // Цель: меньше линий сетки, правильное округление
  let step: number;
  let maxValue: number;

  if (dataMaxValue === 0) {
    step = 10;
    maxValue = 10;
  } else if (dataMaxValue <= 50) {
    // Для малых значений используем шаг 10-20
    step = dataMaxValue <= 20 ? 5 : 10;
    maxValue = Math.ceil(dataMaxValue / step) * step;
    // Округляем до ближайшего кратного step
    if (maxValue < dataMaxValue * 1.1) {
      maxValue += step;
    }
  } else if (dataMaxValue <= 100) {
    step = 20;
    maxValue = Math.ceil(dataMaxValue / step) * step;
    if (maxValue < dataMaxValue * 1.1) {
      maxValue += step;
    }
  } else if (dataMaxValue <= 200) {
    step = 50;
    maxValue = Math.ceil(dataMaxValue / step) * step;
    if (maxValue < dataMaxValue * 1.1) {
      maxValue += step;
    }
  } else if (dataMaxValue <= 500) {
    step = 100;
    maxValue = Math.ceil(dataMaxValue / step) * step;
    if (maxValue < dataMaxValue * 1.1) {
      maxValue += step;
    }
  } else if (dataMaxValue <= 1000) {
    step = 200;
    maxValue = Math.ceil(dataMaxValue / step) * step;
    if (maxValue < dataMaxValue * 1.1) {
      maxValue += step;
    }
  } else {
    // Для больших значений используем шаг 500
    step = 500;
    maxValue = Math.ceil(dataMaxValue / step) * step;
    if (maxValue < dataMaxValue * 1.1) {
      maxValue += step;
    }
  }

  // Адаптивные размеры на основе ширины контейнера
  const gridLeft   = containerWidth > 520 ? 170 : containerWidth > 400 ? 152 : containerWidth > 300 ? 145 : containerWidth > 220 ? 118 : 100;
  const gridRight  = containerWidth > 300 ? 18 : 12;
  const fontSize   = containerWidth > 520 ? 14  : containerWidth > 400 ? 13  : containerWidth > 300 ? 12  : 11;
  const calculatedBarHeight = containerWidth > 520 ? 38 : containerWidth > 400 ? 32 : containerWidth > 300 ? 28 : 24;
  const yAxisWidth = gridLeft - 10;

  // Ограничиваем видимую область до 9 элементов по умолчанию
  const maxVisibleItems = 9;
  const dataCount = data.length;
  const shouldShowScroll = dataCount > maxVisibleItems;

  const barCategoryGap = 1;

  // Высота контейнера для видимой области (9 элементов)
  const containerHeight = maxVisibleItems * (calculatedBarHeight + barCategoryGap) + 150;
  // Высота всего чарта (все элементы)
  const fullChartHeight = dataCount * (calculatedBarHeight + barCategoryGap) + 150;

  // Функция для удаления пробелов между буквами и символами
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
      
      // Пробел только перед/после пунктуации и символов Unicode (\w не включает кириллицу — иначе «Ташкент г.» → «Ташкентг.»)
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

  /** Тусклость только если выделение относится к строке этого графика (не код области в списке районов). */
  const selectionInList = useMemo(
    () =>
      Boolean(
        selectedItemCode &&
        data.some((item) => item.code === selectedItemCode)
      ),
    [data, selectedItemCode]
  );

  // Функция для осветления цвета (делает цвет ярче)
  const lightenColor = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent));
    const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * percent));
    const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * percent));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  };

  // Функция для затемнения цвета (делает цвет темнее)
  const darkenColor = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)));
    const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  };

  // Функция для насыщения цвета (делает цвет ярче и насыщеннее)
  const saturateColor = (hex: string, percent: number): string => {
    const num = parseInt(hex.replace("#", ""), 16);
    let r = (num >> 16) & 0xFF;
    let g = (num >> 8) & 0xFF;
    let b = num & 0xFF;
    
    // Находим средний серый компонент
    const gray = (r + g + b) / 3;
    
    // Увеличиваем отклонение от серого (насыщенность)
    r = Math.min(255, Math.max(0, Math.round(gray + (r - gray) * (1 + percent))));
    g = Math.min(255, Math.max(0, Math.round(gray + (g - gray) * (1 + percent))));
    b = Math.min(255, Math.max(0, Math.round(gray + (b - gray) * (1 + percent))));
    
    // Добавляем небольшое осветление для яркости
    r = Math.min(255, r + Math.round(20 * percent));
    g = Math.min(255, g + Math.round(20 * percent));
    b = Math.min(255, b + Math.round(20 * percent));
    
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  };

  const chartData = useMemo(() => {
    return data.map((item) => {
      const isSelected =
        selectionInList && !!selectedItemCode && item.code === selectedItemCode;
      const baseColor = getColorByValue(item.value); // Цвет зависит от значения (мягкий градиент)
      
      // Яркий насыщенный цвет для активного элемента
      const vibrantColor = saturateColor(baseColor, 0.7);
      
      // Без выделения по списку — все одинаково ярко; иначе контраст выбранного
      const itemColor = !selectionInList
        ? vibrantColor
        : isSelected
          ? lightenColor(saturateColor(baseColor, 0.85), 0.08)
          : darkenColor(baseColor, 0.14);

      return {
        name: normalizeName(item.name),
        value: item.value,
        label:
          isSelected
            ? {
                fontWeight: "700" as const,
                fontSize: fontSize + 1,
                color: "#ffffff",
              }
            : selectionInList
              ? { color: "rgba(232, 232, 232, 0.82)" }
              : {},
        itemStyle: {
          color: itemColor,
          borderRadius: [0, 10, 10, 0] as const,
          shadowBlur: isSelected ? 22 : 0,
          shadowColor: isSelected ? `${primaryColor}cc` : "transparent",
          shadowOffsetY: isSelected ? 2 : 0,
          opacity: !selectionInList ? 1 : isSelected ? 1 : 0.94,
        },
      };
    });
  }, [data, selectionInList, selectedItemCode, primaryColor, fontSize]);

  const categories = data.map((item) => normalizeName(item.name));

  const handleBarClick = (params: any) => {
    const normalizedName = params?.name;
    if (!normalizedName) return;

    // Находим код выбранного элемента, сравнивая нормализованные имена
    const selectedItem = data.find(item => normalizeName(item.name) === normalizedName);
    const code = selectedItem?.code;
    const originalName = selectedItem?.name || normalizedName;

    onRegionClick?.(originalName, code);

    window.dispatchEvent(
      new CustomEvent("region-statistics-region-clicked", {
        detail: { regionName: originalName, code },
      })
    );
  };

  const option = {
    backgroundColor: "transparent",
    animation: true,
    animationDuration: 800,
    animationDelay: (idx: number) => idx * 50,
    animationEasing: 'elasticOut',
    animationDurationUpdate: 600,
    animationEasingUpdate: 'cubicOut',

    grid: {
      left: gridLeft,
      right: gridRight,
      top: 22,
      bottom: 40,
      containLabel: false,
      ...(dataCount > 20 && {
        top: 28,
        bottom: 50,
      }),
    },

    xAxis: {
      type: "value",
      min: 0,
      max: maxValue,
      boundaryGap: [0, 0],
      position: "bottom",
      axisLine: {
        show: false,
      },
      axisTick: { show: false },

      axisLabel: {
        show: false, // Скрываем значения на оси X
      },

      splitLine: {
        show: false, 
      },
      splitNumber: Math.min(Math.ceil(maxValue / step), 10),
      interval: step,
    },

    yAxis: {
      type: "category",
      data: categories,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: textColor,
        fontSize: fontSize,
        fontWeight: 400,
        fontFamily: "'Geologica', sans-serif",
        margin: containerWidth > 260 ? 10 : 8,
        width: yAxisWidth,
        overflow: "none",
        formatter: (value: string, index: number) => {
          const normalized = normalizeName(value);
          const withApostrophe = normalized.replace(
            /([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])([''ʻʼʽ`])([a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ0-9])/g,
            "$1$2$3"
          );
          const item = data[index];
          const isSel = !!(
            selectionInList &&
            selectedItemCode &&
            item?.code === selectedItemCode
          );
          const safe = withApostrophe.replace(/\|/g, "\uFF5c");
          if (selectionInList) {
            if (isSel) return `{regionBarSel|${safe}}`;
            return `{regionBarDim|${safe}}`;
          }
          return withApostrophe;
        },
        rich: {
          normal: {
            color: textColor,
            fontSize: fontSize,
            fontFamily: "'Geologica', sans-serif",
            fontWeight: 400,
          },
          regionBarSel: {
            color: "#ffffff",
            fontWeight: "600",
            fontSize: fontSize + 1,
            fontFamily: "'Geologica', sans-serif",
            textShadowColor: primaryColor,
            textShadowBlur: 5,
          },
          regionBarDim: {
            color: "rgba(232, 232, 232, 0.78)",
            fontSize,
            fontFamily: "'Geologica', sans-serif",
            fontWeight: 400,
          },
        },
      },
      boundaryGap: true,
      splitLine: {
        show: false,
      },
    },

    series: [
      {
        type: "bar",
        data: chartData,
        barWidth: calculatedBarHeight,
        barCategoryGap: barCategoryGap,
        label: {
          show: true,
          position: "right",
          color: textColor,
          fontSize: fontSize,
          fontWeight: 500,
          fontFamily: "'Geologica', sans-serif",
        },
        itemStyle: {
          borderRadius: [0, 10, 10, 0],
        },
        animation: true,
        animationType: 'expansion',
        animationDuration: 800,
        animationDelay: (idx: number) => idx * 50,
        animationEasing: 'elasticOut',
        animationDurationUpdate: 600,
        animationEasingUpdate: 'cubicOut',
        emphasis: {
          itemStyle: {
            shadowBlur: 20,
            shadowColor: `${primaryColor}99`,
          },
          focus: "none",
          blurScope: "none",
          scale: true,
          scaleSize: 14,
        },
        blur: {
          itemStyle: {
            opacity: 0.78,
          },
        },
      },
    ],

    tooltip: {
      trigger: "axis",
      axisPointer: { 
        type: "none" 
      },
      formatter: (params: any) => {
        const param = params[0];
        return `${normalizeName(param.name)}: ${param.value}`;
      },
      backgroundColor: "rgba(16, 28, 50, 0.25)",
      borderColor: "rgba(255, 255, 255, 0.08)",
      extraCssText: `
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
        padding: 8px 10px;
      `,
      textStyle: { 
        color: textColor,
        fontSize: fontSize,
        fontFamily: "'Geologica', sans-serif",
      },
    },
  };

  useEffect(() => {
    if (!chartRef.current) return;
    
    const chartInstance = chartRef.current?.getEchartsInstance?.();
    if (!chartInstance) return;

    // Небольшая задержка для гарантии, что чарт полностью отрендерился
    const timer = setTimeout(() => {
      // Сначала сбрасываем все highlight и blur
      chartInstance.dispatchAction({
        type: 'downplay',
        seriesIndex: 0
      });

      if (selectionInList && selectedItemCode) {
        const selectedIndex = chartData.findIndex(
          (item) => {
            const originalItem = data.find(d => normalizeName(d.name) === item.name);
            return originalItem?.code === selectedItemCode;
          }
        );

        if (selectedIndex >= 0) {
          // Применяем blur ко всем элементам кроме выбранного
          chartData.forEach((_, index) => {
            if (index !== selectedIndex) {
              chartInstance.dispatchAction({
                type: 'blur',
                seriesIndex: 0,
                dataIndex: index,
              });
            }
          });

          // Применяем highlight к выбранному элементу
          chartInstance.dispatchAction({
            type: 'highlight',
            seriesIndex: 0,
            dataIndex: selectedIndex
          });
        }
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [selectionInList, selectedItemCode, chartData, data]);

  return (
    <div className="region-card">
      <div className="region-card__title-wrapper">
        <div className="region-card__title-bar">
          <div className="region-card__title-left">
            {(selectedRegion || selectedDistrict) && onBackClick && (
              <button
                className="region-card__back-button"
                onClick={onBackClick}
                title={resolvedBackLabel}
                aria-label={resolvedBackLabel}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}
            {availableYears && availableYears.length > 0 && onYearChange && (
              <div className="region-card__title-year">
                <YearFilter
                  variant="chart"
                  selectedYear={selectedYear}
                  years={availableYears}
                  onYearChange={onYearChange}
                  themeColors={themeColors}
                />
              </div>
            )}
          </div>
          <div className="region-card__title-right">
            {onSortChange ? (
              <button
                className="region-card__sort-button"
                data-active={sortOrder !== null ? "true" : "false"}
                onClick={() => {
                  if (sortOrder === "desc") {
                    onSortChange("asc");
                  } else if (sortOrder === "asc") {
                    onSortChange(null);
                  } else {
                    onSortChange("desc");
                  }
                }}
                title="Сортировка"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
            ) : (
              <span className="region-card__title-right-spacer" aria-hidden />
            )}
          </div>
        </div>
        <div className="region-card__title-center">
          <div className="region-card__title">
            {title ||
              (selectedRegion
                ? `${selectedRegion} tumanlari`
                : "Viloyat kesimida statistika")}
          </div>
        </div>
      </div>

      <div className="region-card__chart-host" ref={containerRef}>
        <div
          className={`region-card__chart ${shouldShowScroll ? 'region-card__chart--scrollable' : ''} ${selectedDistrict ? 'region-card__chart--level-3' : ''}`}
          style={{
            overflowY: shouldShowScroll ? "auto" : "hidden",
            overflowX: "hidden",
            ...(shouldShowScroll && {
              flex: "none",
              scrollbarWidth: "thin",
              scrollbarColor: `${themeColors?.primary || "#4eccf2"} transparent`,
            }),
          }}
        >
          <ReactECharts
            ref={chartRef}
            key={`${selectedYear}-${selectedRegion || "root"}-${selectedDistrict || ""}`}
            option={option}
            style={{ 
              width: "100%", 
              height: shouldShowScroll ? `${fullChartHeight}px` : "100%", 
              minHeight: shouldShowScroll ? "auto" : "300px",
            }}
            notMerge={true}
            lazyUpdate={false}
            onEvents={{ click: handleBarClick }}
          />
        </div>
      </div>
    </div>
  );
};

export default RegionCard;

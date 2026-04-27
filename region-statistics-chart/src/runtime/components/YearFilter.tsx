/** @jsx jsx */
import { React, jsx } from "jimu-core";
import { useState, useRef, useEffect, useLayoutEffect, useId } from "react";
import { createPortal } from "react-dom";
import { ThemeColors } from "../themeUtils";

interface YearFilterProps {
  selectedYear: number;
  years: number[];
  onYearChange: (year: number) => void;
  themeColors?: ThemeColors;
  variant?: "default" | "chart";
}

type MenuRect = { top: number; left: number; width: number };

const YearFilter: React.FC<YearFilterProps> = ({
  selectedYear,
  years,
  onYearChange,
  themeColors,
  variant = "default",
}) => {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<MenuRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  if (years.length === 0) {
    return null;
  }

  const sortedYears = [...years].sort((a, b) => b - a);
  const valueInList = sortedYears.includes(selectedYear)
    ? selectedYear
    : sortedYears[0];

  const accent = themeColors?.primary || "#4eccf2";

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Ширина списка = внешняя ширина кнопки (без искусственного min — иначе меню шире триггера)
      const w = Math.max(Math.ceil(r.width), 1);
      const left = Math.min(r.left, window.innerWidth - w - 8);
      setMenuRect({
        top: r.bottom + 6,
        left: Math.max(8, left),
        width: w,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;

    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const rootClass = [
    variant === "chart" ? "year-filter year-filter--chart" : "year-filter",
    open ? "year-filter--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const pickYear = (year: number) => {
    onYearChange(year);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const menuNode =
    open &&
    menuRect &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={menuPanelRef}
        id={listId}
        className="year-filter__menu year-filter__menu--portal"
        role="listbox"
        aria-labelledby={`${listId}-trigger`}
        style={
          {
            position: "fixed",
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width,
            zIndex: 99999,
            "--year-accent": accent,
          } as React.CSSProperties
        }
      >
        <div className="year-filter__items">
          {sortedYears.map((year) => (
            <button
              key={year}
              type="button"
              role="option"
              aria-selected={year === valueInList}
              className={`year-filter__option${
                year === valueInList ? " year-filter__option--active" : ""
              }`}
              onClick={() => pickYear(year)}
            >
              {year}
            </button>
          ))}
        </div>
      </div>,
      document.body
    );

  return (
    <div
      ref={rootRef}
      className={rootClass}
      style={{ "--year-accent": accent } as React.CSSProperties}
    >
      <div className="year-filter__dropdown">
        <button
          ref={triggerRef}
          type="button"
          id={`${listId}-trigger`}
          className="year-filter__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="year-filter__trigger-value">{valueInList}</span>
          <span className="year-filter__trigger-chevron" aria-hidden>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </button>
      </div>
      {menuNode}
    </div>
  );
};

export default YearFilter;

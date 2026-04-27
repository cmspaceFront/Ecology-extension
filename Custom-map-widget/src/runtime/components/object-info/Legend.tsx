/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useState, useEffect, useRef } from 'react';
import { useLocale } from './hooks/useLocale';
import { getColorsByType } from './utils/symbols';

interface LegendItem {
  type: number;
  color: [number, number, number, number];
  label: string;
}

const Legend = () => {
  const { t, locale } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);

  // Get legend items with colors and labels
  const legendItems: LegendItem[] = [
    {
      type: 0,
      color: getColorsByType(0).outlineColor,
      label: t('popup.fields.typeDescriptions.0')
    },
    {
      type: 1,
      color: getColorsByType(1).outlineColor,
      label: t('popup.fields.typeDescriptions.1')
    },
    {
      type: 2,
      color: getColorsByType(2).outlineColor,
      label: t('popup.fields.typeDescriptions.2')
    },
    {
      type: 3,
      color: getColorsByType(3).outlineColor,
      label: t('popup.fields.typeDescriptions.3')
    },
    {
      type: 4,
      color: getColorsByType(4).outlineColor,
      label: t('popup.fields.typeDescriptions.4')
    }
  ];

  // Close legend when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (legendRef.current && !legendRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  // Convert RGB array to CSS color string
  const getColorString = (color: [number, number, number, number]): string => {
    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  };

  return (
    <div className="legend-container" ref={legendRef}>
      <button
        className={`legend-toggle-btn ${isOpen ? 'legend-toggle-btn--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle legend"
        title={t('legend.title')}
      >
        <div className="legend-toggle-btn__icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M3 3H17V17H3V3Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 7H17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M7 3V17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M11 3V17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="legend-panel">
          <div className="legend-panel__header">
            <div className="legend-panel__header-content">
              <div className="legend-panel__header-icon">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M3 3H17V17H3V3Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 7H17"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="legend-panel__title">{t('legend.title')}</h3>
            </div>
            <div className="legend-panel__header-gradient"></div>
          </div>

          <div className="legend-panel__content">
            {legendItems.map((item) => (
              <div key={item.type} className="legend-item">
                <div className="legend-item__color">
                  <div
                    className="legend-item__color-box"
                    style={{
                      borderColor: getColorString(item.color),
                      backgroundColor: 'transparent',
                      borderWidth: '3px',
                      borderStyle: 'solid'
                    }}
                  />
                </div>
                <span className="legend-item__label">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Legend;

import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ExportModal.css';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocale: string;
}

interface DropdownOption {
  value: string;
  label: string;
}

// Translations for the export modal
const translations = {
  ru: {
    title: 'Экспорт данных',
    close: 'Закрыть',
    format: {
      label: 'Формат файла',
      csv: 'CSV',
      excel: 'Excel'
    },
    year: {
      label: 'Год',
      placeholder: 'Выберите год',
      all: 'Все годы'
    },
    region: {
      label: 'Регион',
      placeholder: 'Выберите регион',
      all: 'Вся Республика'
    },
    buttons: {
      cancel: 'Отменить',
      export: 'Экспортировать',
      exporting: 'Экспорт...'
    },
    result: {
      success: 'Данные успешно экспортированы!',
      error: 'Ошибка при экспорте данных',
      close: 'Закрыть'
    }
  },
  'uz-Cyrl': {
    title: 'Маълумотларни экспорт қилиш',
    close: 'Ёпиш',
    format: {
      label: 'Файл формати',
      csv: 'CSV',
      excel: 'Excel'
    },
    year: {
      label: 'Йил',
      placeholder: 'Йилни танланг',
      all: 'Барча йиллар'
    },
    region: {
      label: 'Ҳудуд',
      placeholder: 'Ҳудудни танланг',
      all: 'Бутун Республика'
    },
    buttons: {
      cancel: 'Бекор қилиш',
      export: 'Экспорт қилиш',
      exporting: 'Экспорт...'
    },
    result: {
      success: 'Маълумотлар муваффақиятли экспорт қилинди!',
      error: 'Маълумотларни экспорт қилишда хатолик',
      close: 'Ёпиш'
    }
  },
  'uz-Latn': {
    title: 'Ma\'lumotlarni eksport qilish',
    close: 'Yopish',
    format: {
      label: 'Fayl formati',
      csv: 'CSV',
      excel: 'Excel'
    },
    year: {
      label: 'Yil',
      placeholder: 'Yilni tanlang',
      all: 'Barcha yillar'
    },
    region: {
      label: 'Hudud',
      placeholder: 'Hududni tanlang',
      all: 'Butun Respublika'
    },
    buttons: {
      cancel: 'Bekor qilish',
      export: 'Eksport qilish',
      exporting: 'Eksport...'
    },
    result: {
      success: 'Ma\'lumotlar muvaffaqiyatli eksport qilindi!',
      error: 'Ma\'lumotlarni eksport qilishda xatolik',
      close: 'Yopish'
    }
  }
};

// Generate year options (from 2020 to current year)
const generateYearOptions = (locale: string): DropdownOption[] => {
  const currentYear = new Date().getFullYear();
  const allLabel = locale === 'ru' ? 'Все годы' : locale === 'uz-Cyrl' ? 'Барча йиллар' : 'Barcha yillar';
  const years: DropdownOption[] = [{ value: 'all', label: allLabel }];

  for (let year = currentYear; year >= 2020; year--) {
    years.push({ value: year.toString(), label: year.toString() });
  }

  return years;
};

// Region options with SOATO codes
const regionOptions: Record<string, DropdownOption[]> = {
  ru: [
    { value: 'all', label: 'Вся Республика' },
    { value: '1703', label: 'Республика Каракалпакстан' },
    { value: '1706', label: 'Андижанская область' },
    { value: '1708', label: 'Бухарская область' },
    { value: '1710', label: 'Джизакская область' },
    { value: '1712', label: 'Кашкадарьинская область' },
    { value: '1714', label: 'Навоийская область' },
    { value: '1718', label: 'Наманганская область' },
    { value: '1722', label: 'Самаркандская область' },
    { value: '1724', label: 'Сурхандарьинская область' },
    { value: '1726', label: 'Сырдарьинская область' },
    { value: '1727', label: 'Ташкентская область' },
    { value: '1730', label: 'Ферганская область' },
    { value: '1733', label: 'Хорезмская область' },
    { value: '1735', label: 'город Ташкент' }
  ],
  'uz-Cyrl': [
    { value: 'all', label: 'Бутун Республика' },
    { value: '1703', label: 'Қорақалпоғистон Республикаси' },
    { value: '1706', label: 'Андижон вилояти' },
    { value: '1708', label: 'Бухоро вилояти' },
    { value: '1710', label: 'Жиззах вилояти' },
    { value: '1712', label: 'Қашқадарё вилояти' },
    { value: '1714', label: 'Навоий вилояти' },
    { value: '1718', label: 'Наманган вилояти' },
    { value: '1722', label: 'Самарқанд вилояти' },
    { value: '1724', label: 'Сурхондарё вилояти' },
    { value: '1726', label: 'Сирдарё вилояти' },
    { value: '1727', label: 'Тошкент вилояти' },
    { value: '1730', label: 'Фарғона вилояти' },
    { value: '1733', label: 'Хоразм вилояти' },
    { value: '1735', label: 'Тошкент шаҳри' }
  ],
  'uz-Latn': [
    { value: 'all', label: 'Butun Respublika' },
    { value: '1703', label: 'Qoraqalpog\'iston Respublikasi' },
    { value: '1706', label: 'Andijon viloyati' },
    { value: '1708', label: 'Buxoro viloyati' },
    { value: '1710', label: 'Jizzax viloyati' },
    { value: '1712', label: 'Qashqadaryo viloyati' },
    { value: '1714', label: 'Navoiy viloyati' },
    { value: '1718', label: 'Namangan viloyati' },
    { value: '1722', label: 'Samarqand viloyati' },
    { value: '1724', label: 'Surxondaryo viloyati' },
    { value: '1726', label: 'Sirdaryo viloyati' },
    { value: '1727', label: 'Toshkent viloyati' },
    { value: '1730', label: 'Farg\'ona viloyati' },
    { value: '1733', label: 'Xorazm viloyati' },
    { value: '1735', label: 'Toshkent shahri' }
  ]
};

const API_BASE_URL = 'https://api-test.spacemc.uz';

// Custom Dropdown Component
interface CustomDropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({ options, value, onChange, placeholder, label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = selectedOption?.label || placeholder;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setIsOpen(false);
  };

  return (
    <div className="export-modal__field">
      <span className="export-modal__label">{label}</span>
      <div className={`export-modal__dropdown ${isOpen ? 'export-modal__dropdown--open' : ''}`} ref={dropdownRef}>
        <button
          type="button"
          className={`export-modal__dropdown-trigger ${isOpen ? 'export-modal__dropdown-trigger--open' : ''}`}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="export-modal__dropdown-value">{displayValue}</span>
          <svg
            className={`export-modal__dropdown-chevron ${isOpen ? 'export-modal__dropdown-chevron--open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M2.5 4.5L6 8L9.5 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {isOpen && (
          <div className="export-modal__dropdown-menu">
            <ul className="export-modal__dropdown-list" role="listbox">
              {options.map((option) => (
                <li
                  key={option.value}
                  className={`export-modal__dropdown-item ${value === option.value ? 'export-modal__dropdown-item--selected' : ''}`}
                  role="option"
                  aria-selected={value === option.value}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="export-modal__dropdown-item-text">{option.label}</span>
                  {value === option.value && (
                    <svg
                      className="export-modal__dropdown-check"
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M13.3333 4L6 11.3333L2.66667 8"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

const ExportModal = ({ isOpen, onClose, currentLocale }: ExportModalProps) => {
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'xlsx'>('csv');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [resultType, setResultType] = useState<'success' | 'error'>('success');
  const [resultMessage, setResultMessage] = useState('');

  const t = useMemo(() => translations[currentLocale as keyof typeof translations] || translations.ru, [currentLocale]);
  const years = useMemo(() => generateYearOptions(currentLocale), [currentLocale]);
  const regions = useMemo(() => regionOptions[currentLocale] || regionOptions.ru, [currentLocale]);

  // Get selected region from localStorage on mount
  useEffect(() => {
    if (isOpen) {
      try {
        const storedSoato = localStorage.getItem('selectedSoato');
        if (storedSoato && storedSoato !== 'all') {
          setSelectedRegion(storedSoato);
        } else {
          setSelectedRegion('all');
        }
      } catch {
        setSelectedRegion('all');
      }
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowResult(false);
      setIsExporting(false);
      setResultMessage('');
    }
  }, [isOpen]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setShowResult(false);

    try {
      const url = new URL(`${API_BASE_URL}/api/ecology/export`);

      // Add format parameter
      url.searchParams.append('format', selectedFormat);

      // Add year if not "all"
      if (selectedYear && selectedYear !== 'all') {
        url.searchParams.append('year', selectedYear);
      }

      // Add region if not "all"
      if (selectedRegion && selectedRegion !== 'all') {
        url.searchParams.append('region', selectedRegion);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'accept': 'application/octet-stream',
        },
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status} ${response.statusText}`);
      }

      // Get the blob from response
      const blob = await response.blob();

      // Create download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const fileExtension = selectedFormat === 'csv' ? 'csv' : 'xlsx';
      link.download = `ecology_export_${timestamp}.${fileExtension}`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setResultType('success');
      setResultMessage(t.result.success);
      setShowResult(true);
    } catch (error) {
      setResultType('error');
      setResultMessage(error instanceof Error ? error.message : t.result.error);
      setShowResult(true);
    } finally {
      setIsExporting(false);
    }
  }, [selectedFormat, selectedYear, selectedRegion, t]);

  // Create portal container
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      let container = document.getElementById('export-modal-portal');
      if (!container) {
        container = document.createElement('div');
        container.id = 'export-modal-portal';
        document.body.appendChild(container);
      }
      setPortalContainer(container);
    }

    return () => {
      if (typeof document !== 'undefined') {
        const container = document.getElementById('export-modal-portal');
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    };
  }, []);

  if (!isOpen || !portalContainer) return null;

  // Result modal content
  if (showResult) {
    const resultModalContent = (
      <div className="export-modal-overlay" role="dialog" aria-modal="true">
        <div className="export-modal export-modal--result">
          <div className="export-modal__result-content">
            <div className={`export-modal__result-icon ${resultType === 'success' ? 'export-modal__result-icon--success' : 'export-modal__result-icon--error'}`}>
              {resultType === 'success' ? (
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="24" fill="currentColor" fillOpacity="0.1" />
                  <path d="M16 24L22 30L32 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="24" fill="currentColor" fillOpacity="0.1" />
                  <path d="M18 18L30 30M30 18L18 30" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <p className="export-modal__result-message">{resultMessage}</p>
            <button
              type="button"
              className="export-modal__result-button"
              onClick={onClose}
            >
              {t.result.close}
            </button>
          </div>
        </div>
      </div>
    );

    return createPortal(resultModalContent, portalContainer);
  }

  const modalContent = (
    <div className="export-modal-overlay" role="dialog" aria-modal="true">
      <div className="export-modal export-modal--large">
        <div className="export-modal__header">
          <div className="export-modal__title">{t.title}</div>
          <button
            type="button"
            className="export-modal__close"
            aria-label={t.close}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="export-modal__body">
          {/* Format Selection */}
          <div className="export-modal__row">
            {/* <div className="export-modal__field">
              <span className="export-modal__label">{t.format.label}</span>
              <div className="export-modal__format-group">
                <button
                  type="button"
                  className={`export-modal__format-btn ${selectedFormat === 'csv' ? 'export-modal__format-btn--active' : ''}`}
                  onClick={() => setSelectedFormat('csv')}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 2H12L16 6V18H4V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M12 2V6H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t.format.csv}
                </button>
                <button
                  type="button"
                  className={`export-modal__format-btn ${selectedFormat === 'xlsx' ? 'export-modal__format-btn--active' : ''}`}
                  onClick={() => setSelectedFormat('xlsx')}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 2H12L16 6V18H4V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    <path d="M12 2V6H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="6" y="9" width="8" height="6" stroke="currentColor" strokeWidth="1" fill="none" />
                    <line x1="6" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="1" />
                    <line x1="6" y1="13" x2="14" y2="13" stroke="currentColor" strokeWidth="1" />
                    <line x1="10" y1="9" x2="10" y2="15" stroke="currentColor" strokeWidth="1" />
                  </svg>
                  {t.format.excel}
                </button>
              </div>
            </div> */}
          </div>

          {/* Year and Region in one row */}
          <div className="export-modal__row export-modal__row--half">
            <CustomDropdown
              options={years}
              value={selectedYear}
              onChange={setSelectedYear}
              placeholder={t.year.placeholder}
              label={t.year.label}
            />
            <CustomDropdown
              options={regions}
              value={selectedRegion}
              onChange={setSelectedRegion}
              placeholder={t.region.placeholder}
              label={t.region.label}
            />
          </div>
        </div>

        <div className="export-modal__footer">
          <button
            type="button"
            className="export-modal__cancel"
            onClick={onClose}
            disabled={isExporting}
          >
            {t.buttons.cancel}
          </button>
          <button
            type="button"
            className="export-modal__submit"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? t.buttons.exporting : t.buttons.export}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, portalContainer);
};

export default memo(ExportModal);

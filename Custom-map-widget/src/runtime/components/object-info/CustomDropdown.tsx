import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CustomDropdown.css';

interface CustomDropdownProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
  value,
  options,
  onChange,
  placeholder,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = value || placeholder || options[0] || '';

  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
    setHighlightedIndex(-1);
  }, []);

  const handleSelect = useCallback((option: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onChange(option);
    setIsOpen(false);
    setHighlightedIndex(-1);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < options.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : prev);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < options.length) {
          handleSelect(options[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [isOpen, highlightedIndex, options, handleSelect]);

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Прокрутка к выделенному элементу
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Установка начального выделения на выбранный элемент
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex(opt => opt === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, value, options]);

  return (
    <div
      ref={dropdownRef}
      className={`custom-dropdown ${className} ${isOpen ? 'custom-dropdown--open' : ''}`}
    >
      <button
        type="button"
        className="custom-dropdown__trigger"
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={selectedOption}
      >
        <span className={`custom-dropdown__value ${!value ? 'custom-dropdown__value--placeholder' : ''}`}>
          {selectedOption}
        </span>
        <svg
          className={`custom-dropdown__chevron ${isOpen ? 'custom-dropdown__chevron--open' : ''}`}
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
        <div className="custom-dropdown__options-wrapper">
          <ul
            ref={listRef}
            className="custom-dropdown__options"
            role="listbox"
          >
            {options.map((option, index) => {
              const isSelected = option === value;
              const isHighlighted = index === highlightedIndex;

              return (
                <li
                  key={option}
                  className={`custom-dropdown__option ${isSelected ? 'custom-dropdown__option--selected' : ''
                    } ${isHighlighted ? 'custom-dropdown__option--highlighted' : ''
                    }`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={(e) => handleSelect(option, e)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  {option}
                  {isSelected && (
                    <svg
                      className="custom-dropdown__check"
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
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default CustomDropdown;

import React, { useState, useEffect, useRef } from 'react';
import { jsx, LinkType, jimuHistory } from 'jimu-core';
import type { IMLinkParam } from 'jimu-core';

import { createPortal } from 'react-dom';
import './Header.css';
import globeIcon from '../assets/globe.svg';
import logoutIcon from '../assets/box-arrow-right.svg';

interface HeaderProps {
  logoUrl?: string;
  logoLinkParam?: IMLinkParam;
  currentLocale: string;
  onLocaleChange: (locale: string) => void;
}

const Header: React.FC<HeaderProps> = ({ logoUrl, logoLinkParam, currentLocale, onLocaleChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const [profileDropdownPosition, setProfileDropdownPosition] = useState<{ top: number; right: number } | null>(null);

  const getUserEmail = (): string => {
    try {
      const exbAuth = localStorage.getItem('exb_auth');
      if (exbAuth) {
        const authData = JSON.parse(exbAuth);
        return authData.email || '';
      }
    } catch (e) {
      console.error('Error parsing exb_auth:', e);
    }
    return '';
  };

  const userEmail = getUserEmail();

  const localeMap: Record<string, { value: string; label: string }> = {
    'uz-Latn': { value: 'uz-Latn', label: 'UZ' },
    'uz-Cyrl': { value: 'uz-Cyrl', label: 'УЗ' },
    'ru': { value: 'ru', label: 'РУ' }
  };

  const profileTranslations: Record<string, { account: string; logout: string }> = {
    'uz-Latn': { account: 'Hisob', logout: 'Hisobdan chiqish' },
    'uz-Cyrl': { account: 'Ҳисоб', logout: 'Ҳисобдан чиқиш' },
    'ru': { account: 'Аккаунт', logout: 'Выход из аккаунта' }
  };

  const getTranslation = (key: 'account' | 'logout'): string => {
    const translations = profileTranslations[currentLocale] || profileTranslations['ru'];
    return translations[key];
  };

  useEffect(() => {
    const checkLocale = () => {
      const stored = localStorage.getItem('customLocal');
      if (stored && (stored === 'uz-Latn' || stored === 'uz-Cyrl' || stored === 'ru')) {
        onLocaleChange(stored);
      }
    };

    checkLocale();
    const interval = setInterval(checkLocale, 500);

    return () => {
      clearInterval(interval);
    };
  }, [onLocaleChange]);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    } else {
      setDropdownPosition(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isProfileOpen && profileButtonRef.current) {
      const rect = profileButtonRef.current.getBoundingClientRect();
      setProfileDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    } else {
      setProfileDropdownPosition(null);
    }
  }, [isProfileOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node) &&
        profileButtonRef.current && !profileButtonRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLocaleChange = (locale: string) => {
    localStorage.setItem('customLocal', locale);
    onLocaleChange(locale);
    setIsOpen(false);
    window.dispatchEvent(new Event('storage'));
  };

  const handleLogout = () => {
    localStorage.removeItem('exb_auth');
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    window.location.href = '/';
  };

  const renderFlag = (locale: string) => {
    const flags: Record<string, string> = {
      'uz-Latn': '🇺🇿',
      'uz-Cyrl': '🇺🇿',
      'ru': '🇷🇺'
    };
    return flags[locale] || '🌐';
  };

  const openLink = (param?: IMLinkParam) => {
    if (!param || !param.linkType || param.linkType === LinkType.None) {
      return;
    }

    if (param.linkType === LinkType.Page && param.value) {
      const targetPage = param.value;
      const openType = param.openType || '_self';

      if (openType === '_blank') {
        const currentUrl = window.location.href.split('#')[0];
        const newUrl = `${currentUrl}page/${targetPage}/`;
        window.open(newUrl, '_blank');
      } else if (openType === '_top') {
        const currentUrl = window.top.location.href.split('#')[0];
        window.top.location.href = `${currentUrl}page/${targetPage}/`;
      } else {
        jimuHistory.changePage(targetPage);
      }
      return;
    }

    if (param.linkType === LinkType.WebAddress && param.value) {
      const openType = param.openType || '_self';
      window.open(param.value, openType);
    }
  };

  const handleLogoClick = () => {
    openLink(logoLinkParam);
  };

  return (
    <header className="ecological-header">
      <div className="ecological-header-logo">
        {logoUrl && (
          <button
            type="button"
            className="ecological-logo-button"
            onClick={handleLogoClick}
            aria-label="Go to logo link"
          >
            <img
              src={logoUrl}
              alt="Logo"
              className="ecological-logo-image"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </button>
        )}
      </div>
      <div className="ecological-header-right-actions">
        <div className="ecological-language-selector">
          <button
            ref={buttonRef}
            className={`ecological-language-toggle ${isOpen ? 'open' : ''}`}
            onClick={() => setIsOpen(!isOpen)}
          >
            <img src={globeIcon} alt="Language" className="ecological-icon" />
          </button>

          {isOpen && dropdownPosition && createPortal(
            <div className="ecological-dropdown-backdrop" onClick={() => setIsOpen(false)}>
              <div
                ref={dropdownRef}
                className="ecological-dropdown-menu"
                style={{
                  position: 'fixed',
                  top: `${dropdownPosition.top}px`,
                  right: `${dropdownPosition.right}px`
                }}
              >
                {Object.values(localeMap).map((locale) => (
                  <button
                    key={locale.value}
                    className={`ecological-dropdown-item ${currentLocale === locale.value ? 'active' : ''}`}
                    onClick={() => handleLocaleChange(locale.value)}
                  >
                    <span>{renderFlag(locale.value)}</span>
                    <span>{locale.label}</span>
                  </button>
                ))}
              </div>
            </div>,
            document.body
          )}
        </div>

        <div className="ecological-profile-selector">
          <button
            ref={profileButtonRef}
            className={`ecological-profile-toggle ${isProfileOpen ? 'open' : ''}`}
            onClick={() => setIsProfileOpen(!isProfileOpen)}
          >
            <img src={logoutIcon} alt="Logout" className="ecological-icon" />
          </button>

          {isProfileOpen && profileDropdownPosition && createPortal(
            <div className="ecological-dropdown-backdrop" onClick={() => setIsProfileOpen(false)}>
              <div
                ref={profileDropdownRef}
                className="ecological-dropdown-menu"
                style={{
                  position: 'fixed',
                  top: `${profileDropdownPosition.top}px`,
                  right: `${profileDropdownPosition.right}px`
                }}
              >
                <div className="ecological-profile-info">
                  <div className="ecological-profile-email">{userEmail || 'User'}</div>
                </div>
                <button className="ecological-dropdown-item" onClick={handleLogout}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6M10 11L14 7M14 7L10 3M14 7H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {getTranslation('logout')}
                </button>
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;


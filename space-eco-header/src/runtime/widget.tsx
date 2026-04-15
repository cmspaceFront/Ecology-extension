/** @jsx jsx */
import {
  React,
  jsx,
  type AllWidgetProps,
  LinkType,
  jimuHistory,
  getAppStore,
  loadArcGISJSAPIModules,
  SessionManager
} from "jimu-core";
import { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { getThemeColors, TYPE1_PRIMARY_FOR_BORDER_GLOW } from "./themeUtils";
import "./styles/widget.css";
import ExportModal from "./components/ExportModal";
import { type IMConfig } from "../config";

// Import translations
import translationsRu from "./translations/ru.json";
import translationsUzLatn from "./translations/uz-Latn.json";
import translationsUzCyrl from "./translations/uz-Cyrl.json";

// Translations map
const translations: Record<string, typeof translationsRu> = {
  'ru': translationsRu,
  'uz-Latn': translationsUzLatn,
  'uz-Cyrl': translationsUzCyrl
};

interface SuggestionItem {
  id: string;
  globalid?: string;
  gid?: string;
  displayText: string;
}

interface Notification {
  id: string;
  text: string;
  timestamp: string;
  type: 'sales' | 'user' | 'review' | 'issue' | 'thread' | 'comment' | 'support' | 'order';
  unread: boolean;
  // API fields
  entity?: string;
  action?: string;
  entity_id?: string;
  created_at?: string;
  message?: string;
  is_read?: boolean;
}

interface Video {
  id: string;
  titleKey: string; // Key for localized title
  thumbnail: string;
  youtubeId: string; // YouTube video ID
  duration: string;
  timestampKey: string; // Key for localized timestamp
}

interface File {
  id: string;
  nameKey: string; // Key for localized name
  type: string;
  size: string;
  url: string;
  timestampKey: string; // Key for localized timestamp
}

const SELECTED_ID_STORAGE_KEY = "selectedId";
const SEARCH_VALUE_STORAGE_KEY = "searchValue";

/** F5 / «Обновить» — не подставлять прошлый global id в поиск (localStorage чистим до первого рендера). */
function isFullPageReload(): boolean {
  try {
    const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (entry) {
      return entry.type === 'reload';
    }
    const legacy = (performance as unknown as { navigation?: { type?: number } }).navigation;
    return legacy?.type === 1;
  } catch {
    return false;
  }
}

function readInitialSearchValueFromStorage(): string {
  try {
    if (isFullPageReload()) {
      localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
      return '';
    }
    const stored = localStorage.getItem(SEARCH_VALUE_STORAGE_KEY);
    return stored && stored.trim() !== '' ? stored : '';
  } catch {
    return '';
  }
}

/** Время уведомлений — всегда в часовом поясе Узбекистана (не зависит от TZ браузера / «сирого» ISO без Z). */
const NOTIFICATION_TIMEZONE = 'Asia/Tashkent';

/**
 * API часто шлёт момент в UTC как `2026-04-03T06:11:00` без `Z`.
 * Тогда `new Date(...)` в браузере трактует это как *локальное* время → в Asia/Tashkent остаётся 06:11 вместо 11:11.
 * Если явной зоны нет — считаем строку UTC и парсим с суффиксом Z.
 */
function parseNotificationInstant(input: string): Date {
  const raw = input.trim();
  if (!raw) return new Date(NaN);

  if (/[zZ]$/.test(raw)) {
    return new Date(raw);
  }
  if (/[+-]\d{2}:\d{2}$/.test(raw) || /[+-]\d{4}$/.test(raw)) {
    return new Date(raw);
  }

  const m = raw.match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?)/
  );
  if (m) {
    return new Date(`${m[1]}T${m[2]}Z`);
  }

  return new Date(raw);
}

// Helper function to format timestamp — DD.MM.YYYY, HH:MM в Asia/Tashkent
const formatTimestamp = (dateString?: string, locale: string = 'ru'): string => {
  if (!dateString) {
    const justNowByLocale: Record<string, string> = {
      'ru': 'Только что',
      'uz-Latn': 'Hozir',
      'uz-Cyrl': 'Ҳозир'
    };
    return justNowByLocale[locale] || 'Just now';
  }

  try {
    const date =
      typeof dateString === 'string'
        ? parseNotificationInstant(dateString)
        : new Date(dateString);

    if (isNaN(date.getTime())) {
      return typeof dateString === 'string' ? dateString : String(dateString);
    }

    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: NOTIFICATION_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = fmt.formatToParts(date);
    const pick = (t: string) => parts.find((p) => p.type === t)?.value ?? '';

    const day = pick('day');
    const month = pick('month');
    const year = pick('year');
    const hour = pick('hour');
    const minute = pick('minute');

    return `${day}.${month}.${year}, ${hour}:${minute}`;
  } catch {
    return dateString;
  }
};

/**
 * Уведомления с API/WebSocket: message/title могут быть строкой или объектом { uz, ru, uzCryl, ... }.
 * React #31 — нельзя рендерить объект; выбираем строку под текущую локаль.
 */
function pickLocalizedString(raw: unknown, locale: string): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const get = (key: string): string | undefined => {
    const v = o[key];
    return typeof v === 'string' && v.trim() !== '' ? v : undefined;
  };
  const byLocale: Record<string, string[]> = {
    'uz-Latn': ['uz-Latn', 'uzLatn', 'uz', 'latin'],
    'uz-Cyrl': ['uz-Cyrl', 'uzCryl', 'uzCyrl', 'cyrl', 'uz_cyrl'],
    ru: ['ru', 'RU', 'rus']
  };
  for (const key of byLocale[locale] || ['ru']) {
    const s = get(key);
    if (s) return s;
  }
  for (const key of ['ru', 'uz', 'uzCryl', 'uzCyrl', 'uz-Latn', 'uz-Cyrl', 'en', 'qqr']) {
    const s = get(key);
    if (s) return s;
  }
  for (const v of Object.values(o)) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return undefined;
}

// Video data with YouTube IDs
const mockVideos: Video[] = [
  { id: 'v1', titleKey: 'v1', thumbnail: '', youtubeId: 'NGclZVsESgw', duration: '10:25', timestampKey: '2h' },
  { id: 'v2', titleKey: 'v2', thumbnail: '', youtubeId: 'MkZQ2ly2cYI', duration: '15:42', timestampKey: '5h' },
  { id: 'v3', titleKey: 'v3', thumbnail: '', youtubeId: 'iRbWnCyinGw', duration: '8:15', timestampKey: '1d' },
  { id: 'v4', titleKey: 'v4', thumbnail: '', youtubeId: 'zqyT8Lbweas', duration: '12:30', timestampKey: '2d' },
];

// Mock file data
const mockFiles: File[] = [
  { id: 'f1', nameKey: 'f1', type: 'PDF', size: '2.4 MB', url: '#', timestampKey: '1h' },
  { id: 'f2', nameKey: 'f2', type: 'Excel', size: '5.8 MB', url: '#', timestampKey: '3h' },
  { id: 'f3', nameKey: 'f3', type: 'JSON', size: '156 KB', url: '#', timestampKey: '6h' },
  { id: 'f4', nameKey: 'f4', type: 'Word', size: '1.2 MB', url: '#', timestampKey: '1d' },
  { id: 'f5', nameKey: 'f5', type: 'PowerPoint', size: '3.5 MB', url: '#', timestampKey: '2d' },
];

const SGM_PORTAL_ORIGIN = 'https://sgm.uzspace.uz';

function trimPortalRestSuffix(url: string): string {
  return String(url || '')
    .replace(/\/sharing\/rest\/?$/i, '')
    .replace(/\/$/, '');
}

function getPortalBaseUrlLogout(): string {
  try {
    const mainSession = SessionManager.getInstance().getMainSession() as { portal?: { toString?: () => string } };
    const portal = mainSession?.portal?.toString?.() || '';
    if (portal) return trimPortalRestSuffix(portal);
  } catch {
    // ignore
  }
  try {
    const state = getAppStore().getState() as {
      portalUrl?: string;
      appConfig?: { portalUrl?: string };
    };
    const portalUrl = state?.portalUrl || state?.appConfig?.portalUrl || '';
    if (portalUrl) return trimPortalRestSuffix(String(portalUrl));
  } catch {
    // ignore
  }
  const fromConfig = (window as unknown as { jimuConfig?: { portalUrl?: string } }).jimuConfig?.portalUrl || '';
  if (fromConfig) return trimPortalRestSuffix(String(fromConfig));
  return `${SGM_PORTAL_ORIGIN}/portal`;
}

function getOAuthClientIdLogout(): string {
  try {
    const state = getAppStore().getState() as { clientId?: string };
    if (state?.clientId && String(state.clientId).trim()) {
      return String(state.clientId).trim();
    }
  } catch {
    // ignore
  }
  return 'experienceBuilder';
}

function stripCookiesSgm(): void {
  const expires = 'Thu, 01 Jan 1970 00:00:00 GMT';
  const domains = ['sgm.uzspace.uz', '.sgm.uzspace.uz', '.uzspace.uz'];
  try {
    document.cookie.split(';').forEach((cookie) => {
      const [name] = cookie.trim().split('=');
      if (!name) return;
      document.cookie = `${name}=;expires=${expires};path=/`;
      domains.forEach((domain) => {
        document.cookie = `${name}=;expires=${expires};path=/;domain=${domain}`;
      });
    });
  } catch {
    // ignore
  }
}

/**
 * Портальный OAuth authorize (ExB). forceLogin — после signout запросить логин/пароль заново.
 * Сборка через URL/SearchParams (без «ломания» пути Tomcat).
 */
function buildSgmPortalExperienceReauthorizeUrl(opts?: { forceLogin?: boolean }): string {
  let fromRaw = '';
  try {
    fromRaw = window.top?.location?.href?.split('#')[0] || '';
  } catch {
    fromRaw = '';
  }
  if (!fromRaw) {
    fromRaw = window.location.href.split('#')[0];
  }

  const clientId = getOAuthClientIdLogout();
  const innerUrl = new URL(
    `${SGM_PORTAL_ORIGIN}/portal/apps/experiencebuilder/jimu-core/oauth-callback.html`
  );
  innerUrl.searchParams.set('clientId', clientId);
  innerUrl.searchParams.set('portal', `${SGM_PORTAL_ORIGIN}/portal/sharing/rest/`);
  innerUrl.searchParams.set('popup', 'false');
  innerUrl.searchParams.set('isInPortal', 'true');
  innerUrl.searchParams.set('isDevEdition', 'false');
  innerUrl.searchParams.set('isOutOfExb', 'false');
  innerUrl.searchParams.set('mountPath', '/portal/apps/experiencebuilder/');
  innerUrl.searchParams.set('fromUrl', fromRaw);

  const authorizeUrl = new URL(`${SGM_PORTAL_ORIGIN}/portal/sharing/rest/oauth2/authorize`);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('response_type', 'token');
  authorizeUrl.searchParams.set('expiration', '20160');
  authorizeUrl.searchParams.set('redirect_uri', innerUrl.toString());
  authorizeUrl.searchParams.set('state', 'experienceBuilder');
  authorizeUrl.searchParams.set('locale', '');
  authorizeUrl.searchParams.set('showSignupOption', 'true');
  authorizeUrl.searchParams.set('signupType', 'esri');
  authorizeUrl.searchParams.set('force_login', opts?.forceLogin ? 'true' : 'false');

  return authorizeUrl.href;
}

function buildPortalOAuthSignOutUrl(redirectAfterSignOut: string): string {
  const base = getPortalBaseUrlLogout();
  const clientId = getOAuthClientIdLogout();
  return `${base}/sharing/rest/oauth2/signout?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectAfterSignOut)}`;
}

function replaceTopOrSelf(url: string): void {
  try {
    const topWin = window.top;
    if (topWin && topWin !== window) {
      topWin.location.replace(url);
      return;
    }
  } catch {
    // cross-origin top
  }
  window.location.replace(url);
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const [searchValue, setSearchValue] = useState<string>(readInitialSearchValueFromStorage);
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isColorOpen, setIsColorOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<string>('ru');
  const [selectedColor, setSelectedColor] = useState<string>('type01');
  const [themeColors, setThemeColors] = useState(getThemeColors());
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isSearchInputFocused, setIsSearchInputFocused] = useState(false);
  /** -1: подсветка с клавиатуры не задана — Enter берёт первый suggest */
  const [suggestionHighlightIndex, setSuggestionHighlightIndex] = useState(-1);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsPage, setNotificationsPage] = useState(1);
  const [notificationsPageSize] = useState(10);
  const [notificationsTotal, setNotificationsTotal] = useState(0);
  const [notificationsTotalPages, setNotificationsTotalPages] = useState(0);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);
  const [wsConnectionStatus, setWsConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const colorDropdownRef = useRef<HTMLDivElement>(null);
  const notificationDropdownRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLFormElement>(null);
  const languageButtonRef = useRef<HTMLButtonElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const colorButtonRef = useRef<HTMLButtonElement>(null);
  const notificationButtonRef = useRef<HTMLButtonElement>(null);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const [languageDropdownPosition, setLanguageDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const [profileDropdownPosition, setProfileDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const [colorDropdownPosition, setColorDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const [notificationDropdownPosition, setNotificationDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const [categoryDropdownPosition, setCategoryDropdownPosition] = useState<{ top: number; right: number } | null>(null);
  const [suggestionsPosition, setSuggestionsPosition] = useState<{ top: number; left: number; width: number } | null>(null);

  // Название аккаунта из exb_auth (localStorage или sessionStorage), поле "email" (например "AdminAI")
  const getUserDisplayInfo = (): { displayName: string; initial: string } => {
    const readExbAuth = (raw: string | null): string => {
      if (!raw) return '';
      try {
        const authData = JSON.parse(raw);
        const name = (authData?.email ?? '').trim();
        return name;
      } catch (_) {
        return '';
      }
    };
    const fromLocal = readExbAuth(localStorage.getItem('exb_auth'));
    if (fromLocal) {
      return { displayName: fromLocal, initial: fromLocal.charAt(0).toUpperCase() || 'U' };
    }
    const fromSession = readExbAuth(sessionStorage.getItem('exb_auth'));
    if (fromSession) {
      return { displayName: fromSession, initial: fromSession.charAt(0).toUpperCase() || 'U' };
    }
    try {
      const state = getAppStore().getState() as { user?: { firstName?: string; lastName?: string; fullName?: string; username?: string; email?: string } };
      const u = state?.user;
      if (u?.firstName || u?.lastName) {
        const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
        const initial = (u.firstName?.charAt(0) || u.lastName?.charAt(0) || '').toUpperCase() || 'U';
        return { displayName: name, initial };
      }
      if (u?.fullName?.trim()) return { displayName: u.fullName.trim(), initial: u.fullName.trim().charAt(0).toUpperCase() || 'U' };
      if (u?.username?.trim()) return { displayName: u.username.trim(), initial: u.username.trim().charAt(0).toUpperCase() || 'U' };
      if (u?.email?.trim()) return { displayName: u.email.trim(), initial: u.email.trim().charAt(0).toUpperCase() || 'U' };
    } catch (_) {}
    return { displayName: '', initial: 'U' };
  };

  const userDisplayInfo = getUserDisplayInfo();
  const userInitial = userDisplayInfo.initial;

  // Theme options with names and gradients - type01 дефолт (чёрный / нейтральный акцент)
  const colorOptions = [
    { value: 'type01', label: 'Тема 0.1', gradient: '#000000' },
    { value: 'type1', label: 'Тема 1', gradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)' },
    { value: 'type2', label: 'Тема 2', gradient: 'linear-gradient(135deg, #0a4d68 0%, #0b6baa 50%, #0881a3 100%)' },

  ];

  // Legacy hex color to theme type mapping (for backward compatibility)
  const hexToThemeTypeMap: Record<string, string> = {
    '#000000': 'type01',
    '#19253b': 'type1',
    '#0b6baa': 'type2',
    '#63289e': 'type3',
    '#00888d': 'type4',
    '#793b05': 'type5',
    '#a0202c': 'type6',
    '#1e3a8a': 'type7',
    '#7c3aed': 'type8'
  };

  // Map locales to display labels
  const localeMap: Record<string, { value: string; label: string }> = {
    'uz-Latn': { value: 'uz-Latn', label: 'UZ' },
    'uz-Cyrl': { value: 'uz-Cyrl', label: 'УЗ' },
    'ru': { value: 'ru', label: 'РУ' }
  };

  // Translations for profile dropdown
  const profileTranslations: Record<string, { account: string; logout: string }> = {
    'uz-Latn': { account: 'Hisob', logout: 'Hisobdan chiqish' },
    'uz-Cyrl': { account: 'Ҳисоб', logout: 'Ҳисобдан чиқиш' },
    'ru': { account: 'Аккаунт', logout: 'Выход из аккаунта' }
  };

  // Translations for notifications
  const notificationTranslations: Record<string, {
    title: string;
    noNotifications: string;
    markAllRead: string;
    viewAll: string;
    settings: string;
    recordUpdated: string;
    recordCreated: string;
    prevPage: string;
    nextPage: string;
    pageOf: string;
    unreadCount: string;
  }> = {
    'uz-Latn': {
      title: 'Xabarnomalar',
      noNotifications: 'Xabarnomalar yo\'q',
      markAllRead: 'Barchasini o\'qilgan deb belgilash',
      viewAll: 'Barchasini ko\'rish',
      settings: 'Sozlamalar',
      recordUpdated: 'yangi qilindi',
      recordCreated: 'yaratildi',
      prevPage: 'Oldingi',
      nextPage: 'Keyingi',
      pageOf: '/',
      unreadCount: 'o\'qilmagan'
    },
    'uz-Cyrl': {
      title: 'Хабарномалар',
      noNotifications: 'Хабарномалар йўқ',
      markAllRead: 'Барчасини ўқилган деб белгилаш',
      viewAll: 'Барчасини кўриш',
      settings: 'Созламалар',
      recordUpdated: 'янги қилинди',
      recordCreated: 'яратилди',
      prevPage: 'Олдинги',
      nextPage: 'Кейинги',
      pageOf: '/',
      unreadCount: 'ўқилмаган'
    },
    'ru': {
      title: 'Уведомления',
      noNotifications: 'Нет уведомлений',
      markAllRead: 'Отметить все как прочитанные',
      viewAll: 'Просмотреть все',
      settings: 'Настройки',
      recordUpdated: 'обновлена',
      recordCreated: 'создана',
      prevPage: 'Назад',
      nextPage: 'Вперёд',
      pageOf: 'из',
      unreadCount: 'непрочитанных'
    }
  };

  const getTranslation = (key: 'account' | 'logout'): string => {
    const trans = profileTranslations[currentLocale] || profileTranslations['ru'];
    return trans[key];
  };

  // Get translations for Videos & Files section
  const getVideoFilesTranslations = () => {
    return translations[currentLocale] || translations['ru'];
  };

  // Get video title by key
  const getVideoTitle = (titleKey: string): string => {
    const t = getVideoFilesTranslations();
    return t.videos[titleKey as keyof typeof t.videos]?.title || titleKey;
  };

  // Get video timestamp text
  const getVideoTimestamp = (timestampKey: string): string => {
    const t = getVideoFilesTranslations();
    switch (timestampKey) {
      case '2h': return t.timeAgo.hoursAgo.replace('{n}', '2');
      case '5h': return t.timeAgo.hoursAgo.replace('{n}', '5');
      case '1d': return t.timeAgo.daysAgo.replace('{n}', '1');
      case '2d': return t.timeAgo.daysAgo.replace('{n}', '2');
      default: return timestampKey;
    }
  };

  // Get file name by key
  const getFileName = (fileKey: string): string => {
    const t = getVideoFilesTranslations();
    return t.files[fileKey as keyof typeof t.files]?.name || fileKey;
  };

  // Get file timestamp text
  const getFileTimestamp = (timestampKey: string): string => {
    const t = getVideoFilesTranslations();
    switch (timestampKey) {
      case '1h': return t.timeAgo.hoursAgo.replace('{n}', '1');
      case '3h': return t.timeAgo.hoursAgo.replace('{n}', '3');
      case '6h': return t.timeAgo.hoursAgo.replace('{n}', '6');
      case '1d': return t.timeAgo.daysAgo.replace('{n}', '1');
      case '2d': return t.timeAgo.daysAgo.replace('{n}', '2');
      default: return timestampKey;
    }
  };

  // Get current locale from localStorage
  useEffect(() => {
    const checkLocale = () => {
      const stored = localStorage.getItem('customLocal');
      if (stored && (stored === 'uz-Latn' || stored === 'uz-Cyrl' || stored === 'ru')) {
        setCurrentLocale(stored);
      } else {
        setCurrentLocale('ru');
      }
    };

    checkLocale();
    window.addEventListener('storage', checkLocale);
    const interval = setInterval(checkLocale, 500);

    return () => {
      window.removeEventListener('storage', checkLocale);
      clearInterval(interval);
    };
  }, []);

  // Get selected color from localStorage
  useEffect(() => {
    const storedColor = localStorage.getItem('selectedThemeColor');
    if (storedColor) {
      // Check if it's already a theme type
      if (colorOptions.some(c => c.value === storedColor)) {
        setSelectedColor(storedColor);
      }
      // Check if it's a legacy hex color and convert it
      else if (hexToThemeTypeMap[storedColor]) {
        const themeType = hexToThemeTypeMap[storedColor];
        setSelectedColor(themeType);
        // Migrate to theme type format
        localStorage.setItem('selectedThemeColor', themeType);
      }
      // Default to type01 if invalid
      else {
        setSelectedColor('type01');
        localStorage.setItem('selectedThemeColor', 'type01');
      }
    } else {
      setSelectedColor('type01');
      localStorage.setItem('selectedThemeColor', 'type01');
    }
  }, []);

  // Listen for theme changes
  useEffect(() => {
    const checkTheme = () => {
      try {
        const newColors = getThemeColors();
        setThemeColors(newColors);
      } catch (err) {
        // Ignore errors
      }
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

  // Calculate language dropdown position
  useEffect(() => {
    if (isLanguageOpen && languageButtonRef.current) {
      const rect = languageButtonRef.current.getBoundingClientRect();
      setLanguageDropdownPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    } else {
      setLanguageDropdownPosition(null);
    }
  }, [isLanguageOpen]);

  // Calculate profile dropdown position
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

  // Calculate color dropdown position
  useEffect(() => {
    if (isColorOpen && colorButtonRef.current) {
      const rect = colorButtonRef.current.getBoundingClientRect();
      // Position at far right of screen with margin, aligned with header
      setColorDropdownPosition({
        top: rect.bottom + 8,
        right: 24 // Fixed margin from right edge
      });
    } else {
      setColorDropdownPosition(null);
    }
  }, [isColorOpen]);

  // Calculate notification dropdown position
  useEffect(() => {
    if (isNotificationOpen && notificationButtonRef.current) {
      const rect = notificationButtonRef.current.getBoundingClientRect();
      // Position at far right of screen with margin, aligned with header
      setNotificationDropdownPosition({
        top: rect.bottom + 8,
        right: 24 // Fixed margin from right edge
      });
    } else {
      setNotificationDropdownPosition(null);
    }
  }, [isNotificationOpen]);

  // Calculate category dropdown position
  useEffect(() => {
    if (isCategoryOpen && categoryButtonRef.current) {
      const rect = categoryButtonRef.current.getBoundingClientRect();
      // Position at far right of screen with margin, aligned with header
      setCategoryDropdownPosition({
        top: rect.bottom + 8,
        right: 24 // Fixed margin from right edge
      });
    } else {
      setCategoryDropdownPosition(null);
    }
  }, [isCategoryOpen]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    if (!isLanguageOpen && !isProfileOpen && !isColorOpen && !isSuggestionsOpen && !isNotificationOpen && !isCategoryOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      if (isLanguageOpen &&
        languageDropdownRef.current &&
        !languageDropdownRef.current.contains(target) &&
        languageButtonRef.current &&
        !languageButtonRef.current.contains(target)
      ) {
        setIsLanguageOpen(false);
      }

      if (isProfileOpen &&
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(target) &&
        profileButtonRef.current &&
        !profileButtonRef.current.contains(target)
      ) {
        setIsProfileOpen(false);
      }

      if (isColorOpen &&
        colorDropdownRef.current &&
        !colorDropdownRef.current.contains(target) &&
        colorButtonRef.current &&
        !colorButtonRef.current.contains(target)
      ) {
        setIsColorOpen(false);
      }

      if (isNotificationOpen &&
        notificationDropdownRef.current &&
        !notificationDropdownRef.current.contains(target) &&
        notificationButtonRef.current &&
        !notificationButtonRef.current.contains(target)
      ) {
        setIsNotificationOpen(false);
      }

      if (isCategoryOpen &&
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(target) &&
        categoryButtonRef.current &&
        !categoryButtonRef.current.contains(target)
      ) {
        setIsCategoryOpen(false);
      }

      if (isSuggestionsOpen &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(target) &&
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target)
      ) {
        setIsSuggestionsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isLanguageOpen, isProfileOpen, isColorOpen, isSuggestionsOpen, isNotificationOpen, isCategoryOpen]);

  const handleLocaleChange = (locale: string) => {
    localStorage.setItem('customLocal', locale);
    setCurrentLocale(locale);
    setIsLanguageOpen(false);
    window.dispatchEvent(new Event('storage'));
  };

  const handleLogout = async () => {
    setIsProfileOpen(false);
    try {
      const [IdentityManager] = await loadArcGISJSAPIModules([
        'esri/identity/IdentityManager',
      ]);
      IdentityManager.destroyCredentials();
    } catch (_) {
      /* ignore */
    }

    try {
      localStorage.removeItem('exb_auth');
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      localStorage.removeItem('esriJSAPIOAuthData');
      localStorage.removeItem('arcgis_auth_origin');
    } catch (_) {
      /* ignore */
    }
    try {
      sessionStorage.clear();
    } catch (_) {
      /* ignore */
    }
    try {
      SessionManager.getInstance().signOut();
    } catch (_) {
      /* ignore */
    }
    try {
      const extra: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (/^(esri\.|arcgis|credential\.)/i.test(k)) {
          extra.push(k);
        }
      }
      extra.forEach((k) => localStorage.removeItem(k));
    } catch (_) {
      /* ignore */
    }

    stripCookiesSgm();

    const afterSignOut = buildSgmPortalExperienceReauthorizeUrl({ forceLogin: true });
    replaceTopOrSelf(buildPortalOAuthSignOutUrl(afterSignOut));
  };

  const handleLogoClick = () => {
    const { config } = props;
    const linkParam = config.linkParam;

    if (!linkParam || !linkParam.linkType || linkParam.linkType === LinkType.None) {
      return;
    }

    if (linkParam.linkType === LinkType.Page && linkParam.value) {
      const targetPage = linkParam.value;
      const openType = linkParam.openType || "_self";

      if (openType === "_blank") {
        const currentUrl = window.location.href.split('#')[0];
        const newUrl = `${currentUrl}page/${targetPage}/`;
        window.open(newUrl, '_blank');
      } else if (openType === "_top") {
        const currentUrl = window.top.location.href.split('#')[0];
        window.top.location.href = `${currentUrl}page/${targetPage}/`;
      } else {
        jimuHistory.changePage(targetPage);
      }
      return;
    }

    if (linkParam.linkType === LinkType.WebAddress && linkParam.value) {
      const openType = linkParam.openType || "_self";
      window.open(linkParam.value, openType);
    }
  };

  const currentLabel = localeMap[currentLocale]?.label || 'РУ';

  // Render flag based on locale
  const renderFlag = (locale: string) => {
    if (locale === 'uz-Latn' || locale === 'uz-Cyrl') {
      return (
        <svg
          className="language-flag-icon"
          width="20"
          height="14"
          viewBox="0 0 513 357.071"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          shapeRendering="geometricPrecision"
          textRendering="geometricPrecision"
          imageRendering="optimizeQuality"
        >
          <path fill="#1EB53A" fillRule="nonzero" d="M28.477.32h456.044c15.488 0 28.159 12.672 28.159 28.16v300.111c0 15.488-12.671 28.16-28.159 28.16H28.477c-15.486 0-28.157-12.672-28.157-28.16V28.48C.32 12.992 12.991.32 28.477.32z" />
          <path fill="#0099B5" fillRule="nonzero" d="M512.68 178.536H.32V28.48C.32 12.992 12.991.32 28.477.32h456.044c15.488 0 28.159 12.672 28.159 28.16v150.056z" />
          <path fill="#CE1126" fillRule="nonzero" d="M.32 114.377h512.36v128.317H.32z" />
          <path fill="#fff" fillRule="nonzero" d="M.32 121.505h512.36v114.06H.32z" />
          <path fill="#fff" d="M96.068 14.574c2.429 0 4.81.206 7.129.596-20.218 3.398-35.644 20.998-35.644 42.177 0 21.178 15.426 38.778 35.644 42.176-2.319.39-4.7.596-7.129.596-23.607 0-42.772-19.165-42.772-42.772 0-23.608 19.165-42.773 42.772-42.773zm94.1 68.437l-1.921 5.91h-6.216l5.029 3.654-1.92 5.911 5.028-3.654 5.028 3.654-1.921-5.911 5.029-3.654h-6.216l-1.92-5.91zm-39.247-18.743l1.921-5.911-5.028-3.654h6.215l1.92-5.911 1.921 5.911h6.216l-5.029 3.654 1.92 5.911-5.028-3.654-5.028 3.654zm0 34.218l1.92-5.911-5.028-3.654h6.215l1.921-5.911 1.92 5.911h6.216l-5.029 3.654 1.92 5.911-5.028-3.654-5.028 3.654zm-34.217 0l1.92-5.911-5.028-3.654h6.216l1.919-5.911 1.921 5.911h6.216l-5.029 3.654 1.92 5.911-5.027-3.654-5.028 3.654zM136.872 68.437l1.921-5.91-5.03-3.654h6.216l1.921-5.911 1.921 5.911h6.215l-5.029 3.654 1.921 5.90-5.028-3.653-5.028 3.653zm0 34.219l1.921-5.911-5.03-3.654h6.216l1.921-5.911 1.921 5.911h6.215l-5.029 3.654 1.921 5.911-5.028-3.654-5.028 3.654zm0 34.218l1.921-5.911-5.03-3.654h6.216l1.921-5.91 1.921 5.90h6.215l-5.029 3.654 1.921 5.911-5.028-3.654-5.028 3.654zm-34.218-68.437l1.92-5.90-5.029-3.654h6.216l1.921-5.911 1.92 5.911h6.216l-5.029 3.654 1.92 5.90-5.027-3.653-5.028 3.653zm0 34.219l1.92-5.911-5.029-3.654h6.216l1.921-5.911 1.92 5.911h6.216l-5.029 3.654 1.92 5.911-5.027-3.654-5.028 3.654zm0 34.218l1.92-5.911-5.029-3.654h6.216l1.921-5.90 1.92 5.90h6.216l-5.029 3.654 1.92 5.911-5.027-3.654-5.028 3.654zM185.14 30.049l1.92-5.90-5.029-3.654h6.216l1.921-5.911 1.92 5.911h6.216l-5.029 3.654 1.921 5.90-5.028-3.653-5.028 3.653zm0 34.219l1.92-5.911-5.029-3.654h6.216l1.921-5.911 1.92 5.911h6.216l-5.029 3.654 1.921 5.911-5.028-3.654-5.028 3.654z" />
          <path fill="#CCC" fillRule="nonzero" d="M28.48 0h456.04c7.833 0 14.953 3.204 20.115 8.365C509.796 13.527 513 20.647 513 28.479v300.112c0 7.832-3.204 14.953-8.365 20.115-5.162 5.161-12.282 8.365-20.115 8.365H28.48c-7.833 0-14.953-3.204-20.115-8.365C3.204 343.544 0 336.423 0 328.591V28.479c0-7.832 3.204-14.952 8.365-20.114C13.527 3.204 20.647 0 28.48 0zm456.04.641H28.48c-7.656 0-14.616 3.132-19.661 8.178C3.773 13.864.641 20.824.641 28.479v300.112c0 7.656 3.132 14.616 8.178 19.661 5.045 5.046 12.005 8.178 19.661 8.178h456.04c7.656 0 14.616-3.132 19.661-8.178 5.046-5.045 8.178-12.005 8.178-19.661V28.479c0-7.655-3.132-14.615-8.178-19.66C499.136 3.773 492.176.641 484.52.641z" />
        </svg>
      );
    } else if (locale === 'ru') {
      return (
        <svg
          className="language-flag-icon"
          width="20"
          height="15"
          viewBox="0 0 20 15"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="20" height="5" fill="#FFFFFF" />
          <rect y="5" width="20" height="5" fill="#0039A6" />
          <rect y="10" width="20" height="5" fill="#D52B1E" />
        </svg>
      );
    }
    return null;
  };

  // Get token from localStorage or config
  const getToken = () => {
    try {
      const tokenFromStorage = localStorage.getItem('authToken') || localStorage.getItem('token');
      return tokenFromStorage || '';
    } catch (e) {
      return '';
    }
  };

  const [token, setToken] = useState<string | null>(getToken());
  const [region, setRegion] = useState<string>(() => {
    try {
      // If nothing selected, keep empty string (means: no region filter)
      return localStorage.getItem('selectedSoato') || '';
    } catch {
      return '';
    }
  });

  // Monitor token changes in localStorage
  useEffect(() => {
    const checkToken = () => {
      const newToken = getToken();
      if (newToken !== token) {
        setToken(newToken);
      }
    };

    // Check immediately
    checkToken();

    // Check periodically
    const tokenInterval = setInterval(checkToken, 1000);

    // Listen for storage events (cross-tab token changes)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'authToken' || event.key === 'token') {
        checkToken();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(tokenInterval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [token]);

  // Clear selectedId on mount if region changed (page refresh)
  useEffect(() => {
    try {
      const currentRegion = localStorage.getItem('selectedSoato') || '';
      const savedRegionForId = localStorage.getItem('selectedIdRegion');

      // If region changed or no saved region, remove selectedId and header search text
      if (savedRegionForId !== currentRegion) {
        localStorage.removeItem(SELECTED_ID_STORAGE_KEY);
        localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
        setSearchValue('');
        setSuggestions([]);
        setSuggestionHighlightIndex(-1);
        setIsSuggestionsOpen(false);
      }

      // Save current region for future checks
      localStorage.setItem('selectedIdRegion', currentRegion);
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Monitor notifications state changes
  useEffect(() => {
    void notifications;
  }, [notifications]);

  // Paginated API response type
  interface NotificationsAPIResult {
    items: Notification[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  }

  // Function to fetch notifications from REST API with pagination
  const fetchNotificationsFromAPI = useCallback(async (
    page: number = 1,
    page_size: number = 10,
    onlyUnread: boolean = false
  ): Promise<NotificationsAPIResult> => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('page_size', String(page_size));
      if (onlyUnread) params.set('unread', 'true');
      const url = `https://api-test.spacemc.uz/notifications?${params.toString()}`;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // Add authorization header only if token is available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch notifications: ${response.status} ${response.statusText}: ${errorText}`);
      }

      const data = await response.json();
      // Support both paginated response { items, total, page, page_size, total_pages } and legacy array
      const rawItems = data.items ?? (Array.isArray(data) ? data : []);
      const total = data.total ?? rawItems.length;
      const total_pages = data.total_pages ?? Math.max(1, Math.ceil(total / (data.page_size ?? page_size)));
      const currentPage = data.page ?? page;

      // Map API notifications to our Notification interface
      const mappedNotifications: Notification[] = rawItems.map((notif: any) => {
        const translations = notificationTranslations[currentLocale] || notificationTranslations['ru'];
        const entityTranslations: Record<string, Record<string, string>> = {
          'ru': { ecology: 'Экология' },
          'uz-Latn': { ecology: 'Ekologiya' },
          'uz-Cyrl': { ecology: 'Экология' }
        };

        const entityName = entityTranslations[currentLocale]?.[notif.entity] || notif.entity;
        const actionText = notif.action === 'updated' ? translations.recordUpdated :
          notif.action === 'created' ? translations.recordCreated : notif.action;

        const recordText: Record<string, string> = {
          'ru': 'Запись',
          'uz-Latn': 'Yozuv',
          'uz-Cyrl': 'Ёзув'
        };

        const wasText: Record<string, string> = {
          'ru': 'была',
          'uz-Latn': 'edi',
          'uz-Cyrl': 'эди'
        };

        // Use message from API if available, otherwise construct from entity/action
        const notificationText =
          pickLocalizedString(notif.message, currentLocale) ||
          `${recordText[currentLocale] || 'Запись'} ${entityName} #${notif.entity_id || notif.id} ${wasText[currentLocale] || 'была'} ${actionText}`;

        return {
          id: notif.id || `api-${Date.now()}-${Math.random()}`,
          text: notificationText,
          timestamp: formatTimestamp(notif.created_at, currentLocale),
          type: 'support',
          unread: notif.is_read === false, // Use is_read from API
          // Store API fields for reference
          entity: notif.entity,
          action: notif.action,
          entity_id: notif.entity_id,
          created_at: notif.created_at,
          message: pickLocalizedString(notif.message, currentLocale),
          is_read: notif.is_read === true, // Convert to boolean (API returns boolean)
        };
      });

      return {
        items: mappedNotifications,
        total,
        page: currentPage,
        page_size: data.page_size ?? page_size,
        total_pages
      };
    } catch (error) {
      return { items: [], total: 0, page: 1, page_size, total_pages: 0 };
    }
  }, [token, currentLocale]);

  // Load a specific page of notifications (for pagination)
  const loadNotificationsPage = useCallback(async (page: number) => {
    setIsLoadingNotifications(true);
    try {
      const result = await fetchNotificationsFromAPI(page, notificationsPageSize, false);
      setNotifications(result.items);
      setNotificationsPage(result.page);
      setNotificationsTotal(result.total);
      setNotificationsTotalPages(result.total_pages);
    } finally {
      setIsLoadingNotifications(false);
    }
  }, [fetchNotificationsFromAPI, notificationsPageSize]);

  // Load notifications from REST API on mount and periodically (page 1)
  useEffect(() => {
    const loadNotifications = async () => {
      const result = await fetchNotificationsFromAPI(1, notificationsPageSize, false);
      setNotifications(result.items);
      setNotificationsPage(result.page);
      setNotificationsTotal(result.total);
      setNotificationsTotalPages(result.total_pages);
    };
    loadNotifications();

    // Set up periodic refresh every 30 seconds (refresh page 1)
    const refreshInterval = setInterval(() => {
      loadNotifications();
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, [token, currentLocale, fetchNotificationsFromAPI, notificationsPageSize]);

  // WebSocket connection for notifications
  useEffect(() => {
    // Don't connect if we don't have a token
    if (!token) {
      setWsConnectionStatus('disconnected');
      return;
    }

    const connectWebSocket = () => {
      try {
        // Close existing connection if any
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.close();
        }

        // Build WebSocket URL with token as query parameter
        const wsUrl = new URL('wss://api-test.spacemc.uz/api/ws/notifications');
        if (token) {
          wsUrl.searchParams.append('token', token);
        }
        setWsConnectionStatus('connecting');
        const ws = new WebSocket(wsUrl.toString());

        ws.onopen = () => {
          setWsConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;

          // Test sending a message to verify connection works
          try {
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          } catch (err) {
            void err;
          }

          // Send authentication message if needed (some servers require this)
          // if (token) {
          //   try {
          //     ws.send(JSON.stringify({ type: 'auth', token }));
          //   } catch (err) {
          //     console.warn('WebSocket: Failed to send auth message:', err);
          //   }
          // }
        };

        // Set onmessage handler
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // Handle different message types
            if (data.type === 'notification' || data.notification) {
              const notificationData = data.notification || data;

              // Map API notification to our Notification interface
              const notification: Notification = {
                id: notificationData.id || notificationData._id || `ws-notif-${Date.now()}-${Math.random()}`,
                text:
                  pickLocalizedString(notificationData.text, currentLocale) ||
                  pickLocalizedString(notificationData.message, currentLocale) ||
                  pickLocalizedString(notificationData.title, currentLocale) ||
                  'New notification',
                timestamp: formatTimestamp(notificationData.timestamp || notificationData.created_at || notificationData.date, currentLocale),
                type: notificationData.type || 'support',
                unread: notificationData.is_read === false, // Use is_read from API
                // Store API fields for reference
                entity: notificationData.entity,
                action: notificationData.action,
                entity_id: notificationData.entity_id,
                created_at: notificationData.created_at || notificationData.timestamp,
                message: pickLocalizedString(notificationData.message, currentLocale),
                is_read: notificationData.is_read === true, // Convert to boolean
              };
              // Add new notification, avoiding duplicates
              setNotifications(prev => {
                // Check for duplicates by id
                const isDuplicate = prev.some(n => n.id === notification.id);
                if (isDuplicate) {
                  return prev;
                }
                // Add new notification and sort by created_at descending
                const newNotifications = [notification, ...prev].sort((a, b) => {
                  const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                  const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                  return timeB - timeA;
                });
                return newNotifications;
              });
            } else if (data.type === 'notifications' && Array.isArray(data.notifications)) {
              // Handle bulk notifications update
              const mappedNotifications: Notification[] = data.notifications.map((notif: any) => ({
                id: notif.id || notif._id || `notif-${Date.now()}-${Math.random()}`,
                text:
                  pickLocalizedString(notif.text, currentLocale) ||
                  pickLocalizedString(notif.message, currentLocale) ||
                  pickLocalizedString(notif.title, currentLocale) ||
                  'New notification',
                timestamp: formatTimestamp(notif.timestamp || notif.created_at || notif.date, currentLocale),
                type: notif.type || 'support',
                unread: notif.unread !== false
              }));
              setNotifications(mappedNotifications);
            } else if (data.type === 'notification_update') {
              // Handle notification update (e.g., mark as read)
              const notificationId = data.id || data.notification_id;
              setNotifications(prev =>
                prev.map(notif =>
                  notif.id === notificationId
                    ? { ...notif, unread: data.unread !== false }
                    : notif
                )
              );
            } else if (data.entity && data.action) {
              // Handle ecology/entity update messages (API format)

              const translations = notificationTranslations[currentLocale] || notificationTranslations['ru'];
              const entityTranslations: Record<string, Record<string, string>> = {
                'ru': { ecology: 'Экология' },
                'uz-Latn': { ecology: 'Ekologiya' },
                'uz-Cyrl': { ecology: 'Экология' }
              };

              const entityName = entityTranslations[currentLocale]?.[data.entity] || data.entity;
              const actionText = data.action === 'updated' ? translations.recordUpdated :
                data.action === 'created' ? translations.recordCreated : data.action;
              const entityId = data.entity_id || data.gid || data.id || 'unknown';

              const recordText: Record<string, string> = {
                'ru': 'Запись',
                'uz-Latn': 'Yozuv',
                'uz-Cyrl': 'Ёзув'
              };

              const wasText: Record<string, string> = {
                'ru': 'была',
                'uz-Latn': 'edi',
                'uz-Cyrl': 'эди'
              };

              // Use message from API if available, otherwise construct from entity/action
              const notificationText =
                pickLocalizedString(data.message, currentLocale) ||
                `${recordText[currentLocale] || 'Запись'} ${entityName} #${entityId} ${wasText[currentLocale] || 'была'} ${actionText}`;

              const notification: Notification = {
                id: data.id || `ws-entity-${data.entity}-${entityId}-${Date.now()}`,
                text: notificationText,
                timestamp: formatTimestamp(data.created_at || data.timestamp, currentLocale),
                type: 'support',
                unread: data.is_read === false, // Use is_read from API
                // Store API fields for reference
                entity: data.entity,
                action: data.action,
                entity_id: data.entity_id || entityId,
                created_at: data.created_at || data.timestamp,
                message: pickLocalizedString(data.message, currentLocale),
                is_read: data.is_read === true, // Convert to boolean
              };

              setNotifications(prev => {
                // Check for duplicates by id (from API) or by entity+entity_id+created_at
                const isDuplicate = prev.some(n => {
                  // Check by API id first
                  if (notification.id && n.id === notification.id) {
                    return true;
                  }
                  // Check by entity+entity_id+created_at combination
                  if (n.entity === notification.entity &&
                    n.entity_id === notification.entity_id &&
                    n.created_at === notification.created_at) {
                    return true;
                  }
                  return false;
                });

                if (isDuplicate) {
                  return prev;
                }

                // Add new notification and sort by created_at descending
                const newNotifications = [notification, ...prev].sort((a, b) => {
                  const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
                  const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
                  return timeB - timeA;
                });
                return newNotifications;
              });

              console.warn('WebSocket: Notification added to state');
            } else if (data.text || data.message || data.title) {
              // Handle any other data format - try to extract notification info
              const notification: Notification = {
                id: data.id || data._id || `notif-${Date.now()}-${Math.random()}`,
                text:
                  pickLocalizedString(data.text, currentLocale) ||
                  pickLocalizedString(data.message, currentLocale) ||
                  pickLocalizedString(data.title, currentLocale) ||
                  'New notification',
                timestamp: formatTimestamp(data.timestamp || data.created_at || data.date, currentLocale),
                type: data.type || 'support',
                unread: data.unread !== false
              };
              setNotifications(prev => [notification, ...prev]);
            }
          } catch (error) {
            void error;
          }
        };

        ws.onerror = (error) => {
          void error;
          setWsConnectionStatus('error');
        };

        ws.onclose = (event) => {
          // Clear the periodic check interval
          if ((ws as any)._checkInterval) {
            clearInterval((ws as any)._checkInterval);
          }

          wsRef.current = null;

          // Attempt to reconnect if not a normal closure and we haven't exceeded max attempts
          if (event.code !== 1000 && event.code !== 1001) {
            const maxAttempts = 3; // Reduced to 3 attempts
            const baseDelay = 3000; // Start with 3 seconds

            if (reconnectAttemptsRef.current < maxAttempts) {
              const delay = baseDelay * Math.pow(2, reconnectAttemptsRef.current);
              reconnectAttemptsRef.current++;

              setWsConnectionStatus('connecting');

              reconnectTimeoutRef.current = setTimeout(() => {
                connectWebSocket();
              }, delay);
            } else {
              setWsConnectionStatus('error');
            }
          } else {
            setWsConnectionStatus('disconnected');
          }
        };

        wsRef.current = ws;
      } catch (error) {
        void error;
        setWsConnectionStatus('error');
      }
    };

    // Small delay before connecting to ensure token is available
    const connectTimeout = setTimeout(() => {
      connectWebSocket();
    }, 500);

    // Cleanup on unmount
    return () => {
      clearTimeout(connectTimeout);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        try {
          // Clear the periodic check interval
          if ((wsRef.current as any)._checkInterval) {
            clearInterval((wsRef.current as any)._checkInterval);
          }
          wsRef.current.close();
        } catch (e) {
          // Ignore errors during cleanup
        }
        wsRef.current = null;
      }
    };
  }, [token]);

  // Listen for region changes in localStorage
  useEffect(() => {
    const checkRegionChange = () => {
      try {
        const currentRegion = localStorage.getItem('selectedSoato') || '';
        if (currentRegion !== region) {
          localStorage.removeItem(SELECTED_ID_STORAGE_KEY);
          localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
          localStorage.removeItem('selectedIdRegion');
          window.dispatchEvent(new CustomEvent('localStorageChange', {
            detail: { key: SELECTED_ID_STORAGE_KEY, value: null }
          }));
          setSearchValue('');
          setSuggestions([]);
          setSuggestionHighlightIndex(-1);
          setIsSuggestionsOpen(false);
          setRegion(currentRegion);
        }
      } catch {
        // Ignore storage errors
      }
    };

    checkRegionChange();
    const intervalId = setInterval(checkRegionChange, 1000);

    // Listen for storage events (cross-tab region changes)
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'selectedSoato') {
        try {
          localStorage.removeItem(SELECTED_ID_STORAGE_KEY);
          localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
          localStorage.removeItem('selectedIdRegion');
          window.dispatchEvent(new CustomEvent('localStorageChange', {
            detail: { key: SELECTED_ID_STORAGE_KEY, value: null }
          }));
          setSearchValue('');
          setSuggestions([]);
          setSuggestionHighlightIndex(-1);
          setIsSuggestionsOpen(false);
          setRegion(
            event.newValue != null ? event.newValue : localStorage.getItem('selectedSoato') || ''
          );
        } catch {
          // Ignore storage errors
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [region]);

  // Fetch suggestions from API
  useEffect(() => {
    // Only fetch if we have a search value
    if (!searchValue || searchValue.trim().length < 1) {
      setSuggestions([]);
      setIsSuggestionsOpen(false);
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoadingSuggestions(true);
      try {
        let storedSoato = '';
        let selectedYear = '';
        try {
          storedSoato = localStorage.getItem('selectedSoato') || '';
          selectedYear = localStorage.getItem('selectedYear') || '';
        } catch {
          storedSoato = '';
          selectedYear = '';
        }
        const currentSoato = region || storedSoato;
        const apiBaseUrl = 'https://api-test.spacemc.uz';
        const url = new URL(`${apiBaseUrl}/api/ecology/`);
        
        // Add year parameter - required for API to return data
        // Default to 2025 if no year is selected
        const yearToUse = selectedYear && selectedYear.trim() !== '' ? selectedYear.trim() : '2025';
        url.searchParams.append('year', yearToUse);
        
        // Apply SOATO filter based on code length:
        // - 4 digits = region (e.g., 1726)
        // - 7 digits = district (e.g., 1726262)
        if (currentSoato && currentSoato.trim() !== '') {
          const soatoCode = currentSoato.trim();
          const soatoLength = soatoCode.length;
          
          if (soatoLength === 4) {
            // 4-digit code = region
            url.searchParams.append('region', soatoCode);
          } else if (soatoLength === 7) {
            // 7-digit code = district
            url.searchParams.append('district', soatoCode);
          }
          // If length is neither 4 nor 7, don't add any filter
        }
        // If no SOATO selected, don't add region/district parameter - API will return all records for the year
        
        url.searchParams.append('offset', '0');
        // Без limit бэкенд отдаёт мало записей (~200); таблица мониторинга запрашивает 5000 — иначе поиск по globalid не находит объекты вне первой страницы
        url.searchParams.append('limit', '5000');

        const headers: HeadersInit = {
          'Content-Type': 'application/json',
          'accept': 'application/json'
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const requestUrl = url.toString();

        const response = await fetch(requestUrl, { headers });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const apiResponse = await response.json();
        const data = apiResponse.data || [];

        const soatoLabel = currentSoato && currentSoato.trim() !== '' 
          ? `${currentSoato.trim()} (${currentSoato.trim().length === 4 ? 'region' : currentSoato.trim().length === 7 ? 'district' : 'unknown'})` 
          : 'ALL (no filter)';

        // Filter and transform suggestions based on search value
        const searchTrimmed = searchValue.trim();
        // Normalize input for GUID search:
        // - fix Cyrillic/Latin lookalike letters (e.g. "С" -> "C")
        // - keep only hex chars for GUID matching
        const homoglyphMap: Record<string, string> = {
          'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y',
          'а': 'a', 'в': 'b', 'е': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'х': 'x', 'у': 'y'
        };
        const toLatinHomoglyphs = (v: string) => v.replace(/[АВЕКМНОРСТХУавекмнорстху]/g, (ch) => homoglyphMap[ch] ?? ch);

        const searchLower = toLatinHomoglyphs(searchTrimmed).toLowerCase();
        const searchNormalized = searchLower.replace(/[^0-9a-f]/g, '');
        // Также пробуем найти как число, если поиск состоит только из цифр
        const searchAsNumber = searchNormalized.match(/^\d+$/) ? parseInt(searchNormalized, 10) : null;

        const textMatchesSearch = (raw: string): boolean => {
          if (!raw) return false;
          const lower = toLatinHomoglyphs(raw).toLowerCase();
          const normalized = lower.replace(/[^0-9a-f]/g, '');
          const matchesNormalized =
            searchNormalized.length > 0 && normalized.includes(searchNormalized);
          const matchesOriginal = lower.includes(searchLower);
          const idWithoutBraces = lower.replace(/[{}]/g, '');
          const searchWithoutBraces = searchLower.replace(/[{}]/g, '');
          const matchesWithoutBraces = idWithoutBraces.includes(searchWithoutBraces);
          return matchesNormalized || matchesOriginal || matchesWithoutBraces;
        };

        const filteredSuggestions: SuggestionItem[] = data
          .filter((item: any) => {
            const globalid = item.globalid ? String(item.globalid) : '';
            const uniqueId = item.unique_id ? String(item.unique_id) : '';
            if (!globalid && !uniqueId) return false;

            if (textMatchesSearch(globalid) || textMatchesSearch(uniqueId)) {
              return true;
            }

            if (searchAsNumber !== null) {
              const gidAsNumber = item.gid != null ? Number(item.gid) : null;
              const globalidAsNumber = item.globalid ? Number(item.globalid) : null;
              const gNorm = globalid
                ? toLatinHomoglyphs(globalid).toLowerCase().replace(/[^0-9a-f]/g, '')
                : '';
              const uNorm = uniqueId
                ? toLatinHomoglyphs(uniqueId).toLowerCase().replace(/[^0-9a-f]/g, '')
                : '';
              return (
                (gidAsNumber !== null && String(gidAsNumber).includes(String(searchAsNumber))) ||
                (globalidAsNumber !== null &&
                  String(globalidAsNumber).includes(String(searchAsNumber))) ||
                gNorm.includes(String(searchAsNumber)) ||
                uNorm.includes(String(searchAsNumber))
              );
            }

            return false;
          })
          .slice(0, 10) // Limit to 10 suggestions for display
          .map((item: any) => {
            const globalid = item.globalid ? String(item.globalid) : '';
            const uniqueId = item.unique_id ? String(item.unique_id) : '';
            const gid = item.gid != null ? String(item.gid) : '';
            // Selection id must be unique_id (for map zoom).
            // If unique_id is missing, fallback to globalid, then {gid}.
            const selectionId = uniqueId || globalid || (gid ? `{${gid}}` : '');
            // Display in header should be globalid
            const displayText = globalid || uniqueId || (gid ? `{${gid}}` : '');

            return {
              id: selectionId,
              globalid: globalid,
              gid: gid,
              displayText: displayText
            };
          });

        setSuggestions(filteredSuggestions);
        // Keep dropdown open if there's search text, even if no results found
        // Only close dropdown when search field is empty
        if (searchValue.trim().length > 0) {
          setIsSuggestionsOpen(true);
        } else {
          setIsSuggestionsOpen(false);
        }
      } catch (err) {
        void err;
        setSuggestions([]);
        // Keep dropdown open on error if there's search text
        if (searchValue.trim().length > 0) {
          setIsSuggestionsOpen(true);
        } else {
          setIsSuggestionsOpen(false);
        }
      } finally {
        setIsLoadingSuggestions(false);
      }
    };

    // Debounce API calls
    const timeoutId = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [searchValue, token, region, isSearchInputFocused]);

  // Calculate suggestions dropdown position
  useEffect(() => {
    const calculatePosition = () => {
      if (searchContainerRef.current) {
        const rect = searchContainerRef.current.getBoundingClientRect();
        // Use the actual width of the search bar container
        const searchBarWidth = searchContainerRef.current.offsetWidth || rect.width;
        // Align dropdown exactly with search bar - same left edge and width
        const viewportWidth = window.innerWidth;
        const padding = 16; // Minimum padding from viewport edges
        
        // Responsive max-width based on viewport size
        let cssMaxWidth = 500; // Default max-width
        if (viewportWidth <= 1440 && viewportWidth > 1400) {
          cssMaxWidth = 460; // Match 1440px breakpoint
        } else if (viewportWidth <= 1400 && viewportWidth > 1024) {
          cssMaxWidth = 500; // Keep original size at 1400px
        } else if (viewportWidth <= 1024 && viewportWidth > 768) {
          cssMaxWidth = 280; // Smaller at 1024px
        } else if (viewportWidth <= 768) {
          cssMaxWidth = 350;
        } else if (viewportWidth <= 480) {
          cssMaxWidth = viewportWidth - (padding * 2);
        }
        
        // Use exact search bar width - match it perfectly
        // At 1440px, ensure dropdown matches search bar exactly
        const dropdownWidth = searchBarWidth;
        
        // Align dropdown left edge exactly with search bar container left edge
        let dropdownLeft = rect.left;
        
        // Ensure dropdown doesn't overflow viewport on the right
        if (dropdownLeft + dropdownWidth > viewportWidth - padding) {
          dropdownLeft = viewportWidth - dropdownWidth - padding;
          // If we had to adjust, ensure it doesn't go negative
          if (dropdownLeft < padding) {
            dropdownLeft = padding;
          }
        }
        
        // Calculate top position - exactly at bottom of search bar with minimal gap
        const gap = 2; // Minimal gap (2px) for seamless appearance
        let dropdownTop = rect.bottom + gap;
        const viewportHeight = window.innerHeight;
        
        // Check if dropdown would overflow bottom of viewport
        const estimatedDropdownHeight = 300; // max-height from CSS
        const maxBottomPosition = viewportHeight - padding;
        
        if (dropdownTop + estimatedDropdownHeight > maxBottomPosition) {
          // Position above search bar if it would overflow below
          dropdownTop = rect.top - estimatedDropdownHeight - gap;
          // Ensure it doesn't go above viewport
          if (dropdownTop < padding) {
            dropdownTop = padding;
          }
        }
        
        // Final check: ensure dropdown doesn't get cut off at bottom
        if (dropdownTop + estimatedDropdownHeight > maxBottomPosition) {
          dropdownTop = Math.max(padding, maxBottomPosition - estimatedDropdownHeight);
        }
        
        // Ensure dropdown doesn't overflow viewport on the left
        if (dropdownLeft < padding) {
          dropdownLeft = padding;
          // Adjust width if needed to fit within viewport
          const adjustedWidth = Math.min(dropdownWidth, viewportWidth - (padding * 2));
          setSuggestionsPosition({
            top: dropdownTop,
            left: dropdownLeft,
            width: adjustedWidth
          });
        } else {
          setSuggestionsPosition({
            top: dropdownTop,
            left: dropdownLeft,
            width: dropdownWidth
          });
        }
      }
    };

    // Calculate position initially and when dropdown opens
    if (isSuggestionsOpen) {
      calculatePosition();
      
      // Recalculate on window resize for responsiveness
      window.addEventListener('resize', calculatePosition);
      return () => {
        window.removeEventListener('resize', calculatePosition);
      };
    }
  }, [isSuggestionsOpen, searchValue]);

  useEffect(() => {
    setSuggestionHighlightIndex(-1);
  }, [suggestions]);

  useEffect(() => {
    if (suggestionHighlightIndex < 0 || !suggestionsRef.current) return;
    const items = suggestionsRef.current.querySelectorAll('button.suggestion-item');
    const el = items[suggestionHighlightIndex];
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [suggestionHighlightIndex, isSuggestionsOpen]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    setSuggestionHighlightIndex(-1);

    // Ensure input is considered focused when user types
    setIsSearchInputFocused(true);

    // Save search value to localStorage for persistence
    try {
      if (newValue && newValue.trim() !== '') {
        localStorage.setItem(SEARCH_VALUE_STORAGE_KEY, newValue);
      } else {
        localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
      }
    } catch {
      // Ignore storage errors
    }

    // If the search field is completely cleared, also remove from localStorage
    if (!newValue || newValue.trim() === '') {
      setSuggestions([]);
      setIsSuggestionsOpen(false);
      try {
        localStorage.removeItem(SELECTED_ID_STORAGE_KEY);
        localStorage.removeItem('selectedIdRegion');
        // Dispatch event to notify other widgets
        window.dispatchEvent(new CustomEvent('localStorageChange', {
          detail: { key: SELECTED_ID_STORAGE_KEY, value: null }
        }));
      } catch {
        // Ignore storage errors
      }
    } else if (newValue.trim().length >= 1) {
      // Open dropdown when user starts typing (suggestions will be fetched by useEffect)
      setIsSuggestionsOpen(true);
    }
  };

  // Clear search input handler
  const handleClearSearch = () => {
    setSearchValue('');
    setSuggestions([]);
    setIsSuggestionsOpen(false);
    setSuggestionHighlightIndex(-1);
    setIsSearchInputFocused(false);
    try {
      localStorage.removeItem(SEARCH_VALUE_STORAGE_KEY);
      localStorage.removeItem(SELECTED_ID_STORAGE_KEY);
      localStorage.removeItem('selectedIdRegion');
      // Dispatch event to notify other widgets
      window.dispatchEvent(new CustomEvent('localStorageChange', {
        detail: { key: SELECTED_ID_STORAGE_KEY, value: null }
      }));
    } catch {
      // Ignore storage errors
    }
    // Focus back on input after clearing
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Format ID for display - remove curly braces if present
  const formatIdForDisplay = (id: string): string => {
    if (!id) return '';
    // Remove curly braces from start and end if they exist
    return id.replace(/^\{/, '').replace(/\}$/, '');
  };

  // После reload поиск уже пустой (readInitialSearchValueFromStorage); оповещаем остальные виджеты вкладки
  useLayoutEffect(() => {
    if (!isFullPageReload()) {
      return;
    }
    try {
      window.dispatchEvent(
        new CustomEvent('localStorageChange', {
          detail: { key: SEARCH_VALUE_STORAGE_KEY, value: null }
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, []);

  // Sync search input with localStorage.searchValue only — no searchValue ⇒ empty field (no Global ID fallback)
  useEffect(() => {
    const syncFromStorage = () => {
      if (isSearchInputFocused) {
        return;
      }

      try {
        const storedSearchValue = localStorage.getItem(SEARCH_VALUE_STORAGE_KEY);
        if (storedSearchValue != null && storedSearchValue.trim() !== '') {
          setSearchValue(storedSearchValue);
        } else {
          setSearchValue('');
        }
        setIsSuggestionsOpen(false);
      } catch {
        // Ignore storage errors
      }
    };

    if (!isSearchInputFocused) {
      syncFromStorage();
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (isSearchInputFocused) {
        return;
      }

      if (event.key === SEARCH_VALUE_STORAGE_KEY) {
        setSearchValue(event.newValue && event.newValue.trim() !== '' ? event.newValue : '');
        setIsSuggestionsOpen(false);
      }
    };

    // Listen for custom storage events (same-tab)
    const handleCustomStorageChange = () => {
      syncFromStorage();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localStorageChange', handleCustomStorageChange);

    // Poll localStorage periodically to catch changes from same tab
    // Only sync when input is not focused
    const intervalId = setInterval(syncFromStorage, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localStorageChange', handleCustomStorageChange);
      clearInterval(intervalId);
    };
  }, [isSearchInputFocused]); // Re-run when focus state changes

  const handleSuggestionClick = (suggestion: SuggestionItem) => {
    setSuggestionHighlightIndex(-1);
    // Format the display text (remove curly braces) for the search input
    const formattedDisplay = formatIdForDisplay(suggestion.displayText);
    setSearchValue(formattedDisplay);
    setIsSuggestionsOpen(false);
    setIsSearchInputFocused(false); // Reset focus state after selection

    // Save to localStorage (same as monitoring-results) - save the  original ID with braces if needed
    try {
      const currentRegion = localStorage.getItem('selectedSoato') || '';
      localStorage.setItem(SELECTED_ID_STORAGE_KEY, suggestion.id);
      // Save search value for persistence on refresh
      localStorage.setItem(SEARCH_VALUE_STORAGE_KEY, formattedDisplay);
      // Save current region to check on next page load
      localStorage.setItem('selectedIdRegion', currentRegion);
      // Dispatch custom event to notify other widgets in same tab
      window.dispatchEvent(new CustomEvent('localStorageChange', {
        detail: { key: SELECTED_ID_STORAGE_KEY, value: suggestion.id }
      }));
    } catch (e) {
      void e;
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      isSuggestionsOpen &&
      !isLoadingSuggestions &&
      suggestions.length > 0
    ) {
      const idx =
        suggestionHighlightIndex >= 0 && suggestionHighlightIndex < suggestions.length
          ? suggestionHighlightIndex
          : 0;
      handleSuggestionClick(suggestions[idx]);
      return;
    }
    setIsSuggestionsOpen(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isSuggestionsOpen) {
        e.preventDefault();
        setIsSuggestionsOpen(false);
        setSuggestionHighlightIndex(-1);
      }
      return;
    }

    if (isLoadingSuggestions) return;

    const hasResults = suggestions.length > 0;

    if (e.key === 'ArrowDown') {
      if (!hasResults) return;
      e.preventDefault();
      if (!isSuggestionsOpen) setIsSuggestionsOpen(true);
      setSuggestionHighlightIndex((prev) => {
        if (prev < 0) return 0;
        return prev >= suggestions.length - 1 ? prev : prev + 1;
      });
      return;
    }

    if (e.key === 'ArrowUp') {
      if (!hasResults) return;
      e.preventDefault();
      if (!isSuggestionsOpen) setIsSuggestionsOpen(true);
      setSuggestionHighlightIndex((prev) => {
        if (prev <= 0) return -1;
        return prev - 1;
      });
      return;
    }

    if (e.key === 'Enter') {
      if (isSuggestionsOpen && hasResults) {
        e.preventDefault();
        const idx =
          suggestionHighlightIndex >= 0 && suggestionHighlightIndex < suggestions.length
            ? suggestionHighlightIndex
            : 0;
        handleSuggestionClick(suggestions[idx]);
      }
    }
  };

  const handleIconClick = (iconName: string) => {
    if (iconName === 'notification') {
      setIsNotificationOpen(!isNotificationOpen);
    } else if (iconName === 'category') {
      setIsCategoryOpen(!isCategoryOpen);
    } else if (iconName === 'download') {
      setIsExportModalOpen(true);
    }
    // Handle other icon button actions here
  };

  // Handle notification click - do nothing (removed functionality to prevent accidental marking as read)
  // Notifications should only be marked as read via the checkmark button
  const handleNotificationClick = (notificationId: string) => {
    // Do nothing - clicking notification should not mark it as read or remove it
  };

  // Function to mark notification as read via API
  const markNotificationAsReadAPI = async (notificationId: string): Promise<boolean> => {
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // Add authorization header only if token is available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // POST request to mark notification as read
      const response = await fetch(`https://api-test.spacemc.uz/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        void errorText;
        return false;
      }

      return true;
    } catch (error) {
      void error;
      return false;
    }
  };

  // Handle mark notification as read (click on checkmark) — only update is_read, keep in list
  const handleMarkAsRead = async (notificationId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const success = await markNotificationAsReadAPI(notificationId);
    if (success) {
      setNotifications(prev => prev.map(n =>
        n.id === notificationId ? { ...n, is_read: true, unread: false } : n
      ));
    }
  };

  // Function to mark all notifications as read via API
  const markAllNotificationsAsReadAPI = async (notificationIds: string[]): Promise<void> => {
    if (notificationIds.length === 0) {
      return;
    }

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      // Add authorization header only if token is available
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Try to mark all as read via API
      const response = await fetch('https://api-test.spacemc.uz/notifications/read-all', {
        method: 'PATCH',
        headers: headers,
        body: JSON.stringify({ notification_ids: notificationIds }),
      });

      if (!response.ok) {
        // Fallback: mark each notification individually
        await Promise.all(notificationIds.map(id => markNotificationAsReadAPI(id)));
      }
    } catch (error) {
      void error;
      // Fallback: mark each notification individually
      await Promise.all(notificationIds.map(id => markNotificationAsReadAPI(id)));
    }
  };

  // Handle mark all as read — only update is_read for all, keep list
  const handleMarkAllAsRead = async () => {
    const unreadNotifications = notifications.filter(n => n.is_read === false);
    const unreadIds = unreadNotifications.map(n => n.id);

    await markAllNotificationsAsReadAPI(unreadIds);

    setNotifications(prev => prev.map(n => ({ ...n, is_read: true, unread: false })));
  };

  const handleFileClick = (file: File) => {
    // Create a temporary anchor element to trigger download
    const link = document.createElement('a');
    link.href = file.url;
    link.download = getFileName(file.nameKey);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle video click - open video player
  const handleVideoClick = (video: Video) => {
    setSelectedVideo(video);
  };

  // Close video player
  const closeVideoPlayer = () => {
    setSelectedVideo(null);
  };

  const handleColorSelect = (themeType: string) => {
    setSelectedColor(themeType);
    // Save theme type (type1, type2, etc.) instead of hex color
    localStorage.setItem('selectedThemeColor', themeType);
    setIsColorOpen(false);
    // Dispatch event to notify other widgets about theme change
    window.dispatchEvent(new CustomEvent('theme-color-changed', { detail: { color: themeType } }));
  };

  // Get notification icon based on type
  const getNotificationIcon = (type: Notification['type']) => {
    const iconSize = 20;
    switch (type) {
      case 'sales':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2L12 7L17 8L12 9L10 14L8 9L3 8L8 7L10 2Z" fill="white" />
            <path d="M10 5L11 8L14 9L11 10L10 13L9 10L6 9L9 8L10 5Z" fill="currentColor" />
          </svg>
        );
      case 'user':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="9" fill="white" />
            <text x="10" y="14" textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="bold" fontFamily="Arial">@</text>
          </svg>
        );
      case 'review':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="16" height="16" rx="2" fill="white" />
            <path d="M6 8L9 11L14 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      case 'issue':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="9" fill="white" />
            <path d="M10 5V10M10 15H10.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="10" cy="10" r="1" fill="currentColor" />
          </svg>
        );
      case 'thread':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="9" fill="white" />
            <circle cx="10" cy="10" r="5" fill="currentColor" />
            <circle cx="10" cy="10" r="2" fill="white" />
          </svg>
        );
      case 'comment':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 2H18V14H6L2 18V2Z" fill="white" />
            <path d="M6 6H14M6 10H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'support':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="9" fill="white" />
            <path d="M10 6C8.89543 6 8 6.89543 8 8C8 8.55228 8.44772 9 9 9C9.55228 9 10 8.55228 10 8C10 7.44772 10.4477 7 11 7C11.5523 7 12 7.44772 12 8C12 9.10457 11.1046 10 10 10M10 14H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      case 'order':
        return (
          <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="16" height="16" rx="2" fill="white" />
            <path d="M6 6H14M6 10H12M6 14H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Get notification icon color based on type
  const getNotificationIconColor = (type: Notification['type']): string => {
    switch (type) {
      case 'sales':
      case 'user':
        return '#10b981'; // green
      case 'review':
        return '#3b82f6'; // blue
      case 'issue':
        return '#ef4444'; // red
      case 'thread':
      case 'comment':
        return '#14b8a6'; // teal
      case 'support':
      case 'order':
        return '#f97316'; // orange
      default:
        return '#6b7280'; // gray
    }
  };

  // Вычисляем цвета для borderGlow и скроллбаров
  const [r, g, b] = (() => {
    const hex = themeColors.primary.replace('#', '');
    return [
      parseInt(hex.substr(0, 2), 16),
      parseInt(hex.substr(2, 2), 16),
      parseInt(hex.substr(4, 2), 16),
    ];
  })();

  const [glowR, glowG, glowB] = (() => {
    const hexSource =
      selectedColor === 'type01' ? TYPE1_PRIMARY_FOR_BORDER_GLOW : themeColors.primary;
    const hex = hexSource.replace('#', '');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  })();

  const type01ProfileAccent = '#00FFC8';
  const isType01Profile = selectedColor === 'type01';
  const [pr, pg, pb] = isType01Profile
    ? (() => {
        const hex = type01ProfileAccent.replace('#', '');
        return [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
      })()
    : [r, g, b];
  const profileButtonBg = isType01Profile
    ? `linear-gradient(135deg, ${type01ProfileAccent} 0%, #00c9a6 100%)`
    : `linear-gradient(135deg, ${themeColors.primary} 0%, ${themeColors.dark} 100%)`;
  const profileButtonBgHover = isType01Profile
    ? `linear-gradient(135deg, #7bffeb 0%, ${type01ProfileAccent} 100%)`
    : `linear-gradient(135deg, ${themeColors.light} 0%, ${themeColors.primary} 100%)`;

  return (
    <div className="space-eco-header-widget">
      <header
        className="header-frame"
        style={{
          '--border-glow-start': `rgba(${glowR}, ${glowG}, ${glowB}, 0.1)`,
          '--border-glow-end': `rgba(${glowR}, ${glowG}, ${glowB}, 0.35)`,
          '--theme-primary-rgba': `rgba(${r}, ${g}, ${b}, 0.6)`,
          '--theme-primary-rgba-hover': `rgba(${r}, ${g}, ${b}, 0.8)`,
          '--profile-button-bg': profileButtonBg,
          '--profile-button-bg-hover': profileButtonBgHover,
          '--profile-button-shadow': `rgba(${pr}, ${pg}, ${pb}, 0.3)`,
          '--profile-button-hover-shadow': `rgba(${pr}, ${pg}, ${pb}, 0.4)`,
          '--profile-button-focus-shadow': `rgba(${pr}, ${pg}, ${pb}, 0.4)`,
          '--profile-button-open-shadow': `rgba(${pr}, ${pg}, ${pb}, 0.5)`,
        } as React.CSSProperties}
      >
        {/* Left Side - Logo and Title */}
        <div className="header-left-side">
          <div 
            className="header-logo" 
            onClick={handleLogoClick}
            style={{ 
              cursor: 'pointer' 
            }}
          >
            <svg width="106" height="60" viewBox="0 0 106 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.9904 31.1883C11.9904 31.8277 11.8217 32.3281 11.4833 32.6882C11.1448 33.0415 10.6901 33.2182 10.1169 33.2182C9.54373 33.2182 9.07309 33.0381 8.7278 32.678C8.38251 32.3178 8.2093 31.8209 8.2093 31.1883V26.6443H6.73242V31.1883C6.73242 31.8653 6.86803 32.45 7.14039 32.9424C7.41274 33.4279 7.80133 33.8029 8.30844 34.0673C8.81555 34.3317 9.41837 34.4639 10.1158 34.4639C10.8132 34.4639 11.4012 34.3317 11.9015 34.0673C12.4086 33.8029 12.7938 33.4279 13.0581 32.9424C13.3305 32.45 13.4661 31.8653 13.4661 31.1883V26.6443H11.9892V31.1883H11.9904Z" fill="white" />
              <path d="M25.2581 27.6256V26.6432H18.8548V27.8786H23.2638L18.7227 33.3823V34.3648H25.3139V33.1293H20.718L25.2581 27.6256Z" fill="white" />
              <path d="M35.2441 34.3089C35.611 34.1983 35.9609 34.0445 36.2913 33.845C36.6298 33.6467 36.9272 33.4153 37.1836 33.1498L36.313 32.2346C36.0258 32.5218 35.6999 32.7497 35.3318 32.9184C34.9649 33.0803 34.5934 33.1612 34.2185 33.1612C33.8436 33.1612 33.5211 33.0917 33.2043 32.9515C32.8954 32.8113 32.6197 32.621 32.3781 32.3782C32.1433 32.1354 31.9599 31.8528 31.8265 31.5291C31.6943 31.1986 31.6283 30.8453 31.6283 30.4703C31.6283 30.0953 31.6943 29.7466 31.8265 29.4229C31.9587 29.0992 32.1422 28.8166 32.3781 28.5738C32.6208 28.3242 32.8966 28.1327 33.2043 28.0005C33.5199 27.8604 33.8584 27.7908 34.2185 27.7908C34.5786 27.7908 34.9683 27.8832 35.3421 28.0666C35.717 28.2433 36.0395 28.4861 36.3119 28.7949L37.1711 27.7806C36.9215 27.523 36.6344 27.3065 36.3119 27.1298C35.9882 26.9463 35.6464 26.8061 35.2863 26.7104C34.9341 26.6078 34.5695 26.5565 34.1957 26.5565C33.6157 26.5565 33.0789 26.6557 32.5866 26.854C32.1012 27.0523 31.6716 27.3315 31.2966 27.6917C30.9217 28.0518 30.6311 28.4712 30.426 28.9488C30.2209 29.4195 30.1172 29.9346 30.1172 30.4931C30.1172 31.0516 30.2197 31.5633 30.426 32.0488C30.6323 32.5343 30.9149 32.9572 31.275 33.3173C31.6419 33.6775 32.0681 33.9601 32.5536 34.1664C33.0459 34.3647 33.5746 34.4639 34.141 34.4639C34.5159 34.4639 34.8828 34.4126 35.2429 34.3089H35.2441Z" fill="white" />
              <path d="M47.4508 26.8529C46.9516 26.6546 46.4115 26.5554 45.8303 26.5554C45.2491 26.5554 44.7101 26.6546 44.2098 26.8529C43.7175 27.0512 43.2845 27.3304 42.9096 27.6906C42.5347 28.0439 42.2407 28.4587 42.0276 28.9374C41.8213 29.415 41.7188 29.9335 41.7188 30.4931C41.7188 31.0527 41.8213 31.5736 42.0276 32.0591C42.2407 32.5367 42.5347 32.9561 42.9096 33.3162C43.2845 33.6764 43.7175 33.959 44.2098 34.1653C44.709 34.3636 45.2491 34.4628 45.8303 34.4628C46.4115 34.4628 46.9505 34.3636 47.4508 34.1653C47.9499 33.959 48.3841 33.6764 48.751 33.3162C49.1259 32.9561 49.4154 32.5332 49.6216 32.0477C49.8347 31.5622 49.9407 31.0436 49.9407 30.492C49.9407 29.9404 49.8336 29.4184 49.6216 28.9477C49.4154 28.4701 49.1259 28.0507 48.751 27.6906C48.3841 27.3304 47.9499 27.0512 47.4508 26.8529ZM48.2222 31.5633C48.0901 31.887 47.9066 32.1731 47.6707 32.4238C47.4359 32.6734 47.1602 32.8683 46.8445 33.0085C46.5357 33.1487 46.2052 33.2182 45.8531 33.2182C45.501 33.2182 45.1659 33.1487 44.8503 33.0085C44.5346 32.8683 44.2554 32.6734 44.0127 32.4238C43.77 32.1742 43.5797 31.887 43.4395 31.5633C43.3005 31.2328 43.2298 30.8761 43.2298 30.4931C43.2298 30.1102 43.2959 29.758 43.4281 29.4343C43.5683 29.1107 43.7586 28.828 44.0013 28.5853C44.244 28.3357 44.5232 28.1442 44.8389 28.012C45.1545 27.8718 45.493 27.8023 45.8531 27.8023C46.2132 27.8023 46.5368 27.8718 46.8445 28.012C47.1602 28.1442 47.4359 28.3357 47.6707 28.5853C47.9054 28.828 48.0901 29.1107 48.2222 29.4343C48.3624 29.758 48.4319 30.1113 48.4319 30.4931C48.4319 30.875 48.3624 31.2317 48.2222 31.5633Z" fill="white" />
              <path d="M58.8751 32.931C58.6472 33.0929 58.3235 33.1738 57.9053 33.1738C57.633 33.1738 57.3401 33.1293 57.0233 33.0416C56.7145 32.9458 56.4057 32.8136 56.098 32.6449C55.7891 32.4683 55.5031 32.2586 55.2387 32.0158L54.6211 33.2182C54.9003 33.461 55.2125 33.6741 55.5578 33.8576C55.9099 34.0411 56.2814 34.1881 56.6712 34.2987C57.0677 34.4012 57.4723 34.4537 57.8837 34.4537C58.4489 34.4537 58.9526 34.3614 59.3936 34.1779C59.8414 33.9944 60.1947 33.7334 60.4511 33.3949C60.7086 33.0564 60.8374 32.6484 60.8374 32.1708C60.8374 31.7742 60.7633 31.4425 60.6175 31.1781C60.4705 30.9137 60.2722 30.696 60.0226 30.5273C59.7799 30.3587 59.5121 30.2219 59.2181 30.1193C58.9241 30.0088 58.6301 29.9096 58.3361 29.8219C58.0421 29.733 57.7708 29.6418 57.5201 29.546C57.2774 29.4503 57.0791 29.3295 56.9253 29.1825C56.7783 29.0355 56.7054 28.844 56.7054 28.6092C56.7054 28.3516 56.8079 28.1567 57.0142 28.0245C57.2273 27.8923 57.5065 27.8262 57.8518 27.8262C58.0569 27.8262 58.2848 27.8524 58.5355 27.9037C58.7851 27.9482 59.0494 28.0245 59.3286 28.1351C59.6158 28.2456 59.8939 28.3847 60.1662 28.5545L60.7611 27.3407C60.3941 27.0979 59.9634 26.903 59.4711 26.756C58.9856 26.609 58.4865 26.5349 57.9726 26.5349C57.3925 26.5349 56.8854 26.6272 56.4512 26.8107C56.025 26.9874 55.6911 27.2404 55.4484 27.5721C55.2057 27.8957 55.0849 28.2821 55.0849 28.73C55.0849 29.1266 55.159 29.4549 55.3048 29.7113C55.4587 29.9689 55.657 30.182 55.8997 30.3507C56.1492 30.5125 56.4216 30.6482 56.7156 30.7587C57.0096 30.8613 57.3036 30.9536 57.5976 31.0345C57.8985 31.1075 58.1708 31.1964 58.4136 31.2989C58.6563 31.3947 58.8512 31.5155 58.9982 31.6625C59.152 31.8095 59.2295 32.0044 59.2295 32.2472C59.2295 32.5412 59.1121 32.7692 58.8762 32.931H58.8751Z" fill="white" />
              <path d="M70.5571 31.7058L67.9999 26.6432H66.3145V34.3648H67.6591V28.7061L70.0727 33.5704H71.0197L73.4231 28.7061V34.3648H74.778V26.6432H73.0926L70.5571 31.7058Z" fill="white" />
              <path d="M87.1807 27.6917C86.8137 27.3315 86.3796 27.0523 85.8804 26.854C85.3813 26.6557 84.8412 26.5565 84.26 26.5565C83.6788 26.5565 83.1398 26.6557 82.6395 26.854C82.1472 27.0523 81.7142 27.3315 81.3393 27.6917C80.9644 28.045 80.6704 28.4598 80.4573 28.9385C80.251 29.4161 80.1484 29.9346 80.1484 30.4942C80.1484 31.0538 80.251 31.5747 80.4573 32.0602C80.6704 32.5378 80.9644 32.9572 81.3393 33.3173C81.7142 33.6775 82.1472 33.9601 82.6395 34.1664C83.1387 34.3647 83.6788 34.4639 84.26 34.4639C84.8412 34.4639 85.3802 34.3647 85.8804 34.1664C86.3796 33.9601 86.8137 33.6775 87.1807 33.3173C87.5556 32.9572 87.8462 32.5343 88.0513 32.0488C88.2644 31.5633 88.3704 31.0447 88.3704 30.4931C88.3704 29.9415 88.2644 29.4195 88.0513 28.9488C87.8451 28.4712 87.5556 28.0518 87.1807 27.6917ZM86.6508 31.5633C86.5186 31.887 86.3351 32.1731 86.0992 32.4238C85.8645 32.6734 85.5887 32.8683 85.2731 33.0085C84.9642 33.1486 84.6338 33.2182 84.2816 33.2182C83.9295 33.2182 83.5945 33.1486 83.2788 33.0085C82.9632 32.8683 82.684 32.6734 82.4412 32.4238C82.1985 32.1742 82.0082 31.887 81.868 31.5633C81.7279 31.2328 81.6584 30.8761 81.6584 30.4931C81.6584 30.1102 81.7245 29.758 81.8566 29.4343C81.9968 29.1106 82.1871 28.828 82.4298 28.5852C82.6726 28.3356 82.9518 28.1441 83.2674 28.0119C83.5831 27.8718 83.9215 27.8022 84.2816 27.8022C84.6417 27.8022 84.9654 27.8718 85.2731 28.0119C85.5887 28.1441 85.8645 28.3356 86.0992 28.5852C86.334 28.828 86.5186 29.1106 86.6508 29.4343C86.791 29.758 86.8605 30.1113 86.8605 30.4931C86.8605 30.8749 86.791 31.2316 86.6508 31.5633Z" fill="white" />
              <path d="M99.046 31.177C98.899 30.9126 98.7007 30.6949 98.4512 30.5262C98.2085 30.3576 97.9407 30.2208 97.6466 30.1182C97.3526 30.0077 97.0586 29.9085 96.7646 29.8208C96.4706 29.7319 96.1994 29.6407 95.9487 29.545C95.706 29.4492 95.5077 29.3284 95.3538 29.1814C95.2068 29.0344 95.1339 28.8429 95.1339 28.6081C95.1339 28.3505 95.2365 28.1556 95.4427 28.0234C95.6558 27.8912 95.935 27.8251 96.2803 27.8251C96.4854 27.8251 96.7133 27.8513 96.964 27.9026C97.2136 27.9471 97.478 28.0234 97.7572 28.134C98.0444 28.2445 98.3235 28.3836 98.5948 28.5534L99.1896 27.3396C98.8227 27.0968 98.3919 26.9019 97.8996 26.7549C97.4142 26.6079 96.915 26.5338 96.4011 26.5338C95.8211 26.5338 95.314 26.6261 94.8798 26.8096C94.4536 26.9863 94.1197 27.2393 93.877 27.571C93.6342 27.8946 93.5134 28.281 93.5134 28.7289C93.5134 29.1255 93.5875 29.4538 93.7334 29.7102C93.8872 29.9678 94.0855 30.1809 94.3282 30.3496C94.5778 30.5114 94.8502 30.6471 95.1442 30.7576C95.4382 30.8602 95.7322 30.9525 96.0262 31.0334C96.327 31.1064 96.5994 31.1953 96.8421 31.2978C97.0848 31.3936 97.2797 31.5144 97.4267 31.6614C97.5806 31.8084 97.658 32.0033 97.658 32.2461C97.658 32.5401 97.5407 32.7681 97.3048 32.9299C97.0769 33.0918 96.7532 33.1727 96.335 33.1727C96.0627 33.1727 95.7698 33.1282 95.453 33.0405C95.1442 32.9447 94.8353 32.8125 94.5277 32.6438C94.2188 32.4672 93.9328 32.2575 93.6684 32.0147L93.0508 33.2171C93.33 33.4599 93.6422 33.673 93.9875 33.8565C94.3396 34.04 94.7111 34.187 95.1009 34.2976C95.4974 34.4001 95.902 34.4526 96.3134 34.4526C96.8797 34.4526 97.3823 34.3603 97.8233 34.1768C98.2711 33.9933 98.6244 33.7323 98.8808 33.3938C99.1383 33.0553 99.2671 32.6473 99.2671 32.1697C99.2671 31.7731 99.193 31.4414 99.0472 31.177H99.046Z" fill="white" />
              <path d="M35.4847 22.0581C36.1867 20.271 37.5587 17.9893 38.7587 16.5111C39.4174 15.6996 41.3694 13.7735 42.2241 13.1296C42.6241 12.8253 43.3694 12.301 43.8765 11.975C46.0827 10.5812 48.6501 9.49957 51.1765 8.98898C52.7776 8.68467 53.7713 8.53993 55.6721 8.54791C58.0675 8.54791 59.5216 8.77585 61.6275 9.34571C63.1192 9.76854 64.0627 10.1447 65.4701 10.8353C67.5863 11.9044 69.1304 12.9848 70.8716 14.6807C71.6135 15.3896 72.4351 16.2957 72.8624 16.8542C72.8784 16.877 72.908 16.869 72.9468 16.8394C72.9775 16.8086 72.7394 16.4667 72.4169 16.0792C72.0944 15.6917 71.495 15.0158 71.0722 14.5827C68.6244 12.0833 65.5521 10.1241 62.2428 9.00493C60.9882 8.56956 59.6241 8.24588 58.3239 8.03275C57.2105 7.82646 53.8591 7.76036 52.7138 7.88801C52.2067 7.9336 51.4147 8.04757 50.9463 8.12393C46.9977 8.81232 43.2406 10.6005 40.1877 13.2071C39.3513 13.924 38.0351 15.246 37.3604 16.0951C36.679 16.9328 35.7502 18.3028 35.2089 19.2487C34.4101 20.5947 33.5076 22.9072 33.119 24.3626L33.0723 24.6134L34.6323 24.5678C34.8591 23.7905 35.1782 22.8138 35.4859 22.0604L35.4847 22.0581Z" fill="white" />
              <path d="M72.8597 44.1663C72.4323 44.7248 71.6119 45.6309 70.8689 46.3398C69.1276 48.0357 67.5835 49.115 65.4673 50.1852C64.0611 50.8759 63.1175 51.252 61.6247 51.6748C59.5188 52.2447 58.0647 52.4738 55.6693 52.4726C53.7685 52.4817 52.776 52.3358 51.1738 52.0315C48.6473 51.5209 46.0788 50.4394 43.8737 49.0455C43.3666 48.7184 42.6213 48.1941 42.2213 47.8909C41.3667 47.247 39.4146 45.3209 38.7559 44.5094C37.5571 43.0312 36.1839 40.7495 35.482 38.9624C35.1743 38.209 34.8552 37.2323 34.6284 36.455L33.0684 36.4094L33.1151 36.6602C33.5037 38.1156 34.4062 40.4281 35.205 41.7741C35.7463 42.72 36.6751 44.09 37.3565 44.9277C38.0323 45.7756 39.3485 47.0988 40.1838 47.8157C43.2367 50.4223 46.9938 52.2116 50.9424 52.8989C51.4108 52.9752 52.2028 53.0892 52.7099 53.1348C53.8552 53.2636 57.2066 53.1963 58.32 52.99C59.6202 52.7769 60.9854 52.4521 62.2389 52.0179C65.5482 50.8987 68.6205 48.9395 71.0683 46.4401C71.4911 46.007 72.0905 45.3311 72.413 44.9436C72.7355 44.5561 72.9736 44.2142 72.9429 44.1834C72.9041 44.1527 72.8733 44.1458 72.8585 44.1686L72.8597 44.1663Z" fill="white" />
            </svg>
          </div>
          <div className="header-title">
            Space Eco Monitoring
          </div>
        </div>

        {/* Center - Search Bar */}
        <div className="header-center-side">
          <form
            ref={searchContainerRef}
            className="searchbar-container"
            onSubmit={handleSearchSubmit}
          >
            <div className="searchbar-content">
              <svg
                className="search-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M9 17C13.4183 17 17 13.4183 17 9C17 4.58172 13.4183 1 9 1C4.58172 1 1 4.58172 1 9C1 13.4183 4.58172 17 9 17Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M19 19L14.65 14.65"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                className="search-input"
                placeholder={getVideoFilesTranslations().search.placeholder}
                value={searchValue}
                onChange={handleSearchChange}
                onKeyDown={handleSearchKeyDown}
                onFocus={() => {
                  setIsSearchInputFocused(true);
                  // Show suggestions if we have any, or trigger fetch if searchValue exists
                  if (suggestions.length > 0) {
                    setIsSuggestionsOpen(true);
                  } else if (searchValue && searchValue.trim().length >= 1) {
                    // Trigger suggestions fetch by ensuring focus state
                    // The useEffect will handle the fetch
                    setIsSuggestionsOpen(true);
                  }
                }}
                onBlur={() => {
                  // Delay to allow suggestion click to work
                  setTimeout(() => {
                    setIsSearchInputFocused(false);
                  }, 200);
                }}
              />
              {isLoadingSuggestions && (
                <svg
                  className="search-loading-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeDasharray="31.416"
                    strokeDashoffset="23.562"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from="0 8 8"
                      to="360 8 8"
                      dur="1s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </svg>
              )}
              {!isLoadingSuggestions && searchValue && (
                <button
                  type="button"
                  className="search-clear-button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 4L4 12M4 4L12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </form>

          {/* Suggestions Dropdown */}
          {isSuggestionsOpen && suggestionsPosition && createPortal(
            <React.Fragment>
              <div
                className="suggestions-dropdown-backdrop"
                onClick={() => setIsSuggestionsOpen(false)}
              ></div>
              <div
                ref={suggestionsRef}
                className="suggestions-dropdown-menu"
                style={{
                  position: 'fixed',
                  top: `${suggestionsPosition.top}px`,
                  left: `${suggestionsPosition.left}px`,
                  width: `${suggestionsPosition.width}px`,
                  maxWidth: 'calc(100vw - 32px)'
                }}
              >
                {isLoadingSuggestions ? (
                  <div className="suggestion-item loading">
                    <span className="suggestion-text">{getVideoFilesTranslations().search.loading}</span>
                  </div>
                ) : suggestions.length > 0 ? (
                  suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className={`suggestion-item${index === suggestionHighlightIndex ? ' is-highlighted' : ''}`}
                      onMouseEnter={() => setSuggestionHighlightIndex(index)}
                      onClick={() => handleSuggestionClick(suggestion)}
                    >
                      <span className="suggestion-text">{formatIdForDisplay(suggestion.displayText)}</span>
                    </button>
                  ))
                ) : (
                  <div className="suggestion-item no-results">
                    <span className="suggestion-text">{getVideoFilesTranslations().search.noResults}</span>
                  </div>
                )}
              </div>
            </React.Fragment>,
            document.body
          )}
        </div>

        {/* Right Side - Icons */}
        <div className="header-right-side">
          {/* Icon Buttons Group */}
          <div className="icon-buttons-group">
            <button
              ref={notificationButtonRef}
              className={`icon-button notification-button ${isNotificationOpen ? 'open' : ''}`}
              onClick={() => handleIconClick('notification')}
              aria-label="Notifications"
              aria-expanded={isNotificationOpen}
              aria-haspopup="true"
            >
              <svg width="21" height="24" viewBox="0 0 21 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="iconGradientHover" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#1487C5" />
                    <stop offset="100%" stopColor="#011AFE" />
                  </linearGradient>
                </defs>
                <path d="M10.5 0C12.3425 0.000129014 13.8364 1.47265 13.837 3.28943V3.79541C16.1943 5.04557 17.7111 7.60862 17.4241 10.4385C17.2862 11.7982 17.7211 13.1542 18.6269 14.1884L19.4908 15.1746C21.2639 17.1989 19.8059 20.3416 17.0935 20.3419H13.8216C13.6683 22.019 12.2395 23.3333 10.4988 23.3333C8.75833 23.3331 7.33049 22.0188 7.17718 20.3419H3.9065C1.19397 20.3416 -0.26489 17.1991 1.508 15.1746L2.37188 14.1884C3.22104 13.2187 3.65744 11.9665 3.59483 10.6933L3.57469 10.4385C3.2881 7.60854 4.8056 5.04553 7.16296 3.79541V3.29177C7.16259 1.47416 8.65674 0 10.5 0ZM9.01279 20.3419C9.1533 21.0245 9.76519 21.5382 10.4988 21.5385C11.2326 21.5385 11.8442 21.0245 11.9848 20.3419H9.01279ZM10.4111 4.78632C7.42392 4.78632 5.08953 7.32989 5.3866 10.2609L5.41267 10.6068C5.49774 12.3388 4.90526 14.0425 3.75007 15.3616L2.88619 16.3478C2.1317 17.2094 2.75221 18.5468 3.9065 18.547H17.0935C18.1755 18.5468 18.7886 17.3715 18.2394 16.5149L18.1138 16.349L17.2487 15.3616C16.0166 13.9546 15.4257 12.1095 15.6134 10.2597C15.9105 7.32941 13.5766 4.78661 10.5901 4.78632H10.4111ZM10.5 1.79487C9.71505 1.79487 9.06853 2.38274 8.99027 3.13635C9.44786 3.04171 9.92327 2.99145 10.4111 2.99145H10.5901C11.0769 2.99149 11.5507 3.04206 12.0074 3.13635C11.929 2.38288 11.2847 1.79499 10.5 1.79487Z" fill="currentColor" />
                <path d="M17.9386 2.58587C17.5441 2.27889 16.9717 2.34513 16.6603 2.73407C16.3488 3.12301 16.4162 3.68737 16.8106 3.99455C18.2304 5.10006 19.0303 6.64238 19.1848 8.19114L19.1982 8.28194C19.2894 8.72795 19.7104 9.04231 20.1794 8.99682C20.6795 8.94811 21.0447 8.50845 20.9956 8.01532L20.9478 7.63566C20.6596 5.7382 19.6361 3.90755 17.9386 2.58587Z" fill="currentColor" />
                <path d="M3.06144 2.58587C3.45592 2.27889 4.02828 2.34513 4.33972 2.73407C4.65115 3.12301 4.58375 3.68737 4.18943 3.99455C2.76958 5.10006 1.96969 6.64238 1.81518 8.19114L1.80182 8.28194C1.71063 8.72795 1.28961 9.04231 0.82056 8.99682C0.320547 8.94811 -0.044744 8.50845 0.00443711 8.01532L0.0522355 7.63566C0.340428 5.7382 1.36395 3.90755 3.06144 2.58587Z" fill="currentColor" />
              </svg>
              {(() => {
                const unreadCount = notifications.filter(n => n.is_read === false).length;
                return unreadCount > 0 ? (
                  <span className="notification-badge" title={notificationTranslations[currentLocale]?.unreadCount ? `${unreadCount} ${notificationTranslations[currentLocale].unreadCount}` : `${unreadCount} unread`}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null;
              })()}
            </button>

            {/* Notification Dropdown */}
            {isNotificationOpen && notificationDropdownPosition && createPortal(
              <React.Fragment>
                <div className="notification-dropdown-backdrop" onClick={() => setIsNotificationOpen(false)}></div>
                <div
                  ref={notificationDropdownRef}
                  className="notification-dropdown-menu"
                  style={{
                    position: 'fixed',
                    top: `${notificationDropdownPosition.top}px`,
                    right: `${notificationDropdownPosition.right}px`
                  }}
                >
                  <div className="notification-dropdown-header">
                    <h3 className="notification-dropdown-title">
                      {notificationTranslations[currentLocale]?.title || 'Notifications'}
                    </h3>
                    <div className="notification-header-actions">
                      <button
                        className="notification-action-button"
                        aria-label={notificationTranslations[currentLocale]?.markAllRead || 'Mark all as read'}
                        onClick={handleMarkAllAsRead}
                        title={notificationTranslations[currentLocale]?.markAllRead || 'Mark all as read'}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className={`notification-list ${isLoadingNotifications ? 'notification-list-loading-page' : ''}`}>
                    <div key={notificationsPage} className="notification-list-page">
                      {isLoadingNotifications && notifications.length === 0 ? (
                        <div className="notification-item no-notifications notification-list-loading">
                          <div className="notification-content">
                            <div className="notification-text">...</div>
                          </div>
                        </div>
                      ) : notifications.length > 0 ? (
                        notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`notification-item ${notification.is_read === false ? 'notification-item-unread' : ''}`}
                          style={{ cursor: 'default' }}
                        >
                          {notification.is_read === false && (
                            <span className="notification-item-unread-dot" aria-hidden title={notificationTranslations[currentLocale]?.unreadCount || 'Unread'} />
                          )}
                          <div
                            className="notification-icon-wrapper"
                            style={{ backgroundColor: getNotificationIconColor(notification.type) }}
                          >
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="notification-content">
                            <div className="notification-text">{notification.text}</div>
                            <div className="notification-timestamp">{notification.timestamp}</div>
                          </div>
                          {notification.is_read === false && (
                            <button
                              className="notification-mark-read-button"
                              onClick={(e) => handleMarkAsRead(notification.id, e)}
                              aria-label="Mark as read"
                              title={notificationTranslations[currentLocale]?.markAllRead || 'Mark as read'}
                            >
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M13.3333 4L6 11.3333L2.66667 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}
                        </div>
                        ))
                      ) : (
                        <div className="notification-item no-notifications">
                          <div className="notification-content">
                            <div className="notification-text">
                              {notificationTranslations[currentLocale]?.noNotifications || 'No notifications'}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {notificationsTotalPages > 1 && (
                    <div className="notification-pagination">
                      <button
                        type="button"
                        className="notification-pagination-btn"
                        disabled={notificationsPage <= 1 || isLoadingNotifications}
                        onClick={() => loadNotificationsPage(notificationsPage - 1)}
                        aria-label={notificationTranslations[currentLocale]?.prevPage || 'Previous page'}
                      >
                        {notificationTranslations[currentLocale]?.prevPage || 'Previous'}
                      </button>
                      <span className="notification-pagination-info">
                        <span key={notificationsPage} className="notification-pagination-page-num">
                          {notificationsPage}
                        </span>{' '}
                        {notificationTranslations[currentLocale]?.pageOf || 'of'} {notificationsTotalPages}
                      </span>
                      <button
                        type="button"
                        className="notification-pagination-btn"
                        disabled={notificationsPage >= notificationsTotalPages || isLoadingNotifications}
                        onClick={() => loadNotificationsPage(notificationsPage + 1)}
                        aria-label={notificationTranslations[currentLocale]?.nextPage || 'Next page'}
                      >
                        {notificationTranslations[currentLocale]?.nextPage || 'Next'}
                      </button>
                    </div>
                  )}
                </div>
              </React.Fragment>,
              document.body
            )}
            <button
              className="icon-button"
              onClick={() => handleIconClick('download')}
              aria-label="Download"
            >
              <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="iconGradientHover" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#1487C5" />
                    <stop offset="100%" stopColor="#011AFE" />
                  </linearGradient>
                </defs>
                <path d="M7.77252e-07 12.4383V11.5769C7.77252e-07 11.1308 0.361617 10.7692 0.807693 10.7692C1.25377 10.7692 1.61539 11.1308 1.61539 11.5769V12.4383C1.61539 14.0715 1.61616 15.232 1.71319 16.1276C1.80859 17.0079 1.98963 17.5362 2.28426 17.9417C2.5001 18.2388 2.76124 18.4999 3.05829 18.7157C3.46381 19.0104 3.99208 19.1914 4.87245 19.2868C5.76802 19.3838 6.92849 19.3846 8.56175 19.3846H12.4383C14.0715 19.3846 15.232 19.3838 16.1276 19.2868C17.0079 19.1914 17.5362 19.0104 17.9417 18.7157C18.2388 18.4999 18.4999 18.2388 18.7157 17.9417C19.0104 17.5362 19.1914 17.0079 19.2868 16.1276C19.3838 15.232 19.3846 14.0715 19.3846 12.4383V11.5769C19.3846 11.1308 19.7462 10.7692 20.1923 10.7692C20.6384 10.7692 21 11.1308 21 11.5769V12.4383C21 14.0354 21.0013 15.2983 20.8927 16.3011C20.7824 17.319 20.551 18.1646 20.023 18.8914C19.7075 19.3256 19.3256 19.7075 18.8914 20.023C18.1646 20.551 17.319 20.7824 16.3011 20.8927C15.2983 21.0013 14.0354 21 12.4383 21H8.56175C6.96463 21 5.70165 21.0013 4.69892 20.8927C3.68102 20.7824 2.83543 20.551 2.10862 20.023C1.67438 19.7075 1.29251 19.3256 0.977014 18.8914C0.448959 18.1646 0.217555 17.319 0.107272 16.3011C-0.00133934 15.2983 7.77252e-07 14.0354 7.77252e-07 12.4383ZM9.69231 0.807692C9.69231 0.361616 10.0539 -7.60284e-10 10.5 0C10.9461 3.54509e-08 11.3077 0.361616 11.3077 0.807692V11.781L13.1597 9.92894C13.4751 9.61351 13.9864 9.61351 14.3018 9.92894C14.6173 10.2444 14.6173 10.7556 14.3018 11.0711L11.0711 14.3018C10.9196 14.4533 10.7142 14.5385 10.5 14.5385C10.2858 14.5385 10.0804 14.4533 9.92894 14.3018L6.69817 11.0711C6.38274 10.7556 6.38274 10.2444 6.69817 9.92894C7.01359 9.61351 7.52487 9.61351 7.8403 9.92894L9.69231 11.781V0.807692Z" fill="currentColor" />
              </svg>
            </button>
            <button
              ref={categoryButtonRef}
              className={`icon-button category-button ${isCategoryOpen ? 'open' : ''}`}
              onClick={() => handleIconClick('category')}
              aria-label="Category"
              aria-expanded={isCategoryOpen}
              aria-haspopup="true"
            >
              <svg width="21" height="21" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="iconGradientHover" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#1487C5" />
                    <stop offset="100%" stopColor="#011AFE" />
                  </linearGradient>
                </defs>
                <path d="M8.07692 13.1923C8.07692 13.0436 7.95638 12.9231 7.80769 12.9231H1.88462C1.73592 12.9231 1.61538 13.0436 1.61538 13.1923V19.1154C1.61538 19.2641 1.73592 19.3846 1.88462 19.3846H7.80769C7.95638 19.3846 8.07692 19.2641 8.07692 19.1154V13.1923ZM19.3846 13.1923C19.3846 13.0436 19.2641 12.9231 19.1154 12.9231H13.1923C13.0436 12.9231 12.9231 13.0436 12.9231 13.1923V19.1154C12.9231 19.2641 13.0436 19.3846 13.1923 19.3846H19.1154C19.2641 19.3846 19.3846 19.2641 19.3846 19.1154V13.1923ZM8.07692 1.88462C8.07692 1.73592 7.95638 1.61538 7.80769 1.61538H1.88462C1.73592 1.61538 1.61538 1.73592 1.61538 1.88462V7.80769C1.61538 7.95638 1.73592 8.07692 1.88462 8.07692H7.80769C7.95638 8.07692 8.07692 7.95638 8.07692 7.80769V1.88462ZM19.3846 1.88462C19.3846 1.73592 19.2641 1.61538 19.1154 1.61538H13.1923C13.0436 1.61538 12.9231 1.73592 12.9231 1.88462V7.80769C12.9231 7.95638 13.0436 8.07692 13.1923 8.07692H19.1154C19.2641 8.07692 19.3846 7.95638 19.3846 7.80769V1.88462ZM9.69231 19.1154C9.69231 20.1562 8.84854 21 7.80769 21H1.88462C0.843771 21 3.03543e-08 20.1562 0 19.1154V13.1923C0 12.1515 0.843771 11.3077 1.88462 11.3077H7.80769C8.84854 11.3077 9.69231 12.1515 9.69231 13.1923V19.1154ZM21 19.1154C21 20.1562 20.1562 21 19.1154 21H13.1923C12.1515 21 11.3077 20.1562 11.3077 19.1154V13.1923C11.3077 12.1515 12.1515 11.3077 13.1923 11.3077H19.1154C20.1562 11.3077 21 12.1515 21 13.1923V19.1154ZM9.69231 7.80769C9.69231 8.84854 8.84854 9.69231 7.80769 9.69231H1.88462C0.843771 9.69231 3.03543e-08 8.84854 0 7.80769V1.88462C0 0.843771 0.843771 3.03543e-08 1.88462 0H7.80769C8.84854 0 9.69231 0.843771 9.69231 1.88462V7.80769ZM21 7.80769C21 8.84854 20.1562 9.69231 19.1154 9.69231H13.1923C12.1515 9.69231 11.3077 8.84854 11.3077 7.80769V1.88462C11.3077 0.843771 12.1515 3.03543e-08 13.1923 0H19.1154C20.1562 0 21 0.843771 21 1.88462V7.80769Z" fill="currentColor" />
              </svg>
            </button>

            {/* Category Dropdown */}
            {isCategoryOpen && categoryDropdownPosition && createPortal(
              <React.Fragment>
                <div className="category-dropdown-backdrop" onClick={() => setIsCategoryOpen(false)}></div>
                <div
                  ref={categoryDropdownRef}
                  className="category-dropdown-menu"
                  style={{
                    position: 'fixed',
                    top: `${categoryDropdownPosition.top}px`,
                    right: `${categoryDropdownPosition.right}px`
                  }}
                >
                  <div className="category-dropdown-header">
                    <h3 className="category-dropdown-title">{getVideoFilesTranslations().videosAndFiles.title}</h3>
                  </div>
                  <div className="category-content">
                    {/* Videos Section */}
                    <div className="category-section">
                      <div className="category-section-title">{getVideoFilesTranslations().videosAndFiles.videosSection}</div>
                      <div className="category-items-list">
                        {mockVideos.map((video) => (
                          <button
                            key={video.id}
                            className="category-item video-item"
                            onClick={() => handleVideoClick(video)}
                          >
                            <div className="video-thumbnail-preview">
                              <img
                                src={`https://img.youtube.com/vi/${video.youtubeId}/mqdefault.jpg`}
                                alt={getVideoTitle(video.titleKey)}
                                className="video-thumbnail-img"
                              />
                              <div className="video-play-overlay">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M8 5V19L19 12L8 5Z" fill="currentColor" />
                                </svg>
                              </div>
                            </div>
                            <div className="category-item-content">
                              <div className="category-item-title">{getVideoTitle(video.titleKey)}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Files Section */}
                    <div className="category-section">
                      <div className="category-section-title">{getVideoFilesTranslations().videosAndFiles.filesSection}</div>
                      <div className="category-items-list">
                        {mockFiles.map((file) => (
                          <button
                            key={file.id}
                            className="category-item file-item"
                            onClick={() => handleFileClick(file)}
                          >
                            <div className="file-icon">
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                            <div className="category-item-content">
                              <div className="category-item-title">{getFileName(file.nameKey)}</div>
                              <div className="category-item-meta">
                                <span>{file.type}</span>
                                <span>•</span>
                                <span>{file.size}</span>
                                <span>•</span>
                                <span>{getFileTimestamp(file.timestampKey)}</span>
                              </div>
                            </div>
                            <div className="file-download-icon">
                              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17.5 12.5V15.8333C17.5 16.2754 17.3244 16.6993 17.0118 17.0118C16.6993 17.3244 16.2754 17.5 15.8333 17.5H4.16667C3.72464 17.5 3.30072 17.3244 2.98816 17.0118C2.67559 16.6993 2.5 16.2754 2.5 15.8333V12.5M10 12.5V2.5M10 12.5L6.66667 9.16667M10 12.5L13.3333 9.16667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </React.Fragment>,
              document.body
            )}

            {/* Video Player Modal */}
            {selectedVideo && createPortal(
              <React.Fragment>
                <div className="video-player-backdrop" onClick={closeVideoPlayer}></div>
                <div className="video-player-modal">
                  <button className="video-player-close" onClick={closeVideoPlayer} aria-label={getVideoFilesTranslations().videoPlayer.closeButton}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <div className="video-player-header">
                    <h3 className="video-player-title">{getVideoTitle(selectedVideo.titleKey)}</h3>
                  </div>
                  <div className="video-player-container">
                    <iframe
                      className="video-player"
                      src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1&rel=0`}
                      title={getVideoTitle(selectedVideo.titleKey)}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                </div>
              </React.Fragment>,
              document.body
            )}
            <div className="header-color-selector">
              <button
                ref={colorButtonRef}
                className={`icon-button color-button ${isColorOpen ? 'open' : ''}`}
                onClick={() => setIsColorOpen(!isColorOpen)}
                aria-expanded={isColorOpen}
                aria-haspopup="true"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="iconGradientHover" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#1487C5" />
                      <stop offset="100%" stopColor="#011AFE" />
                    </linearGradient>
                  </defs>
                  <path d="M8.50299 0.20289C11.5907 -0.358302 15.2003 0.272508 18.0661 1.75123C20.9127 3.22005 23.2541 5.66092 23.3309 8.84438C23.3592 10.0238 23.1416 11.0163 22.6986 11.8289C22.2529 12.6464 21.6081 13.2268 20.8709 13.6214C19.4337 14.3907 17.6432 14.4591 16.153 14.3319C15.8544 14.3065 15.4974 14.4798 15.2426 14.8625C14.9859 15.248 14.9672 15.6437 15.0965 15.8943C15.4141 16.5095 15.8506 17.0613 16.3821 17.5209L16.6158 17.7126L16.6251 17.7196L16.6345 17.7278C17.3919 18.3494 17.9137 19.0885 17.9481 19.9328C17.9833 20.8026 17.4929 21.4843 16.8986 21.9521C15.7438 22.8611 13.7742 23.3333 11.7904 23.3333C9.64285 23.3332 7.00362 22.2705 4.80653 20.5662C2.59781 18.8528 0.696216 16.3825 0.190348 13.4298C-0.807041 7.60621 2.13727 1.35996 8.50299 0.20289ZM17.2434 3.34631C14.6938 2.03078 11.4841 1.48527 8.82437 1.96858C3.69507 2.90091 1.07851 7.98013 1.95969 13.126C2.36727 15.5058 3.93205 17.6152 5.90741 19.1476C7.89423 20.6887 10.156 21.5383 11.7904 21.5384C13.5888 21.5384 15.0865 21.0941 15.7884 20.5416C16.1217 20.2792 16.1576 20.094 16.1542 20.0064C16.1496 19.8937 16.0683 19.5844 15.4962 19.1148H15.495C14.6628 18.4653 13.9818 17.6477 13.5013 16.717C12.9955 15.7365 13.2347 14.6375 13.7479 13.8668C14.2632 13.0933 15.1892 12.4487 16.3061 12.544C17.6891 12.662 19.0517 12.5594 20.0236 12.0392C20.4908 11.7891 20.8644 11.4448 21.1233 10.97C21.3848 10.4904 21.5583 9.82351 21.5358 8.88762C21.4817 6.64389 19.8121 4.67185 17.2434 3.34631ZM9.63191 15.4152C9.63191 14.7576 9.07392 14.1756 8.32418 14.1753C7.5742 14.1753 7.01529 14.7574 7.01529 15.4152C7.01555 16.0728 7.57437 16.6539 8.32418 16.6539C9.07375 16.6536 9.63165 16.0726 9.63191 15.4152ZM9.002 8.08832C9.002 7.43056 8.4431 6.84848 7.69311 6.84848C6.94323 6.84859 6.38422 7.43063 6.38422 8.08832C6.38422 8.74601 6.94323 9.32805 7.69311 9.32816C8.4431 9.32816 9.002 8.74608 9.002 8.08832ZM17.1966 8.08832C17.1966 7.43056 16.6377 6.84848 15.8877 6.84848C15.1379 6.84866 14.5788 7.43066 14.5788 8.08832C14.5788 8.74598 15.1379 9.32799 15.8877 9.32816C16.6377 9.32816 17.1966 8.74608 17.1966 8.08832ZM11.427 15.4152C11.4267 17.1174 10.0108 18.4485 8.32418 18.4488C6.63734 18.4488 5.22049 17.1175 5.22024 15.4152C5.22024 13.7126 6.63719 12.3804 8.32418 12.3804C10.011 12.3807 11.427 13.7128 11.427 15.4152ZM10.7971 8.08832C10.7971 9.79088 9.3801 11.1231 7.69311 11.1231C6.00621 11.123 4.58917 9.79081 4.58916 8.08832C4.58916 6.38583 6.00621 5.05369 7.69311 5.05358C9.38011 5.05358 10.7971 6.38576 10.7971 8.08832ZM18.9917 8.08832C18.9917 9.79088 17.5747 11.1231 15.8877 11.1231C14.2009 11.1229 12.7838 9.79077 12.7838 8.08832C12.7838 6.38587 14.2009 5.05376 15.8877 5.05358C17.5747 5.05358 18.9917 6.38576 18.9917 8.08832Z" fill="currentColor" />
                </svg>
              </button>

              {isColorOpen && colorDropdownPosition && createPortal(
                <React.Fragment>
                  <div className="color-dropdown-backdrop" onClick={() => setIsColorOpen(false)}></div>
                  <div
                    ref={colorDropdownRef}
                    className="color-dropdown-menu"
                    style={{
                      position: 'fixed',
                      top: `${colorDropdownPosition.top}px`,
                      right: `${colorDropdownPosition.right}px`
                    }}
                  >
                    <div className="color-dropdown-header">
                      <h3 className="color-dropdown-title">{getVideoFilesTranslations().themeSwitch.title}</h3>
                    </div>
                    <div className="theme-options-container">
                      {colorOptions.map((theme) => (
                        <button
                          key={theme.value}
                          className={`theme-option ${selectedColor === theme.value ? 'selected' : ''}`}
                          style={{ background: theme.gradient }}
                          onClick={() => handleColorSelect(theme.value)}
                          aria-label={theme.label}
                        >
                          {selectedColor === theme.value && (
                            <svg
                              className="theme-check-icon"
                              width="20"
                              height="20"
                              viewBox="0 0 20 20"
                              fill="none"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <circle cx="10" cy="10" r="9" fill="white" />
                              <path
                                d="M6 10L9 13L14 7"
                                stroke="#000000"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                </React.Fragment>,
                document.body
              )}
            </div>
            <div className="header-language-selector">
              <button
                ref={languageButtonRef}
                className={`icon-button language-button ${isLanguageOpen ? 'open' : ''}`}
                onClick={() => setIsLanguageOpen(!isLanguageOpen)}
                aria-expanded={isLanguageOpen}
                aria-haspopup="true"
              >
                <svg width="24" height="24" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23.872 14C23.872 13.3557 23.8084 12.7267 23.6908 12.1175C22.6383 13.6852 21.2166 14.9834 19.5484 15.8872C19.3439 17.3853 18.9139 18.9574 18.3027 20.4083C17.8309 21.5283 17.2349 22.6106 16.5265 23.5435C20.7544 22.4272 23.872 18.5786 23.872 14ZM17.5794 16.7286C16.4514 17.0919 15.2492 17.2906 14.0002 17.2906C12.7508 17.2906 11.548 17.0921 10.4198 16.7286C10.6306 17.7257 10.9451 18.7452 11.3523 19.7118C12.0449 21.356 12.965 22.7573 14.0002 23.6428C15.0354 22.7573 15.9555 21.356 16.6481 19.7118C17.0552 18.7453 17.3686 17.7256 17.5794 16.7286ZM14.0002 4.35611C12.9647 5.24155 12.045 6.64379 11.3523 8.28824C10.5564 10.1776 10.1113 12.2685 10.1113 14C10.1113 14.2302 10.1192 14.4667 10.1346 14.7082C11.3222 15.2141 12.6282 15.4958 14.0002 15.4958C15.3717 15.4958 16.6772 15.2138 17.8645 14.7082C17.88 14.4666 17.8891 14.2302 17.8891 14C17.8891 12.2685 17.444 10.1776 16.6481 8.28824C15.9553 6.64379 15.0356 5.24155 14.0002 4.35611ZM11.4726 4.45544C8.62845 5.20659 6.28653 7.19489 5.05852 9.81201C5.79176 11.3747 6.92251 12.7125 8.31991 13.6974C8.3676 11.7658 8.86576 9.56662 9.69761 7.59179C10.1694 6.47175 10.7642 5.38831 11.4726 4.45544ZM16.5265 4.45544C17.2351 5.38844 17.8308 6.47152 18.3027 7.59179C19.1346 9.56661 19.6316 11.7658 19.6792 13.6974C21.0769 12.7125 22.2073 11.3748 22.9406 9.81201C21.7124 7.19478 19.371 5.20632 16.5265 4.45544ZM4.12837 14C4.12837 18.5783 7.24535 22.4269 11.4726 23.5435C10.7645 22.6108 10.1693 21.528 9.69761 20.4083C9.08642 18.9573 8.65527 17.3853 8.45078 15.8872C6.78274 14.9833 5.36066 13.6851 4.30832 12.1175C4.19078 12.7266 4.12837 13.3558 4.12837 14ZM25.6668 14C25.6668 20.4434 20.4435 25.6667 14.0002 25.6667C7.55684 25.6667 2.3335 20.4434 2.3335 14C2.3335 12.3925 2.6587 10.8585 3.24846 9.46261L3.4214 9.07349C5.27783 5.09373 9.31584 2.33337 14.0002 2.33337C18.8357 2.33337 22.9825 5.27483 24.7519 9.46261L24.9599 9.99313C25.4172 11.2437 25.6668 12.5936 25.6668 14Z" fill="currentColor" />
                </svg>
              </button>

              {isLanguageOpen && languageDropdownPosition && createPortal(
                <React.Fragment>
                  <div className="language-dropdown-backdrop" onClick={() => setIsLanguageOpen(false)}></div>
                  <div
                    ref={languageDropdownRef}
                    className="language-dropdown-menu"
                    style={{
                      position: 'fixed',
                      top: `${languageDropdownPosition.top}px`,
                      right: `${languageDropdownPosition.right}px`
                    }}
                  >
                    <div className="language-items-list">
                      <button
                        className={`language-dropdown-item ${currentLocale === 'uz-Latn' ? 'active' : ''}`}
                        onClick={() => handleLocaleChange('uz-Latn')}
                      >
                        <div className="language-item-content">
                          {renderFlag('uz-Latn')}
                          <span className="language-item-label">O'zbekcha</span>
                        </div>
                        {currentLocale === 'uz-Latn' && (
                          <svg
                            className="language-check-icon"
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
                      </button>
                      <button
                        className={`language-dropdown-item ${currentLocale === 'uz-Cyrl' ? 'active' : ''}`}
                        onClick={() => handleLocaleChange('uz-Cyrl')}
                      >
                        <div className="language-item-content">
                          {renderFlag('uz-Cyrl')}
                          <span className="language-item-label">Ўзбекча</span>
                        </div>
                        {currentLocale === 'uz-Cyrl' && (
                          <svg
                            className="language-check-icon"
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
                      </button>
                      <button
                        className={`language-dropdown-item ${currentLocale === 'ru' ? 'active' : ''}`}
                        onClick={() => handleLocaleChange('ru')}
                      >
                        <div className="language-item-content">
                          {renderFlag('ru')}
                          <span className="language-item-label">Русский</span>
                        </div>
                        {currentLocale === 'ru' && (
                          <svg
                            className="language-check-icon"
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
                      </button>
                    </div>
                  </div>
                </React.Fragment>,
                document.body
              )}
            </div>
          </div>

          {/* User Avatar */}
          <div className="header-profile-selector">
            <button
              ref={profileButtonRef}
              className={`user-avatar profile-button ${isProfileOpen ? 'open' : ''}`}
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              aria-expanded={isProfileOpen}
              aria-haspopup="true"
              title={userDisplayInfo.displayName || getTranslation('account')}
            >
              {userInitial}
            </button>

            {isProfileOpen && profileDropdownPosition && createPortal(
              <div className="language-dropdown-backdrop" onClick={() => setIsProfileOpen(false)}>
                <div
                  ref={profileDropdownRef}
                  className="language-dropdown-menu profile-account-dropdown-menu"
                  style={{
                    position: 'fixed',
                    top: `${profileDropdownPosition.top}px`,
                    right: `${profileDropdownPosition.right}px`,
                  }}
                >
                  <div className="language-dropdown-header profile-account-dropdown-header">
                    <div className="language-dropdown-title profile-account-dropdown-title">
                      {userDisplayInfo.displayName || getTranslation('account')}
                    </div>
                  </div>
                  <div className="language-items-list">
                    <button
                      type="button"
                      className="language-dropdown-item profile-logout-dropdown-item"
                      onClick={handleLogout}
                    >
                      <div className="language-item-content">
                        <svg
                          className="profile-logout-dropdown-icon"
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                          aria-hidden
                        >
                          <path
                            d="M6 14H3C2.46957 14 1.96086 13.7893 1.58579 13.4142C1.21071 13.0391 1 12.5304 1 12V4C1 3.46957 1.21071 2.96086 1.58579 2.58579C1.96086 2.21071 2.46957 2 3 2H6M11 11L15 8M15 8L11 5M15 8H6"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <span className="language-item-label">{getTranslation('logout')}</span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        </div>
      </header>

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentLocale={currentLocale}
      />
    </div>
  );
};

export default Widget;


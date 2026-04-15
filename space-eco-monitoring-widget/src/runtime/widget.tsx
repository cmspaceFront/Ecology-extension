/** @jsx jsx */
import { AllWidgetProps, jsx, LinkType, jimuHistory } from 'jimu-core';
import { useState, useEffect, useCallback, useRef } from 'react';

const FALLING_STAR_IDS = Array.from({ length: 8 }, (_, index) => index + 1);
const GRADIENT_CYCLE_MS = 9000;
const STARS_VISIBLE_MS = 4200;
const INITIAL_STARS_DELAY_MS = 1200;
import { IMConfig } from '../config';
import Earth3D from './components/Earth3D';
import Header from './components/Header';
import './style.css';

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const { config } = props;
  const [currentLocale, setCurrentLocale] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('customLocal');
      if (stored && (stored === 'uz-Latn' || stored === 'uz-Cyrl' || stored === 'ru')) {
        return stored;
      }
    } catch (e) {
      console.warn('Error reading locale from localStorage:', e);
    }
    return 'ru';
  });
  const [displayedText1, setDisplayedText1] = useState<string>('');
  const [displayedText2, setDisplayedText2] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(true);
  const [earthReady, setEarthReady] = useState<boolean>(false);
  const [areStarsActive, setAreStarsActive] = useState<boolean>(false);

  const fullText1 = 'SPACE ECO';
  const fullText2 = 'MONITORING';
  const fallingStars = FALLING_STAR_IDS;
  
  // Use ref to track if component is mounted
  const isMountedRef = useRef(true);
  const earthReadyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleEarthReady = useCallback(() => {
    if (isMountedRef.current) {
      setEarthReady(true);
    }
  }, []);

  // Safe localStorage access helper
  const safeGetLocalStorage = (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`Error accessing localStorage key "${key}":`, e);
      return null;
    }
  };

  useEffect(() => {
    isMountedRef.current = true;

    // Force full-viewport rendering regardless of portal container constraints
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyMargin = body.style.margin;
    const prevBodyPadding = body.style.padding;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.margin = '0';
    body.style.padding = '0';

    return () => {
      isMountedRef.current = false;
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.margin = prevBodyMargin;
      body.style.padding = prevBodyPadding;
      // Cleanup Earth3D fallback timeout on unmount
      if (earthReadyTimeoutRef.current) {
        clearTimeout(earthReadyTimeoutRef.current);
        earthReadyTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const checkLocale = () => {
      if (!isMountedRef.current) return;
      
      const stored = safeGetLocalStorage('customLocal');
      if (stored && (stored === 'uz-Latn' || stored === 'uz-Cyrl' || stored === 'ru')) {
        setCurrentLocale(stored);
      } else {
        setCurrentLocale('ru');
      }
    };

    // Check immediately
    checkLocale();
    
    // Listen for storage events (cross-tab)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'customLocal' || e.key === null) {
        checkLocale();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Poll for changes in same tab (with error handling)
    const interval = setInterval(() => {
      try {
        checkLocale();
      } catch (e) {
        console.warn('Error in locale check interval:', e);
      }
    }, 500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Typewriter animation effect - properly reset on mount
  useEffect(() => {
    // Reset state on mount
    setDisplayedText1('');
    setDisplayedText2('');
    setIsTyping(true);
    
    let currentIndex1 = 0;
    let currentIndex2 = 0;
    let typingTimeout: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const typeText = () => {
      if (isCancelled || !isMountedRef.current) {
        return;
      }

      // Type first line
      if (currentIndex1 < fullText1.length) {
        setDisplayedText1(fullText1.substring(0, currentIndex1 + 1));
        currentIndex1++;
        typingTimeout = setTimeout(typeText, 80);
      }
      // Wait a bit before starting second line
      else if (currentIndex1 === fullText1.length && currentIndex2 === 0) {
        typingTimeout = setTimeout(() => {
          if (isCancelled || !isMountedRef.current) return;
          currentIndex2 = 1;
          setDisplayedText2(fullText2.substring(0, 1));
          typingTimeout = setTimeout(typeText, 80);
        }, 300);
      }
      // Type second line
      else if (currentIndex2 < fullText2.length) {
        setDisplayedText2(fullText2.substring(0, currentIndex2 + 1));
        currentIndex2++;
        typingTimeout = setTimeout(typeText, 80);
      }
      // Animation complete
      else {
        setIsTyping(false);
      }
    };

    // Start typing after a short delay
    typingTimeout = setTimeout(() => {
      if (!isCancelled && isMountedRef.current) {
        typeText();
      }
    }, 500);

    return () => {
      isCancelled = true;
      if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
      }
    };
  }, []); // Empty deps - only run on mount

  const logoUrl = (config.logoImageParam as any)?.originalUrl || (config.logoImageParam as any)?.url || config.logoUrl || '';
  const earthScale = config.earthScale || 4;
  const earthRotationSpeed = config.earthRotationSpeed || 0.5;
  const atmosphereRotationSpeed = config.atmosphereRotationSpeed !== undefined ? config.atmosphereRotationSpeed : 0.11;
  const earthPositionY =
    typeof config.earthPositionY === 'number' ? config.earthPositionY : 0;

  // Fallback: if Earth3D doesn't call ready callback within reasonable time, enable stars anyway
  useEffect(() => {
    // Clear any existing timeout if earth becomes ready
    if (earthReady) {
      if (earthReadyTimeoutRef.current) {
        clearTimeout(earthReadyTimeoutRef.current);
        earthReadyTimeoutRef.current = null;
      }
      return;
    }

    // Set a fallback timeout (10 seconds) to enable stars even if Earth3D callback doesn't fire
    earthReadyTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        // Double-check earthReady state before setting
        setEarthReady((prevReady) => {
          if (!prevReady) {
            console.warn('Earth3D ready callback not received, enabling stars as fallback');
            return true;
          }
          return prevReady;
        });
      }
      earthReadyTimeoutRef.current = null;
    }, 10000);

    return () => {
      if (earthReadyTimeoutRef.current) {
        clearTimeout(earthReadyTimeoutRef.current);
        earthReadyTimeoutRef.current = null;
      }
    };
  }, [earthReady]);

  useEffect(() => {
    if (!earthReady || !isMountedRef.current) return;

    let hideTimeout: NodeJS.Timeout | null = null;
    let intervalId: NodeJS.Timeout | null = null;
    let initialTimeout: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const startCycle = () => {
      if (isCancelled || !isMountedRef.current) return;
      
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      setAreStarsActive(true);
      hideTimeout = setTimeout(() => {
        if (!isCancelled && isMountedRef.current) {
          setAreStarsActive(false);
        }
        hideTimeout = null;
      }, STARS_VISIBLE_MS);
    };

    initialTimeout = setTimeout(() => {
      if (!isCancelled && isMountedRef.current) {
        startCycle();
        intervalId = setInterval(() => {
          if (!isCancelled && isMountedRef.current) {
            startCycle();
          } else if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
        }, GRADIENT_CYCLE_MS);
      }
    }, INITIAL_STARS_DELAY_MS);

    return () => {
      isCancelled = true;
      if (initialTimeout) {
        clearTimeout(initialTimeout);
        initialTimeout = null;
      }
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    };
  }, [earthReady]);

  const handleDashboardClick = useCallback(() => {
    try {
      const linkParam = config?.linkParam;

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
          const currentUrl = window.top?.location?.href?.split('#')[0] || window.location.href.split('#')[0];
          if (window.top) {
            window.top.location.href = `${currentUrl}page/${targetPage}/`;
          } else {
            jimuHistory.changePage(targetPage);
          }
        } else {
          jimuHistory.changePage(targetPage);
        }
      }
    } catch (error) {
      console.error('Error handling dashboard click:', error);
    }
  }, [config]);

  return (
    <div className="space-eco-monitoring-widget">
      {/* SVG Filter for Glass Effect */}
      <svg style={{ display: 'none', position: 'absolute' }}>
        <filter id="lg-dist" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="70" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <Earth3D
        glbUrl=""
        autoRotateSpeed={earthRotationSpeed}
        earthScale={earthScale}
        earthPositionY={earthPositionY}
        onEarthReady={handleEarthReady}
        context={props.context}
      />

      {/* Header with Logo, Language and Logout buttons */}
      <Header
        logoUrl={logoUrl}
        currentLocale={currentLocale}
        onLocaleChange={setCurrentLocale}
      />

      {/* Main Title */}
      <div className="space-eco-title-container">
        <h1 className="space-eco-title-line1">
          {displayedText1}
          {displayedText1.length < fullText1.length && <span className="typewriter-cursor">|</span>}
        </h1>
        <h1 className="space-eco-title-line2">
          {displayedText2}
          {displayedText1 === fullText1 && displayedText2.length < fullText2.length && <span className="typewriter-cursor">|</span>}
        </h1>
      </div>

      {/* View Dashboard Button */}
      <button className="space-eco-dashboard-button" onClick={handleDashboardClick}>
        <span>VIEW DASHBOARD</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 26 30"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.19995 22.4L22.4 3.20001M22.4 3.20001H7.03995M22.4 3.20001V18.56"
            stroke="white"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Website URL */}
      <a href="https://uzspace.uz" target="_blank" rel="noopener noreferrer" className="space-eco-website-url">uzspace.uz</a>

      {/* Falling Stars Effect */}
      <div className={`falling-stars-layer ${earthReady ? 'ready' : ''} ${areStarsActive ? 'visible' : ''}`}>
        {fallingStars.map((starId) => (
          <span key={`falling-star-${starId}`} className={`falling-star falling-star-${starId}`}></span>
        ))}
      </div>
    </div>
  );
};

export default Widget;
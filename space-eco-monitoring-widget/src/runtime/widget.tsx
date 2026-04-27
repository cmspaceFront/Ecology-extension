/** @jsx jsx */
import { AllWidgetProps, jsx, LinkType, jimuHistory } from 'jimu-core';
import { useState, useEffect, useCallback } from 'react';

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
  const [currentLocale, setCurrentLocale] = useState<string>('ru');
  const [displayedText1, setDisplayedText1] = useState<string>('');
  const [displayedText2, setDisplayedText2] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(true);
  const [earthReady, setEarthReady] = useState<boolean>(false);
  const [areStarsActive, setAreStarsActive] = useState<boolean>(false);

  const fullText1 = 'SPACE ECO';
  const fullText2 = 'MONITORING';
  const fallingStars = FALLING_STAR_IDS;
  const handleEarthReady = useCallback(() => {
    setEarthReady(true);
  }, []);

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

  // Typewriter animation effect
  useEffect(() => {
    let currentIndex1 = 0;
    let currentIndex2 = 0;
    let typingTimeout: NodeJS.Timeout;

    const typeText = () => {
      // Type first line
      if (currentIndex1 < fullText1.length) {
        setDisplayedText1(fullText1.substring(0, currentIndex1 + 1));
        currentIndex1++;
        typingTimeout = setTimeout(typeText, 80); // 80ms per character for smooth typing
      }
      // Wait a bit before starting second line
      else if (currentIndex1 === fullText1.length && currentIndex2 === 0) {
        typingTimeout = setTimeout(() => {
          currentIndex2 = 1;
          setDisplayedText2(fullText2.substring(0, 1));
          typingTimeout = setTimeout(typeText, 80);
        }, 300); // 300ms pause between lines
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
    typingTimeout = setTimeout(typeText, 500);

    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, []);

  const logoUrl = (config.logoImageParam as any)?.originalUrl || (config.logoImageParam as any)?.url || config.logoUrl || '';
  const earthScale = config.earthScale || 4;
  const earthRotationSpeed = config.earthRotationSpeed || 0.5;
  const atmosphereRotationSpeed = config.atmosphereRotationSpeed !== undefined ? config.atmosphereRotationSpeed : 0.11;
  const earthPositionY =
    typeof config.earthPositionY === 'number' ? config.earthPositionY : 0;

  useEffect(() => {
    if (!earthReady) return;

    let hideTimeout: NodeJS.Timeout | undefined;
    let intervalId: NodeJS.Timeout | undefined;
    let initialTimeout: NodeJS.Timeout | undefined;

    const startCycle = () => {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
      setAreStarsActive(true);
      hideTimeout = setTimeout(() => {
        setAreStarsActive(false);
        hideTimeout = undefined;
      }, STARS_VISIBLE_MS);
    };

    initialTimeout = setTimeout(() => {
      startCycle();
      intervalId = setInterval(startCycle, GRADIENT_CYCLE_MS);
    }, INITIAL_STARS_DELAY_MS);

    return () => {
      if (initialTimeout) {
        clearTimeout(initialTimeout);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (hideTimeout) {
        clearTimeout(hideTimeout);
      }
    };
  }, [earthReady]);

  const handleDashboardClick = () => {
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
    }
  };

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
        atmosphereRotationSpeed={atmosphereRotationSpeed}
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


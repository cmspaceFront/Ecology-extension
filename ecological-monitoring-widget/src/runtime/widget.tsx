/** @jsx jsx */
import { AllWidgetProps, jsx } from 'jimu-core';
import { useState, useEffect, useMemo } from 'react';
import { IMConfig } from '../config';
import { DEFAULT_MONITORING_CARDS } from '../cards-data';
import Earth3D from './components/Earth3D';
import Carousel from './components/Carousel';
import Header from './components/Header';
import './style.css';

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const { config } = props;
  const [currentLocale, setCurrentLocale] = useState<string>('ru');
  const [displayedText1, setDisplayedText1] = useState<string>('');
  const [displayedText2, setDisplayedText2] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(true);

  const titleParts = useMemo(() => {
    if (currentLocale === 'uz-Cyrl') {
      return { fullText1: 'ЭКОЛОГИК МОНИТОРИНГ', fullText2: 'ЙЎНАЛИШЛАРИ' };
    }
    if (currentLocale === 'uz-Latn') {
      return { fullText1: 'EKOLOGIK MONITORING', fullText2: "YO'NALISHLARI" };
    }
    // ru и остальное
    return { fullText1: 'НАПРАВЛЕНИИ ЭКОЛОГИЧЕСКОГО', fullText2: 'МОНИТОРИНГА' };
  }, [currentLocale]);

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

  useEffect(() => {
    let currentIndex1 = 0;
    let currentIndex2 = 0;
    let typingTimeout: NodeJS.Timeout;

    // reset when locale changes
    setDisplayedText1('');
    setDisplayedText2('');
    setIsTyping(true);

    const typeText = () => {
      if (currentIndex1 < titleParts.fullText1.length) {
        setDisplayedText1(titleParts.fullText1.substring(0, currentIndex1 + 1));
        currentIndex1++;
        typingTimeout = setTimeout(typeText, 80);
      } else if (currentIndex1 === titleParts.fullText1.length && currentIndex2 === 0) {
        typingTimeout = setTimeout(() => {
          currentIndex2 = 1;
          setDisplayedText2(titleParts.fullText2.substring(0, 1));
          typingTimeout = setTimeout(typeText, 80);
        }, 300);
      } else if (currentIndex2 < titleParts.fullText2.length) {
        setDisplayedText2(titleParts.fullText2.substring(0, currentIndex2 + 1));
        currentIndex2++;
        typingTimeout = setTimeout(typeText, 80);
      } else {
        setIsTyping(false);
      }
    };

    typingTimeout = setTimeout(typeText, 200);

    return () => {
      if (typingTimeout) {
        clearTimeout(typingTimeout);
      }
    };
  }, [titleParts]);

  const logoUrl = (config.logoImageParam as any)?.originalUrl || (config.logoImageParam as any)?.url || config.logoUrl || '';
  const earthScale = config.earthScale || 4;
  const earthRotationSpeed = config.earthRotationSpeed || 0.5;
  const earthPositionY = config.earthPositionY || -2;

  return (
    <div className="ecological-monitoring-widget" data-locale={currentLocale}>
      <Earth3D
        glbUrl=""
        autoRotateSpeed={earthRotationSpeed}
        earthScale={earthScale}
        earthPositionY={earthPositionY}
        context={props.context}
      />
      <Header
        logoUrl={logoUrl}
        logoLinkParam={config.linkParam}
        currentLocale={currentLocale}
        onLocaleChange={setCurrentLocale}
      />
      <div className="ecological-title-container">
        <h1 className="ecological-title-line1">
          {displayedText1}
          {displayedText1.length < titleParts.fullText1.length && <span className="typewriter-cursor">|</span>}
        </h1>
        <h1 className="ecological-title-line2">
          {displayedText2}
          {displayedText1 === titleParts.fullText1 && displayedText2.length < titleParts.fullText2.length && isTyping && (
            <span className="typewriter-cursor">|</span>
          )}
        </h1>
      </div>
      <Carousel
        cards={DEFAULT_MONITORING_CARDS}
        currentLocale={currentLocale}
        cardLinkParams={config.cardLinkParams}
        transitionDuration={config.carouselTransitionDuration}
        autoRotateInterval={config.carouselAutoRotateInterval}
        context={props.context}
      />
    </div>
  );
};

export default Widget;


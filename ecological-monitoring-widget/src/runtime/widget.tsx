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


  const logoUrl = (config.logoImageParam as any)?.originalUrl || (config.logoImageParam as any)?.url || config.logoUrl || '';
  const earthScale = config.earthScale ?? 4;
  const earthRotationSpeed = config.earthRotationSpeed ?? 0.5;
  // Только смещение GLB по оси Y из настроек. Читаем glbPositionY и старые ключи для совместимости.
  const rawY = config.glbPositionY ?? config.earthVerticalPosition ?? config.earthPositionY;
  const glbPositionY = typeof rawY === 'number' && !Number.isNaN(rawY) ? rawY : -2;

  return (
    <div className="ecological-monitoring-widget" data-locale={currentLocale}>
      <Earth3D
        glbUrl=""
        autoRotateSpeed={earthRotationSpeed}
        earthScale={earthScale}
        glbPositionY={glbPositionY}
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
          {titleParts.fullText1}
        </h1>
        <h1 className="ecological-title-line2">
          {titleParts.fullText2}
        </h1>
      </div>
      <Carousel
        cards={DEFAULT_MONITORING_CARDS}
        currentLocale={currentLocale}
        cardLinkParams={config.cardLinkParams}
        transitionDuration={config.carouselTransitionDuration}
        context={props.context}
      />
    </div>
  );
};

export default Widget;


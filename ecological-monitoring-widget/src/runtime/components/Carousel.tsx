import React, { useState, useEffect, useRef } from 'react';
import { LinkType, jimuHistory } from 'jimu-core';
import type { IMLinkParam } from 'jimu-core';

import type { WidgetContext } from 'jimu-core';
import { MonitoringCard } from '../../config';
import Card from './Card';
import './Carousel.css';

interface CarouselProps {
  cards: MonitoringCard[];
  currentLocale: string;
  cardLinkParams?: Record<string, IMLinkParam>;
  transitionDuration?: number;
  context?: WidgetContext;
}

const DEFAULT_TRANSITION_DURATION = 900;
const TRANSITION_LOCK_MAX = 450; // более короткая блокировка для отзывчивости
const TRANSITION_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const Carousel: React.FC<CarouselProps> = ({
  cards,
  currentLocale,
  cardLinkParams,
  transitionDuration = DEFAULT_TRANSITION_DURATION,
  context
}) => {
  const [centerIndex, setCenterIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const wasSwipeRef = useRef(false);
  const transitionTimeoutRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const swipeOffsetRef = useRef(0);
  const swipeAnimationRef = useRef<number | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const touchEndY = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const startTransition = React.useCallback((direction: 'next' | 'prev') => {
    setTransitionDirection(direction);
    setIsTransitioning(true);
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
    const lockDuration = Math.min(transitionDuration, TRANSITION_LOCK_MAX);
    transitionTimeoutRef.current = window.setTimeout(() => {
      setIsTransitioning(false);
    }, lockDuration);
  }, [transitionDuration]);

  useEffect(() => {
    swipeOffsetRef.current = swipeOffset;
  }, [swipeOffset]);

  const smoothResetSwipeOffset = React.useCallback(() => {
    if (swipeAnimationRef.current) {
      cancelAnimationFrame(swipeAnimationRef.current);
    }

    const startValue = swipeOffsetRef.current;
    if (Math.abs(startValue) < 0.5) {
      setSwipeOffset(0);
      swipeOffsetRef.current = 0;
      return;
    }

    const duration = Math.min(transitionDuration * 0.6, 900);
    const startTime = performance.now();

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (timestamp: number) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      const nextValue = startValue * (1 - eased);
      setSwipeOffset(nextValue);
      swipeOffsetRef.current = nextValue;

      if (progress < 1) {
        swipeAnimationRef.current = requestAnimationFrame(animate);
      } else {
        swipeAnimationRef.current = null;
        setSwipeOffset(0);
        swipeOffsetRef.current = 0;
      }
    };

    swipeAnimationRef.current = requestAnimationFrame(animate);
  }, [transitionDuration]);

  useEffect(() => {
    if (cards && cards.length > 0) {
      setCenterIndex(0);
    }
  }, [cards]);

  const getNextIndex = React.useCallback((current: number): number => {
    if (!cards || cards.length === 0) return 0;
    return (current + 1) % cards.length;
  }, [cards]);

  const getPrevIndex = React.useCallback((current: number): number => {
    if (!cards || cards.length === 0) return 0;
    return (current - 1 + cards.length) % cards.length;
  }, [cards]);


  useEffect(() => () => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
    }
    if (swipeAnimationRef.current) {
      cancelAnimationFrame(swipeAnimationRef.current);
    }
  }, []);


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

  const handleCardClick = (card: MonitoringCard) => {
    if (wasSwipeRef.current) {
      wasSwipeRef.current = false;
      return;
    }

    const cardLink = cardLinkParams?.[card.id];
    openLink(cardLink);
  };

  const handlePrev = () => {
    if (!cards || cards.length === 0 || isTransitioning) return;
    startTransition('prev');
    setCenterIndex((prev) => getPrevIndex(prev));
  };

  const handleNext = () => {
    if (!cards || cards.length === 0 || isTransitioning) return;
    startTransition('next');
    setCenterIndex((prev) => getNextIndex(prev));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    setIsDragging(true);
    setSwipeOffset(0);
    wasSwipeRef.current = false;
    setIsTransitioning(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartX.current;
    const deltaY = Math.abs(currentY - touchStartY.current);

    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 10) {
      e.preventDefault();
      const containerWidth = trackRef.current?.parentElement?.clientWidth || window.innerWidth;
      const offsetPercent = (deltaX / containerWidth) * 100;
      const maxOffset = 50;
      const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, offsetPercent));
      setSwipeOffset(clampedOffset);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) {
      setIsDragging(false);
      smoothResetSwipeOffset();
      return;
    }

    touchEndX.current = e.changedTouches[0].clientX;
    touchEndY.current = e.changedTouches[0].clientY;

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);

    setIsDragging(false);

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      e.preventDefault();
      e.stopPropagation();
      wasSwipeRef.current = true;
      setIsTransitioning(true);

      if (deltaX > 0) {
        startTransition('prev');
        setCenterIndex((prev) => getPrevIndex(prev));
      } else {
        startTransition('next');
        setCenterIndex((prev) => getNextIndex(prev));
      }

      window.setTimeout(() => {
        smoothResetSwipeOffset();
        setIsTransitioning(false);
      }, transitionDuration);
    } else {
      smoothResetSwipeOffset();
      wasSwipeRef.current = false;
    }

    touchStartX.current = null;
    touchStartY.current = null;
    touchEndX.current = null;
    touchEndY.current = null;
  };

  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging || dragStartX.current === null || dragStartY.current === null) return;

      const deltaX = e.clientX - dragStartX.current;
      const deltaY = Math.abs(e.clientY - dragStartY.current);

      if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 10) {
        e.preventDefault();
        const containerWidth = trackRef.current?.parentElement?.clientWidth || window.innerWidth;
        const offsetPercent = (deltaX / containerWidth) * 100;
        const maxOffset = 50;
        const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, offsetPercent));
        setSwipeOffset(clampedOffset);
      }
    };

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (!isDragging || dragStartX.current === null || dragStartY.current === null) {
        setIsDragging(false);
        smoothResetSwipeOffset();
        return;
      }

      const deltaX = e.clientX - dragStartX.current;
      const deltaY = Math.abs(e.clientY - dragStartY.current);

      setIsDragging(false);

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
        e.preventDefault();
        wasSwipeRef.current = true;
        setIsTransitioning(true);

        if (deltaX > 0) {
          startTransition('prev');
          setCenterIndex((prev) => getPrevIndex(prev));
        } else {
          startTransition('next');
          setCenterIndex((prev) => getNextIndex(prev));
        }

        window.setTimeout(() => {
          smoothResetSwipeOffset();
          setIsTransitioning(false);
        }, transitionDuration);
      } else {
        smoothResetSwipeOffset();
        wasSwipeRef.current = false;
      }

      dragStartX.current = null;
      dragStartY.current = null;
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, getPrevIndex, getNextIndex, minSwipeDistance, transitionDuration]);

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartX.current = e.clientX;
    dragStartY.current = e.clientY;
    setIsDragging(true);
    setSwipeOffset(0);
    wasSwipeRef.current = false;
    setIsTransitioning(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || dragStartX.current === null || dragStartY.current === null) return;

    const deltaX = e.clientX - dragStartX.current;
    const deltaY = Math.abs(e.clientY - dragStartY.current);

    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > 10) {
      e.preventDefault();
      const containerWidth = trackRef.current?.parentElement?.clientWidth || window.innerWidth;
      const offsetPercent = (deltaX / containerWidth) * 100;
      const maxOffset = 50;
      const clampedOffset = Math.max(-maxOffset, Math.min(maxOffset, offsetPercent));
      setSwipeOffset(clampedOffset);
    }
  };

  const handleMouseLeave = () => { };

  if (!cards || cards.length === 0) {
    return (
      <div className="carousel-container">
        <div className="carousel-empty">No cards configured</div>
      </div>
    );
  }

  const trackStyle = {
    '--carousel-transition-duration': `${transitionDuration / 1000}s`,
    '--carousel-transition-ease': TRANSITION_EASING,
  } as React.CSSProperties;

  return (
    <div className="carousel-container">
      <svg style={{ display: 'none', position: 'absolute' }} aria-hidden="true">
        <filter id="lg-dist" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.008" numOctaves="2" seed="92" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred" />
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="70" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Искажённое стекло только для центральной карточки */}
        <filter id="lg-dist-center" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.012" numOctaves="3" seed="41" result="noise" />
          <feGaussianBlur in="noise" stdDeviation="3" result="blurred" />
          <feDisplacementMap in="SourceGraphic" in2="blurred" scale="110" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <button
        className="carousel-arrow carousel-arrow-left"
        onClick={handlePrev}
        aria-label="Previous card"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="carousel-wrapper">
        <div
          ref={trackRef}
          className={`carousel-track ${isTransitioning ? 'transitioning' : ''} ${isTransitioning ? `transitioning-${transitionDirection}` : ''} ${isDragging ? 'dragging' : ''}`}
          style={trackStyle}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {[-2, -1, 0, 1, 2].map((offset) => {
            if (!cards || cards.length === 0) {
              return null;
            }

            const cardIndex = (centerIndex + offset + cards.length) % cards.length;
            const card = cards[cardIndex];
            const isActive = offset === 0;

            let scale = 1;
            if (Math.abs(offset) === 1) {
              scale = 0.85;
            } else if (Math.abs(offset) === 2) {
              scale = 0.7;
            }

            const opacity = 1;
            const zIndex = 5 - Math.abs(offset);
            // Добавляем смещение свайпа к позиции карточки
            const baseTranslateX = offset * 32;
            const swipeTranslateX = isDragging ? swipeOffset : 0;
            const translateX = baseTranslateX + swipeTranslateX;
            const translateZ = -Math.abs(offset) * 70;
            // Уменьшаем поворот во время свайпа для плавности
            const baseRotateY = offset * -10;
            const swipeRotateY = isDragging ? (swipeOffset * 0.3) : 0;
            const rotateY = baseRotateY + swipeRotateY;

            const transitionDelay = Math.abs(offset) * 90;

            return (
              <Card
                key={`${card.id}-${cardIndex}`}
                card={card}
                currentLocale={currentLocale}
                isActive={isActive}
                transform={`translateX(calc(-50% + ${translateX}% + ${offset * 6}px)) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`}

                opacity={opacity}
                zIndex={zIndex}
                offset={offset}
                onClick={handleCardClick}
                transitionDelay={transitionDelay}
                context={context}
              />
            );
          })}
        </div>
      </div>

      <button
        className="carousel-arrow carousel-arrow-right"
        onClick={handleNext}
        aria-label="Next card"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
};

export default Carousel;

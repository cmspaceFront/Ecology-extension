import React from "react";
import { MonitoringCard } from "../../config";
import type { WidgetContext } from 'jimu-core';
import "./Card.css";

interface CardProps {
  card: MonitoringCard;
  currentLocale: string;
  isActive: boolean;
  transform: string;
  opacity: number;
  zIndex: number;
  offset: number;
  onClick: (card: MonitoringCard) => void;
  transitionDelay: number;
  context?: WidgetContext;
}

const Card: React.FC<CardProps> = ({
  card,
  currentLocale,
  isActive,
  transform,
  opacity,
  zIndex,
  offset,
  onClick,
  transitionDelay,
  context,
}) => {
  const getClipPath = (): string => {
    if (isActive) {
      return "none";
    }
    if (offset < 0) {
      const clipRight = Math.abs(offset) === 1 ? "70%" : "63%";
      return `inset(0 ${clipRight} 0 0)`;
    } else if (offset > 0) {
      const clipLeft = offset === 1 ? "70%" : "63%";
      return `inset(0 0 0 ${clipLeft})`;
    }

    return "none";
  };
  const getCardTitle = (card: MonitoringCard): string => {
    if (currentLocale === "uz-Cyrl") {
      return card.titleUzCyrl || card.titleUz || card.title;
    }
    if (currentLocale === "uz-Latn") {
      return card.titleUz || card.titleUzCyrl || card.title;
    }
    if (currentLocale === "ru") {
      return card.titleRu || card.title;
    }
    return card.title;
  };

  const getCardDescription = (card: MonitoringCard): string => {
    if (currentLocale === "uz-Cyrl") {
      return card.descriptionUzCyrl || card.descriptionUz || card.description;
    }
    if (currentLocale === "uz-Latn") {
      return card.descriptionUz || card.descriptionUzCyrl || card.description;
    }
    if (currentLocale === "ru") {
      return card.descriptionRu || card.description;
    }
    return card.description;
  };

  const getButtonLabel = (): string => {
    if (currentLocale === "uz-Cyrl") {
      return "Батафсил";
    }
    if (currentLocale === "uz-Latn") {
      return "Batafsil";
    }
    if (currentLocale === "ru") {
      return "Подробнее";
    }
    return "More";
  };

  const getCardImage = (card: MonitoringCard): string => {
    if (card.imageUrl) {
      // If imageUrl starts with "/", it's a relative path that needs to be resolved
      if (card.imageUrl.startsWith("/")) {
        // First, try to use context.folderUrl (works in ArcGIS Enterprise)
        if (context?.folderUrl) {
          // Fix the URL construction - remove the experience/../ part that gets resolved incorrectly
          const baseUrl = context.folderUrl.replace('/experience/../', '/');
          // Extract the path after /widgets/ecological-monitoring-widget/ from imageUrl
          // imageUrl format: /widgets/ecological-monitoring-widget/dist/runtime/assets/chiqindixona.jpg
          // We need: dist/runtime/assets/chiqindixona.jpg
          const widgetPathMatch = card.imageUrl.match(/\/widgets\/[^/]+\/(.+)$/);
          if (widgetPathMatch) {
            // Extract the path after the widget folder name
            const assetPath = widgetPathMatch[1];
            return `${baseUrl}${assetPath}`;
          }
          // Fallback: if pattern doesn't match, try removing leading "/widgets/ecological-monitoring-widget"
          const fallbackPath = card.imageUrl.replace(/^\/widgets\/[^/]+\//, '');
          return `${baseUrl}${fallbackPath}`;
        }
        // Fallback: Use window.location.origin for absolute path (works in standard deployments)
        return `${window.location.origin}${card.imageUrl}`;
      }
      // If imageUrl is already a full URL or relative path, return as is
      return card.imageUrl;
    }
    return "";
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick(card);
  };

  const clipPath = getClipPath();
  // Для карточек слева (offset < 0) виден правый край, для справа (offset > 0) - левый
  const edgeDirection = !isActive && offset !== 0 ? (offset < 0 ? "left" : "right") : null;

  const cardStyle: React.CSSProperties & { '--card-transition-delay'?: string } = {
    transform,
    opacity,
    zIndex,
    clipPath,
    WebkitClipPath: clipPath,
    transitionDelay: `${transitionDelay}ms`,
    '--card-transition-delay': `${transitionDelay}ms`,
  };

  return (
    <div
      className={`carousel-card glass-card with-enter depth-${Math.abs(offset)} ${isActive ? "active" : ""}`}
      data-edge={edgeDirection}
      data-offset={offset}
      data-depth={Math.abs(offset)}
      style={cardStyle}
      onClick={() => onClick(card)}
    >
      <div className="glass-filter"></div>
      <div className="glass-overlay"></div>
      <div className="glass-specular"></div>
      <div className="glass-content">
        {getCardImage(card) && (
          <div className="carousel-card-image">
            <img src={getCardImage(card)} alt={getCardTitle(card)} />
          </div>
        )}
        <div className="carousel-card-content">
          <h3 className="carousel-card-title">{getCardTitle(card)}</h3>
          <p className="carousel-card-description">
            {getCardDescription(card)}
          </p>
          <button className="carousel-card-button" onClick={handleCardClick}>
            <span>{getButtonLabel()}</span>
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
        </div>
      </div>
    </div>
  );
};

export default Card;

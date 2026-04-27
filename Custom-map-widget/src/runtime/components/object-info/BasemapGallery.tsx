/** @jsx jsx */
import { jsx } from 'jimu-core';
import { useState, useEffect, useRef } from 'react';
import { loadArcGISJSAPIModules } from 'jimu-arcgis';
import { useLocale } from './hooks/useLocale';

interface BasemapOption {
  id: string;
  title: string;
  thumbnail?: string;
}

interface BasemapThumbnail {
  [key: string]: string | null;
}

interface BasemapGalleryProps {
  onChangeBasemap: (basemapId: string) => void | Promise<void>;
  currentBasemap?: string;
  onToggleImageService?: (enabled: boolean) => void | Promise<void>;
}

const BASEMAPS: Record<string, BasemapOption[]> = {
  vektor: [
    { id: 'streets-night-vector', title: 'Streets (Night)' },
    { id: 'dark-gray-vector', title: 'Dark Gray Canvas' },
  ],
  raster: [
    { id: 'satellite', title: 'Satellite' },
    { id: 'hybrid', title: 'Hybrid' },
    { id: 'topo', title: 'Topographic' },
  ],
};

// Map our display IDs to actual ArcGIS basemap IDs
const BASEMAP_ID_MAP: Record<string, string> = {
  'streets-night-vector': 'streets-night-vector',
  'dark-gray-vector': 'dark-gray-vector',
  'satellite': 'satellite',
  'hybrid': 'hybrid',
  'topo': 'topo',
};

const BasemapGallery = ({ onChangeBasemap, currentBasemap = 'hybrid', onToggleImageService }: BasemapGalleryProps) => {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [thumbnails, setThumbnails] = useState<BasemapThumbnail>({});
  const [isImageServiceEnabled, setIsImageServiceEnabled] = useState(() => {
    try {
      const saved = localStorage.getItem('custom-map-widget-imageservice');
      return saved === 'true';
    } catch {
      return false;
    }
  });
  const galleryRef = useRef<HTMLDivElement>(null);

  // Load basemap thumbnails
  useEffect(() => {
    const loadThumbnails = async () => {
      try {
        const [Basemap] = await loadArcGISJSAPIModules(['esri/Basemap']);

        const thumbnailPromises = Object.values(BASEMAPS).flat().map(async (basemap) => {
          const basemapId = BASEMAP_ID_MAP[basemap.id] || basemap.id;
          try {
            const basemapInstance = Basemap.fromId(basemapId);
            await basemapInstance.load();

            // Try to get thumbnail from portalItem first, then thumbnailUrl
            let thumbnailUrl: string | null = null;

            if (basemapInstance.portalItem) {
              await basemapInstance.portalItem.load();
              thumbnailUrl = basemapInstance.portalItem.thumbnailUrl || null;
            }

            if (!thumbnailUrl && basemapInstance.thumbnailUrl) {
              thumbnailUrl = basemapInstance.thumbnailUrl;
            }

            return { id: basemap.id, url: thumbnailUrl };
          } catch (error) {
            // Silently fail and return null - will show gradient fallback
            return { id: basemap.id, url: null };
          }
        });

        const results = await Promise.all(thumbnailPromises);
        const thumbnailMap: BasemapThumbnail = {};
        results.forEach(({ id, url }) => {
          thumbnailMap[id] = url;
        });
        setThumbnails(thumbnailMap);
      } catch (error) {
        // Silently fail - thumbnails are optional
      }
    };

    if (isOpen && Object.keys(thumbnails).length === 0) {
      loadThumbnails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Close gallery when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (galleryRef.current && !galleryRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleBasemapSelect = async (basemapId: string) => {
    await onChangeBasemap(basemapId);
    setIsOpen(false);
  };

  const getBasemapId = (basemap: BasemapOption): string => {
    return BASEMAP_ID_MAP[basemap.id] || basemap.id;
  };

  return (
    <div className="basemap-gallery-container" ref={galleryRef}>
      <button
        className={`basemap-toggle-btn ${isOpen ? 'basemap-toggle-btn--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle basemap gallery"
        title={t('basemap.title')}
      >
        <div className="basemap-toggle-btn__icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M3 7L10 3L17 7V13L10 17L3 13V7Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M3 7L10 11L17 7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10 11V17"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {isOpen && (
        <div className="basemap-gallery">
          <div className="basemap-gallery__header">
            <div className="basemap-gallery__header-content">
              <div className="basemap-gallery__header-icon">
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M3 7L10 3L17 7V13L10 17L3 13V7Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="basemap-gallery__title">{t('basemap.title')}</h3>
            </div>
            <div className="basemap-gallery__header-gradient"></div>
          </div>

          <div className="basemap-gallery__content">
            {/* Vektor Section */}
            <div className="basemap-gallery__section">
              <div className="basemap-gallery__section-title">Vektor</div>
              {BASEMAPS.vektor.map((basemap) => {
                const basemapId = getBasemapId(basemap);
                const isSelected = currentBasemap === basemapId;
                return (
                  <div
                    key={basemap.id}
                    className={`basemap-option ${isSelected ? 'basemap-option--selected' : ''}`}
                    onClick={() => handleBasemapSelect(basemapId)}
                  >
                    <div className="basemap-option__content">
                      <div className="basemap-option__thumbnail">
                        {thumbnails[basemap.id] ? (
                          <img
                            src={thumbnails[basemap.id]!}
                            alt={basemap.title}
                            className="basemap-option__thumbnail-img"
                            loading="lazy"
                            onError={(e) => {
                              // Fallback to gradient if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const fallback = target.parentElement?.querySelector('.basemap-option__thumbnail-inner') as HTMLElement;
                              if (fallback) {
                                fallback.style.display = 'block';
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className="basemap-option__thumbnail-inner"
                          style={{ display: thumbnails[basemap.id] ? 'none' : 'block' }}
                        ></div>
                      </div>
                      <span className="basemap-option__title">{basemap.title}</span>
                    </div>
                    {isSelected && (
                      <div className="basemap-option__check">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M13.3333 4L6 11.3333L2.66667 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Raster Section */}
            <div className="basemap-gallery__section">
              <div className="basemap-gallery__section-title">Raster</div>
              {BASEMAPS.raster.map((basemap) => {
                const basemapId = getBasemapId(basemap);
                const isSelected = currentBasemap === basemapId;
                return (
                  <div
                    key={basemap.id}
                    className={`basemap-option ${isSelected ? 'basemap-option--selected' : ''}`}
                    onClick={() => handleBasemapSelect(basemapId)}
                  >
                    <div className="basemap-option__content">
                      <div className="basemap-option__thumbnail">
                        {thumbnails[basemap.id] ? (
                          <img
                            src={thumbnails[basemap.id]!}
                            alt={basemap.title}
                            className="basemap-option__thumbnail-img"
                            loading="lazy"
                            onError={(e) => {
                              // Fallback to gradient if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const fallback = target.parentElement?.querySelector('.basemap-option__thumbnail-inner') as HTMLElement;
                              if (fallback) {
                                fallback.style.display = 'block';
                              }
                            }}
                          />
                        ) : null}
                        <div
                          className="basemap-option__thumbnail-inner"
                          style={{ display: thumbnails[basemap.id] ? 'none' : 'block' }}
                        ></div>
                      </div>
                      <span className="basemap-option__title">{basemap.title}</span>
                    </div>
                    {isSelected && (
                      <div className="basemap-option__check">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M13.3333 4L6 11.3333L2.66667 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Kartografik asos checkbox */}
            <div className="basemap-gallery__footer">
              <label className="basemap-checkbox">
                <input
                  type="checkbox"
                  checked={isImageServiceEnabled}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    setIsImageServiceEnabled(enabled);
                    try {
                      localStorage.setItem('custom-map-widget-imageservice', enabled.toString());
                    } catch {
                      // Silently fail if localStorage is not available
                    }
                    if (onToggleImageService) {
                      await onToggleImageService(enabled);
                    }
                  }}
                />
                <span>Kartografik asos</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BasemapGallery;

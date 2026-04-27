import React, { memo, useEffect, useRef, useState } from 'react';
import './MapPopup.css';
import { useLocale } from './hooks/useLocale';
import { getDistrictName } from './utils/district-lookup';

interface PolygonData {
  viloyat?: string;
  tuman?: string;
  mfy?: string;
  maydon?: number;
  tur?: string;
  latitude?: number;
  longitude?: number;
  yil?: string;
  'Yer toifa'?: string;
  natija?: string;
  GlobalID?: string;
  Inspektor?: string;
  Jarima_qollanildi?: string;
  Hisoblangan_zarar?: string;
  Holat_bartaraf_etildi?: string;
  buzilish?: string;
  Tekshiruv_natijasi?: string;
  // Все поля из API
  gid?: number;
  globalid?: string | number;
  sana?: string;
  yer_toifa?: string;
  district?: string;
  region?: number;
  mahalla_id?: number;
  tekshirish?: string | null;
  [key: string]: any;
}

interface PhotoData {
  url: string;
  timestamp: string;
}

interface FileData {
  url: string;
  name: string;
  type: 'image' | 'video' | 'document';
  size?: number;
}

interface MapPopupProps {
  isOpen: boolean;
  onClose: () => void;
  polygonData: PolygonData | null;
  position: { x: number; y: number } | null;
  uploadedFiles?: Array<{ name: string; size: number }>;
  photos?: PhotoData[];
  onEdit?: () => void;
  mapFrameRef?: React.RefObject<HTMLElement>; // ✅ ДОБАВЬ
}

const API_BASE_URL = 'https://api-test.spacemc.uz';

const MapPopup: React.FC<MapPopupProps> = ({
  isOpen,
  onClose,
  polygonData,
  position,
  uploadedFiles = [],
  photos = [],
  onEdit,
  mapFrameRef
}) => {


  const { t, locale } = useLocale();
  const popupRef = useRef<HTMLDivElement>(null);
  const [isSidebar, setIsSidebar] = useState(false);
  const [localizedTuman, setLocalizedTuman] = useState<string | null>(null);
  const [files, setFiles] = useState<FileData[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  // Проверка прав доступа
  const hasEditPermission = (): boolean => {
    try {
      const role = localStorage.getItem('role');
      return role === 'insp' || role === 'root';
    } catch {
      return false;
    }
  };

  // Проверка возможности редактирования (с учетом типа полигона)
  const canEdit = (): boolean => {
    // Проверяем права доступа
    if (!hasEditPermission()) {
      return false;
    }

    // Если тип полигона = 4, запрещаем редактирование даже для инспектора и root
    const polygonType = polygonData?.tur;
    if (polygonType !== undefined && polygonType !== null) {
      const typeValue = Number(polygonType);
      if (typeValue === 4) {
        return false;
      }
    }

    return true;
  };

  const handleEditClick = () => {
    if (canEdit() && onEdit) {
      onEdit();
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen || !popupRef.current) return;

    const popup = popupRef.current;

    const resolveContainer = () => {
      return (
        (mapFrameRef?.current as HTMLElement | null) ||
        (popup.offsetParent as HTMLElement | null) ||
        (popup.parentElement as HTMLElement | null) ||
        (popup.closest('.map-container') as HTMLElement | null)
      );
    };


    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const applyLayout = () => {
      const container = resolveContainer();
      if (!container) return;

      // ВАЖНО: берём реальные внутренние размеры контейнера (без влияния скролла страницы)
      const cw = container.clientWidth;
      const ch = container.clientHeight;

      if (!cw || !ch) return;

      // Отступы от рамки карты
      const EDGE_X = cw < 520 ? 10 : 16;
      const EDGE_Y = ch < 520 ? 10 : 16;

      const SAFE_TOP = isSidebar ? 2 : EDGE_Y;
      const SAFE_BOTTOM = isSidebar ? 16 : 16; // можешь менять, но одинаково ок


      const MAX_W = 420;
      const availableW = Math.max(0, cw - EDGE_X * 2);
      const availableH = Math.max(0, ch - EDGE_Y * 2);

      // Ширина не больше дизайна, но всегда влезает в карту
      const width = Math.min(MAX_W, availableW);

      // ВЕРТИКАЛЬНО: строго по высоте карты (никаких MIN_H, чтобы не выталкивало)
      const DEFAULT_POPUP_H = 350; // стандарт до закрепа
      const maxH = Math.max(140, ch - SAFE_TOP - SAFE_BOTTOM); // всегда влезает
      const height = Math.min(DEFAULT_POPUP_H, maxH);

      // Компактный режим, когда по высоте тесно — для увеличения удобства скролла
      const compactY = availableH < 420;
      popup.setAttribute('data-compact-y', compactY ? '1' : '0');

      if (isSidebar) {
        // Sidebar: занимает высоту карты, ширина тоже должна влезать
        popup.style.left = 'auto';
        popup.style.right = '2px';
        popup.style.top = `${SAFE_TOP}px`;
        popup.style.height = `${Math.max(0, ch - SAFE_TOP - SAFE_BOTTOM)}px`;

        popup.style.width = `${Math.min(MAX_W, Math.max(0, cw - 4))}px`;
        popup.style.maxHeight = 'none';
        return;
      }

      // Popup mode: позиция по клику, но всегда внутри карты
      if (!position) return;

      popup.style.width = `${width}px`;
      popup.style.maxHeight = 'none';
      popup.style.height = `${height}px`;
      popup.style.maxHeight = 'none';

      let left = position.x;
      let top = position.y;

      left = clamp(left, EDGE_X, cw - width - EDGE_X);
      top = clamp(top, SAFE_TOP, ch - height - SAFE_BOTTOM);


      popup.style.left = `${left}px`;
      popup.style.right = 'auto';
      popup.style.top = `${top}px`;
    };

    applyLayout();

    const ro = new ResizeObserver(() => requestAnimationFrame(applyLayout));
    const containerForObserve = resolveContainer();
    if (containerForObserve) ro.observe(containerForObserve);


    window.addEventListener('resize', applyLayout);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', applyLayout);
    };
  }, [isOpen, position, isSidebar, mapFrameRef]);






  // Сбрасываем режим сайдбара при закрытии
  useEffect(() => {
    if (!isOpen) {
      setIsSidebar(false);
      setLocalizedTuman(null);
    }
  }, [isOpen]);

  // Очистка blob URL при размонтировании
  useEffect(() => {
    return () => {
      files.forEach(file => {
        if (file.url.startsWith('blob:')) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, [files]);

  // Локализация названия района
  useEffect(() => {
    if (isOpen && polygonData?.district) {
      getDistrictName(String(polygonData.district), locale).then(districtName => {
        if (districtName) {
          setLocalizedTuman(districtName);
        } else {
          setLocalizedTuman(polygonData.tuman || null);
        }
      }).catch(() => {
        setLocalizedTuman(polygonData.tuman || null);
      });
    } else if (isOpen && polygonData?.tuman) {
      setLocalizedTuman(polygonData.tuman);
    } else {
      setLocalizedTuman(null);
    }
  }, [isOpen, polygonData?.district, polygonData?.tuman, locale]);

  // Загрузка файлов из API
  useEffect(() => {
    if (!isOpen || !polygonData) {
      setFiles([]);
      return;
    }

    const loadFiles = async () => {
      // Получаем globalid из данных
      let globalid: string | null = null;
      if (polygonData?.globalid) {
        const globalidStr = String(polygonData.globalid).replace(/[{}]/g, '');
        globalid = globalidStr;
      } else if (polygonData?.GlobalID) {
        globalid = String(polygonData.GlobalID).replace(/[{}]/g, '');
      }

      if (!globalid) {
        setFiles([]);
        return;
      }

      setLoadingFiles(true);
      try {
        // Используем новый API endpoint для получения GeoJSON с file_path
        const apiUrl = new URL(`${API_BASE_URL}/api/ecology/geojson`);
        // Форматируем globalid с фигурными скобками для API
        const formattedGlobalId = `{${globalid.toUpperCase()}}`;
        apiUrl.searchParams.append('globalid', formattedGlobalId);
        apiUrl.searchParams.append('limit', '200');
        apiUrl.searchParams.append('offset', '0');


        const response = await fetch(apiUrl.toString(), {
          method: 'GET',
          headers: {
            'accept': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`API request failed: ${response.status}`, errorText);
          throw new Error(`API request failed: ${response.status}`);
        }

        const geoJsonData = await response.json();

        // Ищем feature с соответствующим globalid
        let filePath: string | null = null;
        if (geoJsonData.features && Array.isArray(geoJsonData.features)) {
          // Нормализуем globalid для сравнения (убираем фигурные скобки и приводим к верхнему регистру)
          const normalizedGlobalId = globalid.toUpperCase();

          for (const feature of geoJsonData.features) {
            if (feature.properties) {
              // Проверяем совпадение globalid
              const featureGlobalId = feature.properties.globalid
                ? String(feature.properties.globalid).replace(/[{}]/g, '').toUpperCase()
                : null;

              if (featureGlobalId === normalizedGlobalId && feature.properties.file_path) {
                filePath = feature.properties.file_path;
                break;
              }
            }
          }

          // Если не нашли по globalid, берем первый feature с file_path
          if (!filePath) {
            for (const feature of geoJsonData.features) {
              if (feature.properties && feature.properties.file_path) {
                filePath = feature.properties.file_path;
                break;
              }
            }
          }
        }

        if (filePath) {
          // Очищаем file_path от пробелов и лишних символов
          const cleanFilePath = filePath.trim();

          if (!cleanFilePath) {
            setFiles([]);
            return;
          }

          // Определяем тип файла по расширению
          const fileExtension = cleanFilePath.split('.').pop()?.toLowerCase() || '';
          let fileType: 'image' | 'video' | 'document' = 'document';

          const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
          const videoExtensions = ['mp4', 'avi', 'mov', 'webm', 'mkv', 'm4v'];

          if (imageExtensions.includes(fileExtension)) {
            fileType = 'image';
          } else if (videoExtensions.includes(fileExtension)) {
            fileType = 'video';
          }

          // Строим полный URL для изображения
          // file_path имеет формат "ecology/38c8cd0e-6990-4eda-a064-7d8fb437a228.png"
          // Полный URL должен быть: https://api-test.spacemc.uz/api/ecology/38c8cd0e-6990-4eda-a064-7d8fb437a228.png
          let fullUrl: string;
          if (cleanFilePath.startsWith('http')) {
            // Если уже полный URL, используем как есть
            fullUrl = cleanFilePath;
          } else {
            // Конструируем URL: API_BASE_URL + /api/ + file_path
            // Пример: https://api-test.spacemc.uz/api/ecology/38c8cd0e-6990-4eda-a064-7d8fb437a228.png
            // Убеждаемся, что file_path не начинается с /
            const normalizedPath = cleanFilePath.startsWith('/') ? cleanFilePath.slice(1) : cleanFilePath;
            fullUrl = `${API_BASE_URL}/api/${normalizedPath}`;
          }

          // Извлекаем имя файла из пути
          const fileName = cleanFilePath.split('/').pop() || 'file';

          setFiles([{
            url: fullUrl,
            name: fileName,
            type: fileType,
            size: undefined
          }]);
        } else {
          setFiles([]);
        }
      } catch (error) {
        console.error('Error loading files:', error);
        setFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    };

    loadFiles();
  }, [isOpen, polygonData]);

  if (!isOpen || !polygonData) return null;

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <>
      {!isSidebar && <div className="map-popup-overlay" onClick={onClose} />}
      <div
        ref={popupRef}
        className={`map-popup ${isSidebar ? 'map-popup--sidebar' : ''}`}
        onWheelCapture={(e) => e.stopPropagation()}
        onTouchMoveCapture={(e) => e.stopPropagation()}
      >


        <div className="map-popup__header">
          <div className="map-popup__title">{t('popup.title')}</div>
          <div className="map-popup__header-buttons">
            <button
              type="button"
              className="map-popup__toggle-sidebar"
              aria-label="Toggle sidebar"
              onClick={() => setIsSidebar(!isSidebar)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g opacity="0.4">
                  <path d="M4 6H20M4 12H20M4 18H20" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            </button>
            <button
              type="button"
              className="map-popup__close"
              aria-label={t('modal.close')}
              onClick={onClose}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g opacity="0.4">
                  <path d="M17.657 17.657L12.0001 12.0001M12.0001 12.0001L6.34326 6.34326M12.0001 12.0001L17.657 6.34326M12.0001 12.0001L6.34326 17.657" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            </button>
          </div>
        </div>

        <div className="map-popup__body">
          <div className="map-popup__section">
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.viloyat')}</span>
              <span className="map-popup__value">{polygonData.viloyat || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.tuman')}</span>
              <span className="map-popup__value">{localizedTuman || polygonData.tuman || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.mfy')}</span>
              <span className="map-popup__value">{polygonData.mfy || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.maydon')}</span>
              <span className="map-popup__value">{polygonData.maydon ? `${polygonData.maydon}` : '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.tur')}</span>
              <span className="map-popup__value">
                {(() => {
                  const typeValue = polygonData.tur !== undefined && polygonData.tur !== null
                    ? String(polygonData.tur)
                    : null;
                  if (typeValue !== null && ['0', '1', '2', '3', '4'].includes(typeValue)) {
                    return t(`popup.fields.typeDescriptions.${typeValue}`);
                  }
                  return polygonData.tur || '—';
                })()}
              </span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.latitude')}</span>
              <span className="map-popup__value">{polygonData.latitude ? `${polygonData.latitude}` : '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.longitude')}</span>
              <span className="map-popup__value">{polygonData.longitude ? `${polygonData.longitude}` : '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.yil')}</span>
              <span className="map-popup__value">{polygonData.yil || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.yerToifa')}</span>
              <span className="map-popup__value">{polygonData['Yer toifa'] || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.natija')}</span>
              <span className="map-popup__value">{polygonData.natija || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.globalId')}</span>
              <span className="map-popup__value">
                {(() => {
                  // Всегда показываем GlobalID
                  // Приоритет: globalid > GlobalID > gid
                  if (polygonData.globalid !== undefined && polygonData.globalid !== null) {
                    const globalidStr = String(polygonData.globalid).replace(/[{}]/g, '');
                    return `[${globalidStr}]`;
                  }
                  // Если есть GlobalID, показываем его
                  if (polygonData.GlobalID) {
                    return `[${polygonData.GlobalID.replace(/[{}]/g, '')}]`;
                  }
                  // Если есть gid, используем его как fallback
                  if (polygonData.gid !== undefined && polygonData.gid !== null) {
                    return `[${polygonData.gid}]`;
                  }
                  return '—';
                })()}
              </span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.inspektor')}</span>
              <span className="map-popup__value">{polygonData.Inspektor || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.jarima')}</span>
              <span className="map-popup__value">{polygonData.Jarima_qollanildi || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.zarar')}</span>
              <span className="map-popup__value">{polygonData.Hisoblangan_zarar || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.holat')}</span>
              <span className="map-popup__value">{polygonData.Holat_bartaraf_etildi || '—'}</span>
            </div>
            <div className="map-popup__field">
              <span className="map-popup__label">{t('popup.fields.tekshiruvNatijasi')}</span>
              <span className="map-popup__value">{polygonData.Tekshiruv_natijasi || polygonData.tekshirish || '—'}</span>
            </div>
          </div>

          <div className="map-popup__section">
            <button
              type="button"
              className={`map-popup__edit-button ${!canEdit() ? 'map-popup__edit-button--disabled' : ''}`}
              onClick={handleEditClick}
              disabled={!canEdit()}
              title={!canEdit() ? t('popup.errors.noPermission') : ''}
            >
              <svg
                className="map-popup__edit-icon"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6.94129 15.7273L2.5 17.5L4.27267 13.0587M6.94129 15.7273L16.1704 6.49819M6.94129 15.7273L6.58623 13.4132L4.27267 13.0587M4.27267 13.0587L13.5018 3.82956M16.1704 6.49819L13.5018 3.82956M16.1704 6.49819L16.999 5.66957C17.7359 4.93265 17.7359 3.73786 16.999 3.00094C16.2621 2.26402 15.0673 2.26402 14.3304 3.00094L13.5018 3.82956"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t('popup.buttons.editInfo')}
            </button>
          </div>

          {/* Секция прямого отображения изображений */}
          {loadingFiles && (
            <div className="map-popup__section">
              <div className="map-popup__loading-files">Загрузка изображения...</div>
            </div>
          )}

          {!loadingFiles && files.length > 0 && files.some(file => file.type === 'image') && (
            <div className="map-popup__section map-popup__photos-section">
              <div className="map-popup__section-title">Изображение</div>
              <div className="map-popup__photos">
                {files
                  .filter(file => file.type === 'image')
                  .map((file, index) => (
                    <div key={index} className="map-popup__photo-item">
                      <img
                        src={file.url}
                        alt={file.name}
                        className="map-popup__photo-image"
                        onError={(e) => {
                          console.error('Error loading image:', file.url);
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                        onLoad={() => {
                        }}
                      />
                    </div>
                  ))}
              </div>
            </div>
          )}


          {uploadedFiles.length > 0 && (
            <div className="map-popup__section">
              <div className="map-popup__section-title">{t('popup.files.title')}</div>
              <div className="map-popup__files">
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="map-popup__file-item">
                    <svg
                      className="map-popup__file-icon"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14 2V8H20"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <div className="map-popup__file-details">
                      <div className="map-popup__file-name">{file.name}</div>
                      <div className="map-popup__file-size">{formatFileSize(file.size)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {photos.length > 0 && (
            <div className="map-popup__section map-popup__photos-section">
              <div className="map-popup__photos">
                {photos.map((photo, index) => (
                  <div key={index} className="map-popup__photo-item">
                    <img
                      src={photo.url}
                      alt={`Photo ${index + 1}`}
                      className="map-popup__photo-image"
                      onError={(e) => {
                        // Если изображение не загрузилось, скрываем его
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <div className="map-popup__photo-timestamp">{photo.timestamp}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default memo(MapPopup);


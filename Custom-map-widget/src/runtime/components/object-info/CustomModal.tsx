import React, { memo, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import './CustomModal.css';
import { useLocale } from './hooks/useLocale';
import CustomDropdown from './CustomDropdown';

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

interface CustomModalProps {
  isOpen: boolean;
  onClose: () => void;
  polygonData?: PolygonData | null;
}

// SVG иконка upload
const UploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 13V13.8C21 16.7998 21 18.2997 20.2361 19.3511C19.9893 19.6907 19.6907 19.9893 19.3511 20.2361C18.2997 21 16.7998 21 13.8 21H10.2C7.20021 21 5.70032 21 4.64886 20.2361C4.30928 19.9893 4.01065 19.6907 3.76393 19.3511C3 18.2997 3 16.7998 3 13.8V13M12 15V3M12 3L9 6M12 3L15 6" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const API_BASE_URL = 'https://api-test.spacemc.uz';

const CustomModal = ({ isOpen, onClose, polygonData }: CustomModalProps) => {
  const { t } = useLocale();
  const [fullPolygonData, setFullPolygonData] = useState<PolygonData | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Локализованные опции для dropdown'ов
  const resultOptions = useMemo(() => [
    t('modal.fields.result.options.approved'),
    t('modal.fields.result.options.rejected'),
    t('modal.fields.result.options.review')
  ], [t]);

  // Значения по умолчанию с учетом локализации
  const defaultYear = useMemo(() => t('modal.fields.year.options.2025'), [t]);
  const defaultResult = useMemo(() => t('modal.fields.result.options.approved'), [t]);

  // Функция для преобразования числового значения API обратно в локализованный текст
  // '1' → "Тасдиқланди" (approved)
  // '2' → "Рад этилди" (rejected)
  // null или другое → defaultResult
  const convertApiValueToResult = useCallback((apiValue: string | number | null | undefined): string => {
    if (!apiValue) return defaultResult;

    const apiValueStr = String(apiValue).trim();

    // Получаем все переведенные значения
    const approvedText = t('modal.fields.result.options.approved');
    const rejectedText = t('modal.fields.result.options.rejected');

    // Преобразуем числовое значение в текст
    if (apiValueStr === '1') {
      return approvedText;
    } else if (apiValueStr === '2') {
      return rejectedText;
    }

    // Если значение уже является текстом, проверяем, соответствует ли оно одному из вариантов
    if (apiValueStr === approvedText || apiValueStr === rejectedText || apiValueStr === t('modal.fields.result.options.review')) {
      return apiValueStr;
    }

    // По умолчанию возвращаем approved
    return defaultResult;
  }, [t, defaultResult]);

  // Инициализация данных формы
  const [formData, setFormData] = useState({
    objectId: '',
    year: defaultYear,
    area: '',
    inspector: '',
    damage: '',
    fine: '',
    note: '',
    result: defaultResult
  });

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUserChangedResultRef = useRef<boolean>(false);

  // Обновляем значения по умолчанию при изменении локали
  useEffect(() => {
    if (!polygonData) {
      setFormData(prev => ({
        ...prev,
        year: defaultYear,
        result: defaultResult
      }));
    }
  }, [defaultYear, defaultResult, polygonData]);

  // Загрузка полных данных полигона из API
  useEffect(() => {
    if (!isOpen || !polygonData) {
      setFullPolygonData(null);
      return;
    }

    const fetchFullPolygonData = async () => {
      let globalid = '';
      if (polygonData?.globalid) {
        const globalidStr = String(polygonData.globalid);
        globalid = globalidStr.replace(/[{}]/g, '');
      } else if (polygonData?.GlobalID) {
        globalid = String(polygonData.GlobalID).replace(/[{}]/g, '');
      } else if (polygonData?.gid) {
        globalid = String(polygonData.gid);
      }

      if (!globalid) {
        setFullPolygonData(polygonData);
        return;
      }

      setLoadingData(true);
      try {
        const url = new URL(`${API_BASE_URL}/api/ecology/geojson`);
        const selectedSoato = localStorage.getItem('selectedSoato');

        if (selectedSoato && selectedSoato !== 'all') {
          const soatoLength = selectedSoato.length;

          if (soatoLength === 4) {
            url.searchParams.append('region', selectedSoato);
          } else if (soatoLength === 7) {
            url.searchParams.append('district', selectedSoato);
          } else if (soatoLength === 10) {
            url.searchParams.append('mahalla_id', selectedSoato);
          }
        }

        const status = localStorage.getItem('status');
        if (status) {
          url.searchParams.append('status', status);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();

        const normalizeGlobalId = (gid: string): string => {
          return gid.replace(/[{}]/g, '').toUpperCase();
        };

        const normalizedSearchId = normalizeGlobalId(globalid);
        const foundFeature = data.features?.find((feature: any) => {
          const props = feature.properties || {};
          const featureGlobalId = props.globalid || props.GlobalID || (props.gid ? String(props.gid) : '');
          const normalizedFeatureId = normalizeGlobalId(String(featureGlobalId));
          return normalizedFeatureId === normalizedSearchId;
        });

        if (foundFeature) {
          const props = foundFeature.properties || {};

          const fullData: PolygonData = {
            ...polygonData,
            globalid: props.globalid || props.GlobalID || props.gid,
            maydon: props.maydon !== undefined ? props.maydon : polygonData.maydon,
            sana: props.sana || props.yil || polygonData.sana || polygonData.yil,
            Inspektor: props.Inspektor || props.tekshirish || polygonData.Inspektor,
            Jarima_qollanildi: props.Jarima_qollanildi || polygonData.Jarima_qollanildi,
            Hisoblangan_zarar: props.Hisoblangan_zarar || polygonData.Hisoblangan_zarar,
            buzilish: props.buzilish || polygonData.buzilish,
            Tekshiruv_natijasi: props.Tekshiruv_natijasi || props.tekshirish || polygonData.Tekshiruv_natijasi,
            ...props
          };

          setFullPolygonData(fullData);
        } else {
          setFullPolygonData(polygonData);
        }
      } catch {
        setFullPolygonData(polygonData);
      } finally {
        setLoadingData(false);
      }
    };

    fetchFullPolygonData();
  }, [isOpen, polygonData]);

  // Ref для отслеживания последнего gid, для которого была загружена форма
  const lastLoadedGidRef = useRef<number | string | null>(null);

  // Обновляем форму при открытии модального окна с данными полигона
  useEffect(() => {
    const dataToUse = fullPolygonData || polygonData;

    if (isOpen && dataToUse) {
      // Получаем gid для проверки, нужно ли обновлять форму
      let currentGid: number | string | null = null;
      if (dataToUse?.gid !== undefined && dataToUse?.gid !== null) {
        currentGid = Number(dataToUse.gid);
      } else if (dataToUse?.globalid) {
        const globalidStr = String(dataToUse.globalid).replace(/[{}]/g, '');
        const numericMatch = globalidStr.match(/\d+/);
        if (numericMatch) {
          currentGid = parseInt(numericMatch[0], 10);
        }
      }

      // Обновляем форму только если это новый полигон (новый gid)
      // Или если это первый раз открытия модалки (lastLoadedGidRef.current === null)
      const isNewPolygon = currentGid !== lastLoadedGidRef.current;
      const isFirstOpen = lastLoadedGidRef.current === null;

      // Обновляем форму только если это новый полигон или первое открытие
      // И если пользователь не изменил значение result вручную (для того же полигона)
      const shouldUpdate = (isNewPolygon || isFirstOpen) && (!isUserChangedResultRef.current || isNewPolygon);

      if (shouldUpdate) {
        // Сбрасываем флаг при загрузке новых данных
        if (isNewPolygon) {
          isUserChangedResultRef.current = false;
        }
        lastLoadedGidRef.current = currentGid;

        let globalid = '';
        if (dataToUse?.globalid) {
          const globalidStr = String(dataToUse.globalid);
          globalid = globalidStr.startsWith('{') && globalidStr.endsWith('}')
            ? globalidStr
            : `{${globalidStr}}`;
        } else if (dataToUse?.GlobalID) {
          const globalidStr = String(dataToUse.GlobalID);
          globalid = globalidStr.startsWith('{') && globalidStr.endsWith('}')
            ? globalidStr
            : `{${globalidStr}}`;
        } else if (dataToUse?.gid) {
          globalid = `{${dataToUse.gid}}`;
        }

        const sana = dataToUse?.sana || dataToUse?.yil || '';
        const maydon = dataToUse?.maydon !== undefined && dataToUse?.maydon !== null
          ? String(dataToUse.maydon)
          : '';

        // Преобразуем tekshirish из API (может быть "1" или "2") в локализованный текст
        const tekshirishValue = dataToUse?.Tekshiruv_natijasi || dataToUse?.tekshirish || '';
        const resultText = convertApiValueToResult(tekshirishValue);

        setFormData(prev => ({
          ...prev,
          objectId: globalid || '',
          year: sana || '',
          area: maydon || '',
          inspector: dataToUse?.Inspektor || dataToUse?.tekshirish || '',
          damage: dataToUse?.Hisoblangan_zarar || '',
          fine: dataToUse?.Jarima_qollanildi || '',
          note: dataToUse?.buzilish || '',
          result: resultText
        }));
      }
    } else if (!isOpen) {
      // Сбрасываем при закрытии модалки
      lastLoadedGidRef.current = null;
      isUserChangedResultRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fullPolygonData, polygonData]);

  // Очистка файла при закрытии модального окна
  useEffect(() => {
    if (!isOpen) {
      setUploadedFile(null);
      setUploadError(null);
      setIsDragging(false);
      setSubmitError(null);
      setIsSubmitting(false);
      isUserChangedResultRef.current = false;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleChange = useCallback((field: string, value: string) => {
    // Отмечаем, что пользователь изменил значение result
    if (field === 'result') {
      isUserChangedResultRef.current = true;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    // Определяем расширение файла
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type.toLowerCase();

    // Разрешенные расширения файлов (только основные типы)
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const documentExtensions = ['.doc', '.docx', '.pdf'];
    const videoExtensions = ['.mp4', '.avi', '.mov', '.webm'];
    const allowedExtensions = [...imageExtensions, ...documentExtensions, ...videoExtensions];

    // Разрешенные MIME-типы (соответствуют расширениям)
    const imageMimeTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp'
    ];
    const documentMimeTypes = [
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/pdf'
    ];
    const videoMimeTypes = [
      'video/mp4',
      'video/x-msvideo', // .avi
      'video/quicktime', // .mov
      'video/webm'
    ];
    const allowedMimeTypes = [...imageMimeTypes, ...documentMimeTypes, ...videoMimeTypes];

    // Проверяем расширение файла
    if (!allowedExtensions.includes(fileExtension)) {
      return t('modal.fields.fileUpload.errors.invalidType');
    }

    // Проверяем MIME-тип файла, если он определен
    // Если MIME-тип пустой или application/octet-stream, полагаемся на расширение
    if (mimeType && mimeType !== 'application/octet-stream' && mimeType !== '') {
      const isAllowedMimeType = allowedMimeTypes.some(allowedType => {
        // Проверяем точное совпадение или совпадение по основной части (image/, video/, application/)
        return mimeType === allowedType ||
          (mimeType.startsWith('image/') && allowedType.startsWith('image/')) ||
          (mimeType.startsWith('video/') && allowedType.startsWith('video/')) ||
          (mimeType.startsWith('application/') && allowedType.startsWith('application/'));
      });

      if (!isAllowedMimeType) {
        // Если MIME-тип явно недопустимый, отклоняем
        return t('modal.fields.fileUpload.errors.invalidType');
      }
    }

    // Определяем максимальный размер в зависимости от типа файла
    let maxSize: number;
    if (videoExtensions.includes(fileExtension)) {
      maxSize = 25 * 1024 * 1024; // 25 МБ для видео
    } else {
      maxSize = 15 * 1024 * 1024; // 15 МБ для остальных файлов
    }

    if (file.size > maxSize) {
      const maxSizeMB = Math.round(maxSize / (1024 * 1024));
      const errorMessage = t('modal.fields.fileUpload.errors.tooLarge');
      return errorMessage.replace('{maxSize}', maxSizeMB.toString());
    }

    return null;
  }, [t]);

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) {
      setUploadedFile(null);
      setUploadError(null);
      return;
    }

    // Сбрасываем предыдущие ошибки
    setUploadError(null);

    // Валидируем файл
    const error = validateFile(file);

    if (error) {
      setUploadError(error);
      setUploadedFile(null);
      // Сбрасываем значение input при ошибке
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    // Устанавливаем файл в state синхронно
    setUploadedFile(file);
  }, [validateFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    // Обрабатываем файл сразу без задержек
    if (file) {
      handleFileSelect(file);
    } else {
      // Если файл не выбран, сбрасываем состояние
      setUploadedFile(null);
      setUploadError(null);
    }
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
      // Обновляем значение input для синхронизации
      if (fileInputRef.current) {
        // Создаем DataTransfer для установки файла в input
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInputRef.current.files = dataTransfer.files;
      }
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!fileInputRef.current) return;

    // Сбрасываем значение input перед кликом, чтобы гарантировать вызов onChange
    // даже если выбран тот же файл повторно
    fileInputRef.current.value = '';

    // Используем setTimeout с минимальной задержкой для гарантии сброса значения
    // перед открытием диалога выбора файла
    setTimeout(() => {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }, 0);
  }, []);

  const handleRemoveFile = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setUploadedFile(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  // Функция для преобразования локализованного значения result в числовое значение для API
  // "Тасдиқланди" (approved) → '1'
  // "Рад этилди" (rejected) → '2'
  // "Кўриб чиқилмоқда" (review) → null (не отправлять)
  const convertResultToApiValue = useCallback((resultValue: string): string | null => {
    if (!resultValue) return null;

    // Получаем все переведенные значения для сравнения
    const approvedText = t('modal.fields.result.options.approved');
    const rejectedText = t('modal.fields.result.options.rejected');
    const reviewText = t('modal.fields.result.options.review');

    // Сравниваем с переведенными значениями
    if (resultValue === approvedText) {
      return '1';
    } else if (resultValue === rejectedText) {
      return '2';
    } else if (resultValue === reviewText) {
      return null; // Не отправляем для "Кўриб чиқилмоқда"
    }

    // Если не совпадает ни с одним, возвращаем null
    return null;
  }, [t]);

  const handleSubmit = useCallback(async () => {
    const dataToUse = fullPolygonData || polygonData;
    if (!dataToUse) {
      setSubmitError('Данные полигона не найдены');
      return;
    }

    // Получаем gid из данных
    // Приоритет: gid (число) > globalid > GlobalID
    let gid: number | string | null = null;

    if (dataToUse?.gid !== undefined && dataToUse?.gid !== null) {
      // gid - это число, используем напрямую
      gid = Number(dataToUse.gid);
    } else if (dataToUse?.globalid) {
      const globalidStr = String(dataToUse.globalid).replace(/[{}]/g, '');
      // Пытаемся извлечь числовое значение из globalid
      const numericMatch = globalidStr.match(/\d+/);
      if (numericMatch) {
        gid = parseInt(numericMatch[0], 10);
      } else {
        gid = globalidStr;
      }
    } else if (dataToUse?.GlobalID) {
      const globalidStr = String(dataToUse.GlobalID).replace(/[{}]/g, '');
      const numericMatch = globalidStr.match(/\d+/);
      if (numericMatch) {
        gid = parseInt(numericMatch[0], 10);
      } else {
        gid = globalidStr;
      }
    }

    if (!gid || (typeof gid === 'number' && isNaN(gid))) {
      setSubmitError('Не удалось определить ID записи (gid)');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Создаем FormData для multipart/form-data
      const formDataToSend = new FormData();

      // Добавляем поля формы, только если они заполнены
      if (formData.inspector) {
        formDataToSend.append('inspektor', formData.inspector);
      }

      if (formData.damage) {
        const damageNum = parseFloat(formData.damage);
        if (!isNaN(damageNum)) {
          formDataToSend.append('hisoblangan_zarar', damageNum.toString());
        }
      }

      if (formData.fine) {
        const fineNum = parseFloat(formData.fine);
        if (!isNaN(fineNum)) {
          formDataToSend.append('jarima_qollanildi', fineNum.toString());
        }
      }

      if (formData.note) {
        formDataToSend.append('izoh', formData.note);
      }

      // Преобразуем result в числовое значение для API
      if (formData.result) {
        const apiResultValue = convertResultToApiValue(formData.result);
        // Отправляем только если значение не null (т.е. не "Кўриб чиқилмоқда")
        if (apiResultValue !== null) {
          formDataToSend.append('tekshirish', apiResultValue);
        }
      }

      if (formData.year) {
        formDataToSend.append('sana', formData.year);
      }

      if (formData.area) {
        const areaNum = parseFloat(formData.area);
        if (!isNaN(areaNum)) {
          formDataToSend.append('maydon', areaNum.toString());
        }
      }

      // Добавляем файл, если он есть
      // Важно: отправляем файл с оригинальным именем и типом
      if (uploadedFile) {
        // Проверяем, что файл прошел валидацию перед отправкой
        const validationError = validateFile(uploadedFile);
        if (validationError) {
          setSubmitError(validationError);
          setIsSubmitting(false);
          return;
        }

        // Отправляем файл с оригинальным именем
        // Браузер автоматически установит правильный Content-Type с boundary
        formDataToSend.append('file', uploadedFile, uploadedFile.name);
      }

      // Отправляем PUT запрос
      const response = await fetch(`${API_BASE_URL}/api/ecology/${polygonData?.globalid}`, {
        method: 'PUT',
        body: formDataToSend,
        headers: {
          'accept': 'application/json',
        },
      });

      if (!response.ok) {
        let errorMessage = `Ошибка при обновлении данных: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
            // Если ошибка связана с типом файла, добавляем подсказку
            if (errorData.detail.toLowerCase().includes('file type') ||
              errorData.detail.toLowerCase().includes('invalid file')) {
              errorMessage = `Недопустимый тип файла. Разрешены: изображения (JPG, PNG, GIF, BMP, WEBP), документы (DOC, DOCX, PDF), видео (MP4, AVI, MOV, WEBM).`;
            }
          } else {
            errorMessage = JSON.stringify(errorData);
          }
        } catch {
          // Если не удалось распарсить JSON, используем текст ответа
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      // Успешная отправка - закрываем модалку
      onClose();

      // Можно добавить уведомление об успехе или обновление данных на карте
      // Например, обновить localStorage или вызвать callback для обновления данных

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка при отправке данных';
      setSubmitError(errorMessage);
      console.error('Error submitting form:', error);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, uploadedFile, fullPolygonData, polygonData, onClose, convertResultToApiValue, validateFile]);

  // Создаем контейнер для портала
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      let container = document.getElementById('custom-map-modal-portal');
      if (!container) {
        container = document.createElement('div');
        container.id = 'custom-map-modal-portal';
        document.body.appendChild(container);
      }
      setPortalContainer(container);
    }

    return () => {
      if (typeof document !== 'undefined') {
        const container = document.getElementById('custom-map-modal-portal');
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }
    };
  }, []);

  if (!isOpen || !portalContainer) return null;

  const modalContent = (
    <div
      id="custom-map-modal"
      className="custom-modal-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="custom-modal">
        <div className="custom-modal__header">
          <div className="custom-modal__title">{t('modal.title')}</div>
          <button
            type="button"
            className="custom-modal__close"
            aria-label={t('modal.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="custom-modal__body">
          {/* Row 1: Obyekt ID - full width (read-only) */}
          <div className="custom-modal__row custom-modal__row--full">
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.objectId.label')}</span>
              <input
                type="text"
                className="custom-modal__input custom-modal__input--readonly"
                value={formData.objectId}
                readOnly
                disabled
              />
            </label>
          </div>

          {/* Row 2: Monitoring yili (read-only) + Hudud maydoni (read-only) */}
          <div className="custom-modal__row custom-modal__row--half">
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.year.label')}</span>
              <input
                type="text"
                className="custom-modal__input custom-modal__input--readonly"
                value={formData.year}
                readOnly
                disabled
              />
            </label>
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.area.label')}</span>
              <input
                type="text"
                className="custom-modal__input custom-modal__input--readonly"
                placeholder={t('modal.fields.area.placeholder')}
                value={formData.area}
                readOnly
                disabled
              />
            </label>
          </div>

          {/* Row 3: Inspektor FIO - full width */}
          <div className="custom-modal__row custom-modal__row--full">
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.inspector.label')}</span>
              <input
                type="text"
                className="custom-modal__input"
                placeholder={t('modal.fields.inspector.placeholder')}
                value={formData.inspector}
                onChange={(e) => handleChange('inspector', e.target.value)}
              />
            </label>
          </div>

          {/* Row 4: Hisoblangan zarar + Qo'llanilgan jarima */}
          <div className="custom-modal__row custom-modal__row--half">
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.damage.label')}</span>
              <input
                type="text"
                className="custom-modal__input"
                placeholder={t('modal.fields.damage.placeholder')}
                value={formData.damage}
                onChange={(e) => handleChange('damage', e.target.value)}
              />
            </label>
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.fine.label')}</span>
              <input
                type="text"
                className="custom-modal__input"
                placeholder={t('modal.fields.fine.placeholder')}
                value={formData.fine}
                onChange={(e) => handleChange('fine', e.target.value)}
              />
            </label>
          </div>

          {/* Row 5: Izoh (wider) + Tekshiruv natijasi (narrower dropdown) */}
          <div className="custom-modal__row custom-modal__row--izoh">
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.note.label')}</span>
              <input
                type="text"
                className="custom-modal__input"
                placeholder={t('modal.fields.note.placeholder')}
                value={formData.note}
                onChange={(e) => handleChange('note', e.target.value)}
              />
            </label>
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.result.label')}</span>
              <CustomDropdown
                value={formData.result}
                options={resultOptions}
                onChange={(value) => handleChange('result', value)}
              />
            </label>
          </div>

          {/* File upload zone */}
          <div className="custom-modal__row custom-modal__row--full">
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.fileUpload.label')}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/gif,image/bmp,image/webp,.doc,.docx,.pdf,video/mp4,video/quicktime,video/webm,.mp4,.avi,.mov,.webm"
                onChange={handleFileInputChange}
                className="custom-modal__file-input"
                style={{ display: 'none' }}
                multiple={false}
              />
              <div
                className={`custom-modal__upload-zone ${isDragging ? 'custom-modal__upload-zone--dragging' : ''} ${uploadedFile ? 'custom-modal__upload-zone--has-file' : ''}`}
                onClick={(e) => {
                  // Если кликнули на кнопку удаления файла, не открываем диалог
                  if ((e.target as HTMLElement).closest('.custom-modal__file-remove')) {
                    return;
                  }
                  handleUploadClick(e);
                }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                {uploadedFile ? (
                  <>
                    <div className="custom-modal__file-info">
                      <svg
                        className="custom-modal__file-icon"
                        width="24"
                        height="24"
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
                      <div className="custom-modal__file-details">
                        <div className="custom-modal__file-name">{uploadedFile.name}</div>
                        <div className="custom-modal__file-size">{formatFileSize(uploadedFile.size)}</div>
                      </div>
                      <button
                        type="button"
                        className="custom-modal__file-remove"
                        onClick={handleRemoveFile}
                        aria-label={t('modal.fields.fileUpload.remove')}
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
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <UploadIcon />
                    <div className="custom-modal__upload-text">
                      {t('modal.fields.fileUpload.text')} <span>{t('modal.fields.fileUpload.textSpan')}</span>
                    </div>
                    <div className="custom-modal__upload-hint">
                      {t('modal.fields.fileUpload.hint')}
                    </div>
                  </>
                )}
              </div>
              {uploadError && (
                <div className="custom-modal__upload-error">
                  {uploadError}
                </div>
              )}
            </label>
          </div>
        </div>

        {submitError && (
          <div className="custom-modal__submit-error" style={{
            marginTop: '12px',
            padding: '12px',
            borderRadius: '8px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            fontSize: '13px',
            lineHeight: '1.4'
          }}>
            {submitError}
          </div>
        )}

        <div className="custom-modal__footer">
          <button type="button" className="custom-modal__cancel" onClick={onClose} disabled={isSubmitting}>
            {t('modal.buttons.cancel')}
          </button>
          <button
            type="button"
            className="custom-modal__submit"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Отправка...' : t('modal.buttons.submit')}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, portalContainer);
};

export default memo(CustomModal);

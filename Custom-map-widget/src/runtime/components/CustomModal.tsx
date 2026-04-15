/** @jsx jsx */
import { jsx } from 'jimu-core';
import React, { memo, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './CustomModal.css';
import CustomDropdown from './CustomDropdown';
import Toast from './Toast';
import { PolygonProperties } from './PolygonPopup';
import { readSelectionIsExclusivelyEtid5 } from './GeoServerLayerTurFilter';
import { useLocale } from './hooks/useLocale';
import { normalizeGuidPlain, pickMatchingGeoJsonRecord, stripGuidBraces } from '../pickMatchingGeoJsonRecord';

interface CustomModalProps {
  isOpen: boolean;
  onClose: () => void;
  polygonData?: PolygonProperties | null;
  onDataUpdated?: () => void;
  /**
   * Узел для createPortal внутри контейнера карты (нужен только в полноэкранном режиме карты).
   * undefined — как раньше: портал в document.body.
   * HTMLElement — монтирование внутри карты (поверх top-layer в fullscreen).
   */
  mapPortalRoot?: HTMLElement | null;
}

// SVG иконка upload
const UploadIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 13V13.8C21 16.7998 21 18.2997 20.2361 19.3511C19.9893 19.6907 19.6907 19.9893 19.3511 20.2361C18.2997 21 16.7998 21 13.8 21H10.2C7.20021 21 5.70032 21 4.64886 20.2361C4.30928 19.9893 4.01065 19.6907 3.76393 19.3511C3 18.2997 3 16.7998 3 13.8V13M12 15V3M12 3L9 6M12 3L15 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const API_BASE_URL = 'https://api-test.spacemc.uz';
const FILE_API_BASE = `${API_BASE_URL}/api/ecology/file/single/`;

const CustomModal = ({ isOpen, onClose, polygonData, onDataUpdated, mapPortalRoot }: CustomModalProps) => {
  const { t } = useLocale();
  const [fullPolygonData, setFullPolygonData] = useState<PolygonProperties | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Локализованные опции для dropdown'ов
  const resultOptions = useMemo(() => [
    t('modal.fields.result.options.approved'),
    t('modal.fields.result.options.rejected')
  ], [t]);

  // Значения по умолчанию с учетом локализации
  const defaultYear = useMemo(() => t('modal.fields.year.options.2025'), [t]);
  const defaultResult = useMemo(() => t('modal.fields.result.options.approved'), [t]);

  // Функция для преобразования числового значения API обратно в локализованный текст
  const convertApiValueToResult = useCallback((apiValue: string | number | null | undefined): string => {
    const approvedText = t('modal.fields.result.options.approved');
    const rejectedText = t('modal.fields.result.options.rejected');

    // Если с бэкенда null/пусто — оставляем пустое значение (в UI покажем placeholder)
    if (apiValue === null || apiValue === undefined) return '';
    const apiValueStr = String(apiValue).trim();
    if (!apiValueStr) return '';
    
    // Преобразуем числовое значение в текст
    if (apiValueStr === '1') {
      return approvedText;
    } else if (apiValueStr === '2') {
      return rejectedText;
    } else if (apiValueStr === '0') {
      return '';
    }
    
    // Если значение уже является текстом, проверяем, соответствует ли оно одному из вариантов
    if (apiValueStr === approvedText || apiValueStr === rejectedText) {
      return apiValueStr;
    }
    
    // По умолчанию возвращаем approved
    return defaultResult;
  }, [t, defaultResult]);

  const formatLastEditedDate = useCallback((value: unknown): string => {
    if (value === null || value === undefined) return '';
    const s = String(value).trim();
    if (!s) return '';

    const pad2 = (n: number) => String(n).padStart(2, '0');
    const formatDateTimeLocal = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      const ss = pad2(d.getSeconds());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
    };

    // Иногда приходит Unix timestamp (ms или sec), напр. 1762428346000
    if (/^\d{13}$/.test(s) || /^\d{10}$/.test(s)) {
      const raw = Number(s);
      if (!Number.isNaN(raw)) {
        const ms = /^\d{10}$/.test(s) ? raw * 1000 : raw;
        const d = new Date(ms);
        if (!Number.isNaN(d.getTime())) {
          return formatDateTimeLocal(d);
        }
      }
    }

    // ISO-like: "2026-03-26T07:34:23.268452" (возможны дробные секунды и таймзона)
    // Показываем как "YYYY-MM-DD HH:mm:ss"
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) {
      const base = s.slice(0, 19); // "YYYY-MM-DDTHH:mm:ss"
      return base.replace('T', ' ');
    }
    return s;
  }, []);

  // Инициализация данных формы
  const [formData, setFormData] = useState(() => ({
    objectId: '',
    year: defaultYear,
    lastEditedDate: '',
    area: '',
    inspector: '',
    damage: '',
    fine: '',
    note: '',
    result: ''
  }));

  // Обновляем значения по умолчанию при изменении локали
  useEffect(() => {
    if (!isOpen) {
      setFormData(prev => ({
        ...prev,
        year: prev.year === defaultYear || !prev.year ? defaultYear : prev.year,
        // Если пусто — оставляем пусто (будет placeholder), иначе сохраняем выбранное значение
        result: prev.result ? prev.result : ''
      }));
    }
  }, [defaultYear, defaultResult, isOpen]);

  const MAX_FILES = 6;
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadedPreviews, setUploadedPreviews] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUserChangedResultRef = useRef<boolean>(false);

  // Existing images from API (file_path): path parts for display and delete
  const parseFilePaths = useCallback((filePath: string | null | undefined): string[] => {
    if (filePath == null || typeof filePath !== 'string' || !filePath.trim()) return [];
    return filePath.split(';').map((p) => p.trim()).filter(Boolean);
  }, []);
  const [existingImagePaths, setExistingImagePaths] = useState<string[]>([]);
  // Сохраняем "стартовый" список файлов, чтобы понять: пользователь реально удалил/изменил фото.
  // Это нужно, чтобы backend не отвечал "No real changes detected" при удалении.
  const initialExistingImagePathsRef = useRef<string[]>([]);
  /** Ховер только при реальном наведении на кнопку X (ключ: 'existing-0' | 'upload-1' и т.д.) */
  const [hoveredDeleteKey, setHoveredDeleteKey] = useState<string | null>(null);
  const uploadPickerOpenedOnPointerRef = useRef(false);

  // Сброс модалки успеха при закрытии основной модалки
  useEffect(() => {
    if (!isOpen) {
      setShowSuccessModal(false);
    }
  }, [isOpen]);

  // Загрузка полных данных полигона из API (если нужно)
  useEffect(() => {
    if (!isOpen || !polygonData) {
      setFullPolygonData(null);
      return;
    }

    // Полные атрибуты из /api/ecology/geojson по совпадению unique_id
    const fetchFullPolygonData = async () => {
      const selectedUniqueId = String(polygonData?.unique_id ?? '').trim();
      if (!selectedUniqueId) {
        setFullPolygonData(polygonData);
        return;
      }

      setLoadingData(true);
      try {
        // Очищаем кеш перед загрузкой данных
        try {
          await fetch(`${API_BASE_URL}/api/ecology/cache/clear`, {
            method: 'POST',
            headers: { 'accept': 'application/json' },
          });
        } catch {
          // Игнорируем ошибки
        }

        const normalizedSelectedUniqueId = normalizeGuidPlain(selectedUniqueId);
        const hints = {
          id_district: polygonData?.id_district,
          id_region: polygonData?.id_region,
          id_mfy: polygonData?.id_mfy
        };

        const fetchGeoJson = async (withFilters: boolean) => {
          const url = new URL(`${API_BASE_URL}/api/ecology/geojson`);
          if (withFilters) {
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
            if (status && !readSelectionIsExclusivelyEtid5()) {
              url.searchParams.append('status', status);
            }
          }

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: { 'accept': 'application/json', 'Content-Type': 'application/json' },
          });

          if (!response.ok) {
            return null;
          }
          return response.json();
        };

        const findRecordByUniqueId = (data: any) =>
          pickMatchingGeoJsonRecord(data, normalizedSelectedUniqueId, hints);

        let foundRecord = findRecordByUniqueId(await fetchGeoJson(true));
        if (!foundRecord) {
          foundRecord = findRecordByUniqueId(await fetchGeoJson(false));
        }

        if (foundRecord) {
          // В /api/ecology/geojson это плоская структура (не GeoJSON features/properties)
          const props = foundRecord;
          setFullPolygonData({
            ...polygonData,
            ...props,
          });
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

  const lastLoadedRecordIdRef = useRef<number | string | null>(null);
  const lastAppliedTekshirishRef = useRef<string | null>(null);

  // Обновляем форму при открытии модального окна
  useEffect(() => {
    const dataToUse = fullPolygonData || polygonData;

    if (isOpen && dataToUse) {
      const rawUnique =
        String((dataToUse as any)?.unique_id ?? (dataToUse as any)?.uniqueId ?? '').trim();
      const currentRecordNorm: string | null = rawUnique
        ? normalizeGuidPlain(rawUnique)
        : null;

      const isNewPolygon = currentRecordNorm !== lastLoadedRecordIdRef.current;
      const isFirstOpen = lastLoadedRecordIdRef.current === null;
      const tekshirishRaw = (dataToUse as any)?.tekshirish;
      const tekshirishNormalized =
        tekshirishRaw === null || tekshirishRaw === undefined ? null : String(tekshirishRaw).trim();

      // Обновляем форму:
      // - при открытии / смене полигона
      // - при догрузке fullPolygonData: если tekshirish изменился и пользователь сам не трогал dropdown
      const isTekshirishChanged = tekshirishNormalized !== lastAppliedTekshirishRef.current;
      const isFullDataArrived = Boolean(fullPolygonData);
      const shouldUpdate =
        ((isNewPolygon || isFirstOpen) && (!isUserChangedResultRef.current || isNewPolygon)) ||
        (isFullDataArrived && isTekshirishChanged && !isUserChangedResultRef.current);

      if (shouldUpdate) {
        if (isNewPolygon) {
          isUserChangedResultRef.current = false;
        }
        lastLoadedRecordIdRef.current = currentRecordNorm;
        lastAppliedTekshirishRef.current = tekshirishNormalized;

        const objectIdDisplay = rawUnique ? stripGuidBraces(rawUnique) : '';

        const sana = dataToUse?.sana || '';
        const maydon = dataToUse?.maydon !== undefined && dataToUse?.maydon !== null ? String(dataToUse.maydon) : '';
        const resultText = convertApiValueToResult(tekshirishRaw);
        const lastEditedDate =
          (dataToUse as any)?.last_edited_date ??
          (dataToUse as any)?.lastEditedDate ??
          '';

        setFormData(prev => ({
          ...prev,
          objectId: objectIdDisplay || '',
          year: sana || defaultYear,
          lastEditedDate: formatLastEditedDate(lastEditedDate),
          area: maydon || '',
          inspector: dataToUse?.inspektor || '',
          damage: dataToUse?.hisoblangan_zarar !== undefined && dataToUse?.hisoblangan_zarar !== null ? String(dataToUse.hisoblangan_zarar) : '',
          fine: dataToUse?.jarima_qollanildi !== undefined && dataToUse?.jarima_qollanildi !== null ? String(dataToUse.jarima_qollanildi) : '',
          note: '',
          result: resultText
        }));
      }
    } else if (!isOpen) {
      lastLoadedRecordIdRef.current = null;
      lastAppliedTekshirishRef.current = null;
      isUserChangedResultRef.current = false;
    }
  }, [isOpen, fullPolygonData, polygonData, convertApiValueToResult, defaultYear, formatLastEditedDate]);

  // Sync existing images when modal opens:
  // 1) try API: /api/ecology/file/{unique_id}
  // 2) fallback to file_path from polygonData
  useEffect(() => {
    if (!isOpen) return;

    const dataToUse = fullPolygonData || polygonData;
    if (!dataToUse) return;

    const rawUnique =
      String((dataToUse as any)?.unique_id ?? (dataToUse as any)?.uniqueId ?? '').trim();
    const guid = rawUnique ? stripGuidBraces(rawUnique) : '';

    if (!guid) {
      const paths = parseFilePaths(dataToUse?.file_path);
      setExistingImagePaths(paths);
      initialExistingImagePathsRef.current = paths.slice();
      return;
    }

    const FILE_LIST_API_BASE = `${API_BASE_URL}/api/ecology/file/`;

    const fetchFiles = async () => {
      try {
        // Отправляем GUID без фигурных скобок, чтобы не получать %7B/%7D в URL
        const url = `${FILE_LIST_API_BASE}${guid}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();

        const files: string[] = Array.isArray(json?.files) ? json.files : [];

        // files[] обычно приходят как полные URL к /api/ecology/file/single/...
        const paths = files
          .map((fileUrl) => {
            if (typeof fileUrl !== 'string') return null;
            if (fileUrl.startsWith(FILE_API_BASE)) {
              return fileUrl.slice(FILE_API_BASE.length);
            }
            const idx = fileUrl.indexOf('/api/ecology/file/single/');
            if (idx >= 0) {
              return fileUrl.slice(idx + '/api/ecology/file/single/'.length);
            }
            return null;
          })
          .filter(Boolean) as string[];

        setExistingImagePaths(paths);
        initialExistingImagePathsRef.current = paths.slice();
      } catch {
        const paths = parseFilePaths(dataToUse?.file_path);
        setExistingImagePaths(paths);
        initialExistingImagePathsRef.current = paths.slice();
      }
    };

    fetchFiles();
  }, [isOpen, fullPolygonData, polygonData]);

  // Object URLs for uploaded file previews (create/revoke when uploadedFiles change)
  useEffect(() => {
    if (!uploadedFiles.length) {
      setUploadedPreviews([]);
      return;
    }
    const urls = uploadedFiles.map((f) => URL.createObjectURL(f));
    setUploadedPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [uploadedFiles]);

  // Очистка файлов при закрытии
  useEffect(() => {
    if (!isOpen) {
      setUploadedFiles([]);
      setUploadError(null);
      setIsDragging(false);
      setSubmitError(null);
      setIsSubmitting(false);
      setExistingImagePaths([]);
      initialExistingImagePathsRef.current = [];
      setHoveredDeleteKey(null);
      isUserChangedResultRef.current = false;
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const handleChange = useCallback((field: string, value: string) => {
    if (field === 'result') {
      isUserChangedResultRef.current = true;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    const mime = file.type?.toLowerCase() ?? '';
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
    const imageMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp'];
    if (!imageExtensions.includes(ext)) return t('modal.fields.fileUpload.errors.invalidType');
    if (mime && mime !== 'application/octet-stream' && !imageMimes.includes(mime)) {
      return t('modal.fields.fileUpload.errors.invalidType');
    }
    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      return t('modal.fields.fileUpload.errors.tooLarge', { maxSize: '15' });
    }
    return null;
  }, [t]);

  const handleFileSelect = useCallback((newFiles: File[]) => {
    setUploadError(null);
    if (!newFiles.length) return;
    const toAdd: File[] = [];
    let firstError: string | null = null;
    for (const file of newFiles) {
      if (toAdd.length >= MAX_FILES) break;
      const err = validateFile(file);
      if (err) {
        if (!firstError) firstError = err;
        continue;
      }
      toAdd.push(file);
    }
    if (firstError && !toAdd.length) {
      setUploadError(firstError);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (toAdd.length) {
      setUploadedFiles(prev => {
        const combined = [...prev, ...toAdd];
        return combined.slice(0, MAX_FILES);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [validateFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list?.length) return;
    handleFileSelect(Array.from(list));
  }, [handleFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const list = e.dataTransfer.files;
    if (!list?.length) return;
    handleFileSelect(Array.from(list));
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      Array.from(list).forEach(f => dt.items.add(f));
      fileInputRef.current.files = dt.files;
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

  const openUploadPicker = useCallback(() => {
    if (!fileInputRef.current || uploadedFiles.length >= MAX_FILES) return;
    // Не сбрасываем value перед открытием — это может добавлять задержку на некоторых устройствах.
    fileInputRef.current.click();
  }, [uploadedFiles.length]);

  const handleUploadPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.custom-modal__file-remove') || (e.target as HTMLElement).closest('.custom-modal__existing-image-delete')) return;
    e.preventDefault();
    e.stopPropagation();
    uploadPickerOpenedOnPointerRef.current = true;
    openUploadPicker();
  }, [openUploadPicker]);

  const handleUploadClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Если уже открыли на pointerdown — не открываем повторно на click.
    if (uploadPickerOpenedOnPointerRef.current) {
      uploadPickerOpenedOnPointerRef.current = false;
      return;
    }
    openUploadPicker();
  }, [openUploadPicker]);

  const handleRemoveFile = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  const convertResultToApiValue = useCallback((resultValue: string): string | null => {
    if (!resultValue) return null;
    const approvedText = t('modal.fields.result.options.approved');
    const rejectedText = t('modal.fields.result.options.rejected');
    if (resultValue === approvedText) return '1';
    if (resultValue === rejectedText) return '2';
    return null;
  }, [t]);

  // Build FormData for PUT (form fields only, no file_path; files added separately)
  const buildPutFormData = useCallback((opts: { appendFiles?: boolean }) => {
    const fd = new FormData();
    if (formData.inspector) fd.append('inspektor', formData.inspector);
    if (formData.damage) {
      const damageNum = parseFloat(formData.damage);
      if (!isNaN(damageNum)) fd.append('hisoblangan_zarar', damageNum.toString());
    }
    if (formData.fine) {
      const fineNum = parseFloat(formData.fine);
      if (!isNaN(fineNum)) fd.append('jarima_qollanildi', fineNum.toString());
    }
    if (formData.note) fd.append('izoh', formData.note);
    if (formData.result) {
      const apiResultValue = convertResultToApiValue(formData.result);
      if (apiResultValue !== null) fd.append('tekshirish', apiResultValue);
    }
    if (formData.area) {
      const areaNum = parseFloat(formData.area);
      if (!isNaN(areaNum)) fd.append('maydon', areaNum.toString());
    }
    if (opts.appendFiles) {
      for (const file of uploadedFiles) {
        fd.append('files', file, file.name);
      }
    }
    return fd;
  }, [formData, uploadedFiles, convertResultToApiValue]);

  // X only removes this image from the list in UI; API is called only on Submit
  const handleDeleteExistingImage = useCallback((index: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExistingImagePaths((prev) => prev.filter((_, i) => i !== index));
    setSubmitError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    const dataToUse = fullPolygonData || polygonData;
    if (!dataToUse) {
      setSubmitError(t('modal.messages.noData'));
      return;
    }

    const fromProps = String((dataToUse as any)?.unique_id ?? (dataToUse as any)?.uniqueId ?? '').trim();
    const fromForm = String(formData.objectId ?? '').trim();
    const rawUnique = fromProps || fromForm;
    const recordId = rawUnique ? stripGuidBraces(rawUnique) : '';

    if (!recordId) {
      setSubmitError(t('modal.messages.noGlobalId'));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const formDataToSend = new FormData();

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
      if (formData.result) {
        const apiResultValue = convertResultToApiValue(formData.result);
        if (apiResultValue !== null) {
          formDataToSend.append('tekshirish', apiResultValue);
        }
      }
      if (formData.area) {
        const areaNum = parseFloat(formData.area);
        if (!isNaN(areaNum)) {
          formDataToSend.append('maydon', areaNum.toString());
        }
      }

      // Сигнал бэкенду: пользователь реально поменял список фото (удалил/добавил).
      // Это нужно, чтобы избежать "No real changes detected" при удалении фото.
      const initialFiles = initialExistingImagePathsRef.current ?? [];
      const currentFilesKey = existingImagePaths.join(';');
      const initialFilesKey = initialFiles.join(';');
      const filesChanged = currentFilesKey !== initialFilesKey || uploadedFiles.length > 0;
      if (filesChanged) {
        formDataToSend.append('clear_files', '1');
      }

      // Важно: при изменении фото принудительно очищаем file_path.
      // Дальше мы заново прикладываем список файлов через multipart 'files',
      // и backend сможет пересобрать file_path без "No real changes detected".
      formDataToSend.append('file_path', filesChanged ? '' : existingImagePaths.join(';'));

      // Existing images: fetch from API and append as 'files' (same format as new uploads)
      for (const path of existingImagePaths) {
        try {
          const res = await fetch(`${FILE_API_BASE}${path}`, { method: 'GET' });
          if (!res.ok) continue;
          const blob = await res.blob();
          formDataToSend.append('files', blob, path);
        } catch {
          // skip failed fetches
        }
      }

      for (const file of uploadedFiles) {
        const err = validateFile(file);
        if (err) {
          setSubmitError(err);
          setIsSubmitting(false);
          return;
        }
        formDataToSend.append('files', file, file.name);
      }

      const formattedId = String(recordId).replace(/[{}]/g, '');
      const putUrl = filesChanged
        ? `${API_BASE_URL}/api/ecology/${formattedId}?clear_files=1`
        : `${API_BASE_URL}/api/ecology/${formattedId}`;
      const response = await fetch(putUrl, {
        method: 'PUT',
        body: formDataToSend,
        headers: { 'accept': 'application/json' },
      });

      if (!response.ok) {
        let errorMessage = t('modal.messages.updateError', { status: response.status, statusText: response.statusText });
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else {
            errorMessage = JSON.stringify(errorData);
          }
        } catch {
          const errorText = await response.text();
          if (errorText) {
            errorMessage = errorText;
          }
        }
        throw new Error(errorMessage);
      }

      try {
        await fetch(`${API_BASE_URL}/api/ecology/cache/clear`, {
          method: 'POST',
          headers: { 'accept': 'application/json' },
        });
      } catch {
        // Игнорируем ошибки
      }

      try {
        localStorage.setItem('status', 'tekshirilgan');
      } catch {
        // Игнорируем ошибки
      }

      try {
        window.dispatchEvent(new CustomEvent('status-statistics-refresh'));
      } catch {
        // Игнорируем ошибки
      }

      setShowSuccessModal(true);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('modal.messages.error');
      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, uploadedFiles, existingImagePaths, fullPolygonData, polygonData, onClose, onDataUpdated, convertResultToApiValue, validateFile, t]);

  const handleSuccessModalClose = useCallback(() => {
    setShowSuccessModal(false);
    onDataUpdated?.();
    onClose();
  }, [onDataUpdated, onClose]);

  // Авто-закрытие модалки успеха через 2.5 сек
  useEffect(() => {
    if (!showSuccessModal) return;
    const timer = setTimeout(handleSuccessModalClose, 2500);
    return () => clearTimeout(timer);
  }, [showSuccessModal, handleSuccessModalClose]);

  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (mapPortalRoot !== undefined) {
      setPortalContainer(mapPortalRoot);
      return;
    }
    if (typeof document !== 'undefined') {
      let container = document.getElementById('hybrid-map-modal-portal');
      if (!container) {
        container = document.createElement('div');
        container.id = 'hybrid-map-modal-portal';
        document.body.appendChild(container);
      }
      setPortalContainer(container);
    }
  }, [mapPortalRoot]);

  const modalContent = isOpen && portalContainer ? (
    <div
      id="hybrid-map-modal"
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

          <div className="custom-modal__row custom-modal__row--inspector">
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
            <label className="custom-modal__field">
              <span className="custom-modal__label custom-modal__label--nowrap">{t('modal.fields.lastEditedDate.label')}</span>
              <input
                type="text"
                className="custom-modal__input custom-modal__input--readonly"
                value={formData.lastEditedDate}
                readOnly
                disabled
              />
            </label>
          </div>

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
                placeholder={t('popup.values.empty')}
                onChange={(value) => handleChange('result', value)}
              />
            </label>
          </div>

          {existingImagePaths.length > 0 && (
            <div className="custom-modal__row custom-modal__row--full">
              <label className="custom-modal__field">
                <span className="custom-modal__label">{t('modal.fields.existingImages.label')}</span>
                <div className="custom-modal__existing-images">
                  {existingImagePaths.map((path, index) => (
                    <div key={`${path}-${index}`} className="custom-modal__existing-image-wrap">
                      <button
                        type="button"
                        className={`custom-modal__existing-image-delete${hoveredDeleteKey === `existing-${index}` ? ' custom-modal__existing-image-delete--hovered' : ''}`}
                        onClick={handleDeleteExistingImage(index)}
                        onMouseEnter={() => setHoveredDeleteKey(`existing-${index}`)}
                        onMouseLeave={() => setHoveredDeleteKey(null)}
                        aria-label={t('modal.fields.existingImages.delete')}
                        title={t('modal.fields.existingImages.delete')}
                      >
                        ×
                      </button>
                      <img
                        src={`${FILE_API_BASE}${path}`}
                        alt=""
                        className="custom-modal__existing-image"
                        loading="lazy"
                      />
                    </div>
                  ))}
                </div>
              </label>
            </div>
          )}

          <div className="custom-modal__row custom-modal__row--full">
            <label className="custom-modal__field">
              <span className="custom-modal__label">{t('modal.fields.fileUpload.label')}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/bmp,image/webp,.png,.jpg,.jpeg,.gif,.bmp,.webp"
                onChange={handleFileInputChange}
                className="custom-modal__file-input"
                style={{ display: 'none' }}
                multiple
              />
              {uploadedFiles.length > 0 && (
                <div className="custom-modal__existing-images custom-modal__existing-images--uploads">
                  {uploadedFiles.map((file, index) => (
                    <div key={`upload-${file.name}-${index}-${file.size}`} className="custom-modal__existing-image-wrap">
                      <button
                        type="button"
                        className={`custom-modal__existing-image-delete${hoveredDeleteKey === `upload-${index}` ? ' custom-modal__existing-image-delete--hovered' : ''}`}
                        onClick={handleRemoveFile(index)}
                        onMouseEnter={() => setHoveredDeleteKey(`upload-${index}`)}
                        onMouseLeave={() => setHoveredDeleteKey(null)}
                        aria-label={t('modal.fields.fileUpload.remove')}
                        title={t('modal.fields.fileUpload.remove')}
                      >
                        ×
                      </button>
                      <img
                        src={uploadedPreviews[index] || ''}
                        alt=""
                        className="custom-modal__existing-image"
                      />
                    </div>
                  ))}
                </div>
              )}
              {uploadedFiles.length < MAX_FILES && (
                <div
                  className={`custom-modal__upload-zone ${isDragging ? 'custom-modal__upload-zone--dragging' : ''} ${uploadedFiles.length > 0 ? 'custom-modal__upload-zone--has-file' : ''}`}
                  onPointerDown={handleUploadPointerDown}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('.custom-modal__file-remove') || (e.target as HTMLElement).closest('.custom-modal__existing-image-delete')) return;
                    handleUploadClick(e);
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <UploadIcon />
                  <div className="custom-modal__upload-text">
                    {uploadedFiles.length === 0
                      ? <div>{t('modal.fields.fileUpload.text')} <span>{t('modal.fields.fileUpload.textSpan')}</span></div>
                      : t('modal.fields.fileUpload.addMore', { count: uploadedFiles.length, max: MAX_FILES })}
                  </div>
                  <div className="custom-modal__upload-hint">
                    {t('modal.fields.fileUpload.hint')}
                  </div>
                </div>
              )}
              {uploadError && (
                <div className="custom-modal__upload-error">
                  {uploadError}
                </div>
              )}
            </label>
          </div>
        </div>

        {submitError && (
          <div className="custom-modal__submit-error">
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
            {isSubmitting ? t('modal.buttons.submitting') : t('modal.buttons.submit')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const successModalContent = showSuccessModal && portalContainer ? (
    <div
      className="custom-modal-overlay custom-success-modal-overlay"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="custom-success-modal-title"
    >
      <div className="custom-success-modal">
        <div className="custom-success-modal__icon">
          <svg width="48" height="48" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M16.6667 5L7.50004 14.1667L3.33337 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 id="custom-success-modal-title" className="custom-success-modal__title">
          {t('modal.messages.success')}
        </h2>
      </div>
    </div>
  ) : null;

  const portalContent = (modalContent || successModalContent) && portalContainer ? (
    <div>
      {modalContent}
      {successModalContent}
    </div>
  ) : null;

  return (
    <div>
      {portalContent && portalContainer && createPortal(portalContent, portalContainer)}
      {showToast && (
        <Toast
          message={toastMessage}
          type="success"
          duration={3000}
          onClose={() => {
            setShowToast(false);
            setToastMessage('');
          }}
        />
      )}
    </div>
  );
};

export default memo(CustomModal);



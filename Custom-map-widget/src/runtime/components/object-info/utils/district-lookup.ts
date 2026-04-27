// Утилита для поиска названия района по коду СОАТО
// Использует данные из tumanlanguage.json для локализованных названий районов

let cachedDistrictsLanguage: any[] = [];

// Маппинг кодов, которые могут приходить с сервера, на правильные коды из tumanlanguage.json
const DISTRICT_CODE_MAPPING: { [key: string]: string } = {
  // Корректировка кодов для районов Ташкента
  '1726267': '1726266', // Юнусобод - код в данных отличается на 1
  '1726201': '1726264', // Бектемир
  '1726202': '1726273', // Мирабод
  '1726203': '1726280', // Олмазор
  '1726204': '1726283', // Сирғали
  '1726205': '1726262', // Учтепа
  '1726206': '1726290', // Яккасарой (возможно)
  '1726207': '1726290', // Яшнобод
  '1726208': '1726294', // Чилонзор
  '1726209': '1726277', // Шайхонтоҳур
  '1726261': '1727259', // Янгийўл (из Ташкентской области)
  '1726262': '1726292', // Янгиҳаёт
};

const loadDistrictsLanguageData = async (): Promise<any[]> => {
  if (cachedDistrictsLanguage.length > 0) {
    return cachedDistrictsLanguage;
  }

  try {
    const response = await import('../../../tumanlanguage.json');
    cachedDistrictsLanguage = response.default;
    return cachedDistrictsLanguage;
  } catch (error) {
    console.error('[Custom-map-widget] Error loading tumanlanguage.json:', error);
    return [];
  }
};

// Функция для получения правильного поля названия в зависимости от локали
const getLocalizedFieldName = (locale?: string): string => {
  switch (locale) {
    case 'uz-Cyrl':
      return 'tuman_krl'; // Кириллица
    case 'uz-Latn':
      return 'tuman_uzb'; // Латиница
    case 'ru':
      return 'tuman_rus'; // Русский
    case 'en':
      return 'tuman_eng'; // Английский
    default:
      return 'tuman_krl'; // По умолчанию кириллица (как в приложении)
  }
};

export const getDistrictName = async (districtCode: string, locale?: string): Promise<string | null> => {
  try {
    const normalizedCode = String(districtCode).trim();

    // Сначала проверяем маппинг кодов для корректировки
    const correctedCode = DISTRICT_CODE_MAPPING[normalizedCode] || normalizedCode;

    // Загружаем данные о районах с локализацией
    const districtsLanguageData = await loadDistrictsLanguageData();
    if (!districtsLanguageData || districtsLanguageData.length === 0) {
      return null;
    }

    // Определяем поле для локализации
    const fieldName = getLocalizedFieldName(locale);

    // Ищем район по исправленному коду СОАТО
    for (const district of districtsLanguageData) {
      if (district.district && String(district.district) === correctedCode) {
        const districtName = district[fieldName];
        if (districtName && districtName.trim()) {
          return districtName.trim();
        }
      }
    }

    // Если не нашли по исправленному коду, пробуем по оригинальному
    if (correctedCode !== normalizedCode) {
      for (const district of districtsLanguageData) {
        if (district.district && String(district.district) === normalizedCode) {
          const districtName = district[fieldName];
          if (districtName && districtName.trim()) {
            return districtName.trim();
          }
        }
      }
    }

    // Если не нашли точное совпадение, попробуем найти по частичному совпадению
    for (const district of districtsLanguageData) {
      if (district.district && String(district.district)) {
        const districtCodeStr = String(district.district);

        // Проверяем, содержит ли один код другой
        if (districtCodeStr.includes(correctedCode) || correctedCode.includes(districtCodeStr)) {
          const districtName = district[fieldName];
          if (districtName && districtName.trim()) {
            return districtName.trim();
          }
        }

        // Проверяем на близкое совпадение (разница в 1 цифре)
        if (correctedCode.length === districtCodeStr.length) {
          let diffCount = 0;
          for (let i = 0; i < correctedCode.length; i++) {
            if (correctedCode[i] !== districtCodeStr[i]) {
              diffCount++;
            }
          }
          // Если отличается только на 1 цифру, считаем что это тот же район
          if (diffCount === 1) {
            const districtName = district[fieldName];
            if (districtName && districtName.trim()) {
              return districtName.trim();
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[Custom-map-widget] Error in getDistrictName:', error);
    return null;
  }
};

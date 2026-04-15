/** Нормализация GUID для сравнения (регистронезависимо). */
export function normalizeGuidPlain(value: unknown): string {
  return String(value ?? '')
    .replace(/[{}]/g, '')
    .trim()
    .toUpperCase();
}

/** Для URL и localStorage: только убрать `{}`, регистр как у источника (API). */
export function stripGuidBraces(value: unknown): string {
  return String(value ?? '')
    .replace(/[{}]/g, '')
    .trim();
}

/** Подсказки с атрибутов клика по карте (ArcGIS) — сужают выбор при дубликатах unique_id в geojson */
export type GeoJsonDisambiguateHints = {
  id_district?: string | number | null;
  id_region?: string | number | null;
  id_mfy?: string | number | null;
};

/**
 * В ответе /api/ecology/geojson ищем запись по unique_id.
 * Если таких несколько (часто без фильтра region/district), берём ту, что совпадает
 * с id_district / id_region / id_mfy с карты — иначе первая (старое поведение).
 */
export function pickMatchingGeoJsonRecord(
  data: unknown,
  uniqueIdNormalized: string,
  hints?: GeoJsonDisambiguateHints | null
): Record<string, unknown> | null {
  const results = Array.isArray((data as { results?: unknown })?.results)
    ? ((data as { results: unknown[] }).results as Record<string, unknown>[])
    : [];

  const matches = results.filter((item) => {
    const id = item?.unique_id ?? item?.uniqueId ?? '';
    return normalizeGuidPlain(id) === uniqueIdNormalized;
  });

  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];

  const d = String(hints?.id_district ?? '').trim();
  if (d) {
    const byD = matches.find((item) => String(item?.id_district ?? '').trim() === d);
    if (byD) return byD;
  }

  const r = String(hints?.id_region ?? '').trim();
  if (r) {
    const byR = matches.find((item) => String(item?.id_region ?? '').trim() === r);
    if (byR) return byR;
  }

  const m = String(hints?.id_mfy ?? '').trim();
  if (m) {
    const byM = matches.find((item) => String(item?.id_mfy ?? '').trim() === m);
    if (byM) return byM;
  }

  return matches[0];
}

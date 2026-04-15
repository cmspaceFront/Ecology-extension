export interface IMConfig {
  apiBaseUrl?: string;
  apiToken?: string;
  useApiData?: boolean;
  detectedCount?: number;
  detectedArea?: number;
  checkedCount?: number;
  inProgressCount?: number;
}

export interface StatisticsData {
  detectedCount: number;
  detectedArea: number;
  checkedCount: number;
  inProgressCount: number;
}

/**
 * Get the API base URL - always returns the fixed API endpoint.
 */
export function getApiBaseUrl(): string {
  return 'https://geomodul.cmspace.uz/api';
}

export const defaultConfig: IMConfig = {
  apiBaseUrl: getApiBaseUrl(),
  apiToken: "",
  useApiData: false,
  detectedCount: 2226,
  detectedArea: 400.33,
  checkedCount: 1800,
  inProgressCount: 426
};


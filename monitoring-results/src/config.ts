import type { IMLinkParam } from "jimu-core";

export interface IMConfig {
  apiBaseUrl?: string;
  apiToken?: string;
  enablePagination?: boolean;
  itemsPerPage?: number;
  linkParam?: IMLinkParam;
}

export function getApiBaseUrl(): string {
  // Default to the tested, working endpoint
  return "https://api-test.spacemc.uz/api";
}

export const defaultConfig: IMConfig = {
  apiBaseUrl: getApiBaseUrl(),
  apiToken: "",
  enablePagination: true,
  itemsPerPage: 20
};

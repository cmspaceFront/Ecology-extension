export interface MonitoringResultItem {
  /** Row selection + map zoom key (stored in localStorage.selectedId) */
  id: string;
  /** Visible ID in table (unique_id, else OBJECTID fallback) */
  displayId: string;
  /** Formatted date-only string from last_edited_date (e.g. "06.11.2025") */
  lastEditedDate?: string;
  /** Unix ms from last_edited_date for sorting */
  lastEditedAt?: number;
  uzcosmos: {
    status: 'pending' | 'in-progress' | 'completed';
    progress: number; // Always 100
  };
  ekologiya: {
    status: 'pending' | 'warning' | 'caution' | 'completed'; // For color determination
    value: boolean | null; // true = 100%, false = 0%, null = null (for progress logic and color)
  };
  prokuratura: {
    status: 'pending' | 'completed';
    progress: number; // 0-100
  };
}

export type StatusColor = 'light-blue' | 'red' | 'yellow' | 'gray';


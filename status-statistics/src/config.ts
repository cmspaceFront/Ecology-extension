export interface IMConfig {
  /**
   * Mock values for the widget. These can be edited from the setting panel.
   * No API is used – everything is local.
   */
  checkedCount?: number;
  approvedCount?: number;
  rejectedCount?: number;
  inProgressCount?: number;
}

export interface StatusStatisticsData {
  checkedCount: number;
  approvedCount: number;
  rejectedCount: number;
  inProgressCount: number;
}

export const defaultConfig: IMConfig = {
  // Default mock values based on the Figma design
  checkedCount: 1000,
  approvedCount: 1000,
  rejectedCount: 600,
  inProgressCount: 400
};



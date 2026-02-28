export interface Config {
  enableSort: boolean;
  sortGrandmapocalypse: boolean;
  sortWizardTower: boolean;
  autoBuy: boolean;
  color0: string;
  color1: string;
  color7: string;
  color15: string;
  colorLast: string;
  isBanking: boolean;
  bankingSeconds: number | boolean;
  updateMS: number;
  enablePerfProfiler: boolean;
}

export const defaultConfig: Config = {
  enableSort: true,
  sortGrandmapocalypse: true,
  sortWizardTower: true,
  autoBuy: false,
  color0: "#00ffff",
  color1: "#00ff00",
  color7: "#ffd939",
  color15: "#ff4d4d",
  colorLast: "#de4dff",
  isBanking: true,
  bankingSeconds: true,
  updateMS: 1000,
  enablePerfProfiler: false,
};

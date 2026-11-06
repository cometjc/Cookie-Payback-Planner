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
  experimentalBatch: boolean;
  lookaheadTopK: number;
  strategyAlgorithm: "beam" | "astar";
  beamWidth: number;
  beamDepth: number;
  strategyAStarMaxExpand: number;
  strategyAStarOpenLimit: number;
  strategyAStarHeuristicWeight: number;
  strategyAStarIncrementalBudgetMs: number;
  strategyAStarMaxIncrementalStreak: number;
  strategyBudgetMs: number;
  strategyIncrementalBudgetMs: number;
  strategySmoothing: number;
  strategyRecomputeMs: number;
  strategyFullRefreshMs: number;
  strategyMaxIncrementalStreak: number;
  strategyHorizonMinSec: number;
  strategyHorizonMaxSec: number;
  strategyHorizonScale: number;
  strategyHorizonLongWeight: number;
  maxHelperChains: number;
  maxHelperBuysPerItem: number;
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
  experimentalBatch: false,
  lookaheadTopK: 9,
  strategyAlgorithm: "beam",
  beamWidth: 5,
  beamDepth: 3,
  strategyAStarMaxExpand: 140,
  strategyAStarOpenLimit: 220,
  strategyAStarHeuristicWeight: 0.35,
  strategyAStarIncrementalBudgetMs: 1.6,
  strategyAStarMaxIncrementalStreak: 4,
  strategyBudgetMs: 5.2,
  strategyIncrementalBudgetMs: 2.2,
  strategySmoothing: 0.62,
  strategyRecomputeMs: 320,
  strategyFullRefreshMs: 1200,
  strategyMaxIncrementalStreak: 6,
  strategyHorizonMinSec: 30,
  strategyHorizonMaxSec: 7200,
  strategyHorizonScale: 12,
  strategyHorizonLongWeight: 0.35,
  maxHelperChains: 4,
  maxHelperBuysPerItem: 100,
};

import type { CookiePaybackPlanner } from "../core/predictor";

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

export function maybeLogMetrics(planner: CookiePaybackPlanner) {
  if (!planner.config.enablePerfProfiler) {
    return;
  }
  const now = Date.now();
  if (now - planner.lastMetricsLogAt < 10000) {
    return;
  }
  const attempts = planner.refreshAttemptCount;
  const success = planner.refreshSuccessCount;
  const successRate = attempts ? (success / attempts) * 100 : 100;
  const avgRefresh =
    planner.refreshDurationsMs.reduce((acc, value) => acc + value, 0) / Math.max(1, planner.refreshDurationsMs.length);
  const p95Refresh = percentile(planner.refreshDurationsMs, 95);
  const avgStrategyRefresh =
    planner.strategyState.refreshDurationsMs.reduce((acc, value) => acc + value, 0) /
    Math.max(1, planner.strategyState.refreshDurationsMs.length);
  const p95StrategyRefresh = percentile(planner.strategyState.refreshDurationsMs, 95);
  const activeAlgorithm = planner.config.strategyAlgorithm === "astar" ? "astar" : "beam";
  console.log(
    `[CPP metrics] alg=${activeAlgorithm} refresh success=${success}/${attempts} (${successRate.toFixed(1)}%) avg=${avgRefresh.toFixed(2)}ms p95=${p95Refresh.toFixed(2)}ms skipped=${planner.refreshSkipCount} helperNodes=${planner.helperExpandedNodes} strategyNodes=${planner.strategyState.expandedNodes} strategyOpenPeak=${planner.strategyState.openPeak} strategyRefreshAvg=${avgStrategyRefresh.toFixed(2)}ms strategyRefreshP95=${p95StrategyRefresh.toFixed(2)}ms strategyTimeout=${planner.strategyState.timeoutCount} strategyBudgetHit=${planner.strategyState.budgetHitCount} astarBudgetHit=${planner.strategyState.astarBudgetHitCount} fallback=${planner.strategyState.fallbackCount} astarFallback=${planner.strategyState.astarFallbackCount} strategyMode full=${planner.strategyState.fullRuns} incremental=${planner.strategyState.incrementalRuns} streak=${planner.strategyState.incrementalStreak}`,
  );
  planner.lastMetricsLogAt = now;
}


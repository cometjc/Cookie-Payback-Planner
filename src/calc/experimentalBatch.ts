import { getItemToken } from "../strategy/selectors";
import { installBatchCandidate } from "./batchCandidate";
import type { CookiePaybackPlanner } from "../core/predictor";
import type { Building, Upgrade, Game } from "../types/game";

/** ponytail: 2.053 bulk100 only; extend versions after isolated quality validation. */
export class ExperimentalBatch {
  private checkedAt = new Map<Building | Upgrade, number>();
  private active = false;
  checks = 0;
  mismatches = 0;
  lastMismatch: { id: number; field: string; approximate: number; native: number } | null = null;
  status = "Strict";

  private resetStrategy(planner: CookiePaybackPlanner) {
    planner.strategyState.scoreByItem.clear();
    planner.strategyState.frontier = [];
    planner.strategyState.stateSignature = "";
    planner.strategyState.lastRefreshAt = 0;
    planner.strategyState.lastFullRefreshAt = 0;
    planner.strategyState.incrementalStreak = 0;
    planner.lastBeamFrontier = [];
    planner.lastStrategyFrontier = [];
  }

  run(game: Game, planner: CookiePaybackPlanner, items: Array<Building | Upgrade>) {
    // Purchases can request a gains refresh before the next native game tick.
    if ((game as any).recalculateGains) game.CalculateGains();
    const requested = planner.config.experimentalBatch === true;
    const enabled = requested && String((game as any).version) === "2.053" && planner.getCurrentBuyCount() === 100;
    if (enabled !== this.active) {
      planner.simCache.clear(); planner.lastComputedAtByItem.clear();
      this.checkedAt.clear(); this.active = enabled;
      this.resetStrategy(planner);
    }
    this.status = enabled ? "Experimental" : requested ? "Strict (unsupported version or bulk)" : "Strict";
    if (!enabled) {
      items.forEach(item => planner.updateBestCpsAcceleration(item));
      return;
    }
    const now = Date.now();
    const expired = (item: Building | Upgrade) => now - (this.checkedAt.get(item) ?? -Infinity) >= 10000;
    const audit = items.find(item => item.type !== "upgrade" && expired(item));
    const force = (item: Building | Upgrade) => {
      const token = getItemToken(item);
      planner.simCache.delete(token); planner.lastComputedAtByItem.delete(token);
      planner.simBudgetRemaining = Math.max(planner.simBudgetRemaining, 1);
    };
    const values = (item: Building | Upgrade) => [item.BestCpsAcceleration, item.BestWaitTime, item.BestBuyToAmount];
    const fields = ["BestCpsAcceleration", "BestWaitTime", "BestBuyToAmount"];
    const candidate = installBatchCandidate(game, planner, true);
    let mismatch = false;
    try {
      for (const item of items) {
        candidate.setEnabled(item === audit || !expired(item));
        if (item.type !== "upgrade" && expired(item)) force(item);
        planner.updateBestCpsAcceleration(item);
        if (item !== audit) continue;
        const approximate = values(item);
        candidate.setEnabled(false); force(item);
        planner.updateBestCpsAcceleration(item);
        this.checks++;
        mismatch = values(item).some((value, field) => {
          if (Object.is(value, approximate[field]) && !Number.isNaN(value)) return false;
          this.lastMismatch = {id: item.id, field: fields[field], approximate: approximate[field], native: value};
          return true;
        });
        if (mismatch) break;
        this.checkedAt.set(item, Date.now());
      }
    } finally { candidate.restore(); }
    if (mismatch) {
      this.mismatches++; this.status = "Strict (experimental mismatch)";
      planner.config.experimentalBatch = false;
      this.checkedAt.clear();
      planner.simCache.clear(); planner.lastComputedAtByItem.clear();
      planner.simBudgetRemaining = Math.max(planner.simBudgetRemaining, items.length);
      items.forEach(item => planner.updateBestCpsAcceleration(item));
      this.resetStrategy(planner);
      planner.markConfigDirty();
    }
  }
}

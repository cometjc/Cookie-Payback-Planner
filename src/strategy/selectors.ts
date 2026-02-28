import type { Building, Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "../core/predictor";
import { Game } from "../core/globals";

export function normalizeItemType(me: Building | Upgrade) {
  if (me.type === "upgrade") {
    return "upgrade";
  }
  if (me.type === "building") {
    return "building";
  }
  if (typeof (me as any).buildingTie === "object") {
    return "upgrade";
  }
  return "building";
}

export function getItemToken(me: Building | Upgrade) {
  return `${normalizeItemType(me)}:${me.id}`;
}

export function isElementLikelyVisible(el: HTMLElement | null) {
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
}

export function getPriorityScore(
  planner: CookiePaybackPlanner,
  me: Building | Upgrade,
  now: number,
  visibleTokens: Set<string>
) {
  const token = getItemToken(me);
  const lastComputedAt = planner.lastComputedAtByItem.get(token) ?? 0;
  const staleMs = now - lastComputedAt;
  const isStale = staleMs >= planner.maxStalenessMs;
  const isVisible = visibleTokens.has(token);
  const nearAffordable = me.getPrice() <= Game.cookies + Math.max(Game.cookiesPs * 2, 1);
  const isHighPriority = planner.highPriorityIds.has(token);

  let score = 0;
  if (isStale) score += 1000;
  if (isHighPriority) score += 600;
  if (isVisible) score += 300;
  if (nearAffordable) score += 120;
  score += Math.min(100, staleMs / 25);
  return score;
}

export function getDisplayScoreByToken(planner: CookiePaybackPlanner, all: Array<Building | Upgrade>) {
  const strategyByToken = new Map<string, number>();
  const scoreByItem = planner.strategyState.scoreByItem;
  for (const me of all) {
    const token = getItemToken(me);
    const base = Number.isFinite(me.BestCpsAcceleration) ? me.BestCpsAcceleration : 0;
    strategyByToken.set(token, scoreByItem.get(token) ?? base);
  }
  return strategyByToken;
}


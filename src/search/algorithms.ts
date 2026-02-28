import type { Building, Upgrade } from "../types/game";
import type { CookiePaybackPlanner } from "../core/predictor";
import { Game } from "../core/globals";
import { getItemToken } from "../strategy/selectors";
import { MaxHeap } from "./heap";

export type StrategyCandidate = {
  token: string;
  item: Building | Upgrade;
  utility: number;
  wait: number;
  gain: number;
  affordable: boolean;
};

export type SearchPath = {
  score: number;
  cookies: number;
  cps: number;
  elapsedSec: number;
  visited: string[];
};

type BeamPath = SearchPath & {
  visitedSet: Set<string>;
};

type AStarNode = SearchPath & {
  g: number;
  f: number;
  depth: number;
  visitedSet: Set<string>;
};

export type StrategyMode = "full" | "incremental";
export type StrategyAlgorithm = "beam" | "astar";

export type StrategySearchResult = {
  scores: Map<string, number> | null;
  frontier: SearchPath[];
  mode: StrategyMode;
  algorithm: StrategyAlgorithm;
  openPeak: number;
  budgetHit: boolean;
  progressCount: number;
  timedOut: boolean;
};

export type HorizonConfig = {
  shortSec: number;
  longSec: number;
  longWeight: number;
};

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function estimateCandidateCpsGain(me: Building | Upgrade, waitSec: number) {
  const singleCpsGain = Number.isFinite(me.SingleCps) && me.SingleCps > 0 ? me.SingleCps : 0;
  const localSlopeGain =
    Number.isFinite(me.BestCpsAcceleration) && me.BestCpsAcceleration > 0
      ? me.BestCpsAcceleration * Math.max(1, waitSec)
      : 0;
  const simulatedDeltaGain =
    Number.isFinite(me.BestCpsAcceleration) &&
    me.BestCpsAcceleration > 0 &&
    Number.isFinite(me.BestWaitTime) &&
    me.BestWaitTime > 0
      ? me.BestCpsAcceleration * me.BestWaitTime
      : 0;
  return Math.max(singleCpsGain, localSlopeGain, simulatedDeltaGain, 0);
}

export function evaluateCandidateUtility(
  planner: CookiePaybackPlanner,
  me: Building | Upgrade,
  cookies: number,
  cps: number,
  horizons: HorizonConfig,
  elapsedSec = 0
) {
  const token = getItemToken(me);
  const wait = planner.estimateWaitSeconds(me.getPrice(), cookies, cps, elapsedSec);
  const gain = Math.max(0, estimateCandidateCpsGain(me, wait));
  const activationSec = elapsedSec + wait;
  const shortBenefit = (gain * Math.max(0, horizons.shortSec - activationSec)) / Math.max(1, horizons.shortSec);
  const longBenefit = (gain * Math.max(0, horizons.longSec - activationSec)) / Math.max(1, horizons.longSec);
  const waitPenalty = wait / Math.max(1, horizons.longSec);
  const gainWeightedWaitPenalty = (gain * wait) / Math.max(1, horizons.longSec);
  const utility =
    shortBenefit * (1 - horizons.longWeight) +
    longBenefit * horizons.longWeight -
    waitPenalty -
    gainWeightedWaitPenalty * 0.35;
  return {
    token,
    item: me,
    utility,
    wait,
    gain,
    affordable: wait === 0,
  } as StrategyCandidate;
}

export function deriveDynamicHorizon(planner: CookiePaybackPlanner, all: Array<Building | Upgrade>) {
  const waits = all
    .filter((me) => !planner.isIgnored(me))
    .map((me) => planner.estimateWaitSeconds(me.getPrice(), Game.cookies, Game.unbuffedCps))
    .filter((waitSec) => Number.isFinite(waitSec) && waitSec > 0);
  const shortestWait = waits.length ? Math.min(...waits) : planner.config.strategyHorizonMinSec;
  const minSec = Math.max(5, planner.config.strategyHorizonMinSec);
  const maxSec = Math.max(minSec, planner.config.strategyHorizonMaxSec);
  const shortSec = clampNumber(shortestWait * Math.max(1, planner.config.strategyHorizonScale), minSec, maxSec);
  const longSec = clampNumber(shortSec * 2, minSec, maxSec);
  return {
    shortSec,
    longSec,
    longWeight: clampNumber(planner.config.strategyHorizonLongWeight, 0, 1),
  } as HorizonConfig;
}

export function buildCandidatePool(planner: CookiePaybackPlanner, all: Array<Building | Upgrade>, horizons: HorizonConfig) {
  const scored = all
    .filter((me) => !planner.isIgnored(me))
    .map((me) => evaluateCandidateUtility(planner, me, Game.cookies, Game.unbuffedCps, horizons))
    .sort((a, b) => b.utility - a.utility);
  const topK = Math.max(2, Math.floor(planner.config.lookaheadTopK));
  const selected = scored.slice(0, topK);
  const selectedTokens = new Set(selected.map((candidate) => candidate.token));
  const cheapest = scored.reduce((best, current) => (current.wait < best.wait ? current : best), scored[0] ?? null);
  const highestAcceleration = scored.reduce((best, current) => {
    if (!best) return current;
    return (current.item.BestCpsAcceleration || 0) > (best.item.BestCpsAcceleration || 0) ? current : best;
  }, null as StrategyCandidate | null);
  for (const mustKeep of [cheapest, highestAcceleration]) {
    if (mustKeep && !selectedTokens.has(mustKeep.token)) {
      selected.push(mustKeep);
      selectedTokens.add(mustKeep.token);
    }
  }
  return selected;
}

export function assignBaselineStrategyScores(all: Array<Building | Upgrade>) {
  const scores = new Map<string, number>();
  all.forEach((me) => {
    const token = getItemToken(me);
    scores.set(token, me.BestCpsAcceleration);
  });
  return scores;
}

export function getStrategyStateSignature(candidates: StrategyCandidate[]) {
  const cookiesBucket = Math.floor(Game.cookies / Math.max(1, Math.floor(Game.cookiesPs * 5)));
  const candidateSignature = candidates
    .slice(0, 4)
    .map((candidate) => candidate.token)
    .sort()
    .join(",");
  return [cookiesBucket, candidateSignature].join("|");
}

export function sanitizeFrontier(seed: SearchPath[], validTokens: Set<string>) {
  const cleaned: SearchPath[] = [];
  for (const path of seed) {
    const visited = path.visited.filter((token) => validTokens.has(token));
    if (!visited.length) continue;
    cleaned.push({
      score: Number.isFinite(path.score) ? path.score : 0,
      cookies: Number.isFinite(path.cookies) ? path.cookies : Game.cookies,
      cps: Number.isFinite(path.cps) ? path.cps : Math.max(1, Game.unbuffedCps),
      elapsedSec: Number.isFinite(path.elapsedSec) ? Math.max(0, path.elapsedSec) : 0,
      visited,
    });
  }
  return cleaned;
}

function getNextCookiesAfterPurchase(planner: CookiePaybackPlanner, currentCookies: number, price: number) {
  const bank = planner.getBankCookies();
  if (currentCookies >= price + bank) {
    return currentCookies - price;
  }
  return bank;
}

function estimateAStarHeuristic(
  preSortedCandidates: StrategyCandidate[],
  visitedSet: Set<string>,
  depth: number,
  weight: number
) {
  let h = 0;
  let picked = 0;
  for (const candidate of preSortedCandidates) {
    if (picked >= 2) break;
    if (candidate.utility <= 0 || visitedSet.has(candidate.token)) continue;
    h += candidate.utility * Math.pow(0.7, depth + picked);
    picked++;
  }
  return h * weight;
}

function runBeamSearchCore(
  planner: CookiePaybackPlanner,
  candidates: StrategyCandidate[],
  scores: Map<string, number>,
  deadline: number,
  seedFrontier: SearchPath[],
  horizons: HorizonConfig,
  depthOverride?: number
) {
  const width = Math.max(2, Math.floor(planner.config.beamWidth));
  const depth = depthOverride ?? Math.max(2, Math.floor(planner.config.beamDepth));
  let frontier: BeamPath[] = seedFrontier.length
    ? seedFrontier.map((path) => ({
        score: path.score,
        cookies: path.cookies,
        cps: path.cps,
        elapsedSec: path.elapsedSec,
        visited: [...path.visited],
        visitedSet: new Set(path.visited),
      }))
    : [
        {
          score: 0,
          cookies: Game.cookies,
          cps: Math.max(1, Game.unbuffedCps),
          elapsedSec: 0,
          visited: [],
          visitedSet: new Set<string>(),
        },
      ];

  for (let d = 0; d < depth; d++) {
    if (performance.now() > deadline) {
      planner.strategyState.timeoutCount++;
      return { scores: null, frontier: [] };
    }
    const nextFrontier = new MaxHeap<BeamPath>((a, b) => a.score - b.score);
    for (const path of frontier) {
      for (const candidate of candidates) {
        if (path.visitedSet.has(candidate.token)) {
          continue;
        }
        planner.strategyState.expandedNodes++;
        const evaled = evaluateCandidateUtility(planner, candidate.item, path.cookies, path.cps, horizons, path.elapsedSec);
        const nextCookies = getNextCookiesAfterPurchase(planner, path.cookies, candidate.item.getPrice());
        const nextCps = Math.max(1, path.cps + evaled.gain);
        const nextElapsedSec = path.elapsedSec + Math.max(0, evaled.wait);
        const nextVisited = [...path.visited, candidate.token];
        const nextVisitedSet = new Set(path.visitedSet);
        nextVisitedSet.add(candidate.token);
        nextFrontier.push({
          score: path.score + evaled.utility * Math.pow(0.7, d),
          cookies: nextCookies,
          cps: nextCps,
          elapsedSec: nextElapsedSec,
          visited: nextVisited,
          visitedSet: nextVisitedSet,
        });
        nextFrontier.trimToSize(width);
      }
    }
    if (!nextFrontier.size) {
      break;
    }
    frontier = [];
    while (nextFrontier.size) {
      const nextPath = nextFrontier.pop();
      if (!nextPath) break;
      frontier.push(nextPath);
    }
  }

  for (const path of frontier) {
    const firstToken = path.visited[0];
    if (!firstToken) continue;
    scores.set(firstToken, Math.max(scores.get(firstToken) ?? 0, path.score));
  }
  return {
    scores,
    frontier: frontier.map((path) => ({
      score: path.score,
      cookies: path.cookies,
      cps: path.cps,
      elapsedSec: path.elapsedSec,
      visited: [...path.visited],
    })),
  };
}

export function runBeamSearch(
  planner: CookiePaybackPlanner,
  all: Array<Building | Upgrade>,
  deadline: number,
  horizons: HorizonConfig
): StrategySearchResult {
  const candidates = buildCandidatePool(planner, all, horizons);
  const scores = assignBaselineStrategyScores(all);
  const result = runBeamSearchCore(planner, candidates, scores, deadline, [], horizons);
  return {
    scores: result.scores,
    frontier: result.frontier,
    mode: "full",
    algorithm: "beam",
    openPeak: result.frontier.length,
    budgetHit: false,
    progressCount: result.frontier.length,
    timedOut: false,
  };
}

export function runIncrementalBeamSearch(
  planner: CookiePaybackPlanner,
  all: Array<Building | Upgrade>,
  deadline: number,
  horizons: HorizonConfig,
  seed: SearchPath[]
): StrategySearchResult {
  const candidates = buildCandidatePool(planner, all, horizons);
  const scores = assignBaselineStrategyScores(all);
  const tokenSet = new Set(candidates.map((candidate) => candidate.token));
  const seedFrontier = sanitizeFrontier(seed, tokenSet);
  const depth = Math.max(1, Math.floor(planner.config.beamDepth) - 1);
  const result = runBeamSearchCore(planner, candidates, scores, deadline, seedFrontier, horizons, depth);
  return {
    scores: result.scores,
    frontier: result.frontier,
    mode: "incremental",
    algorithm: "beam",
    openPeak: result.frontier.length,
    budgetHit: false,
    progressCount: result.frontier.length,
    timedOut: false,
  };
}

function runAStarSearchCore(
  planner: CookiePaybackPlanner,
  candidates: StrategyCandidate[],
  scores: Map<string, number>,
  deadline: number,
  horizons: HorizonConfig,
  seedFrontier: SearchPath[],
  depthOverride?: number
) {
  const maxExpand = Math.max(20, Math.floor(planner.config.strategyAStarMaxExpand));
  const openLimit = Math.max(20, Math.floor(planner.config.strategyAStarOpenLimit));
  const depthLimit = depthOverride ?? Math.max(2, Math.floor(planner.config.beamDepth));
  const heuristicWeight = Math.max(0, planner.config.strategyAStarHeuristicWeight);
  const heuristicPool = [...candidates].sort((a, b) => b.utility - a.utility);
  const open = new MaxHeap<AStarNode>((a, b) => a.f - b.f);
  if (seedFrontier.length) {
    for (const seed of seedFrontier) {
      const visitedSet = new Set(seed.visited);
      open.push({
        score: seed.score,
        g: seed.score,
        depth: Math.max(0, seed.visited.length),
        cookies: Math.max(0, seed.cookies),
        cps: Math.max(1, seed.cps),
        elapsedSec: Math.max(0, seed.elapsedSec),
        visited: [...seed.visited],
        visitedSet,
        f: seed.score + estimateAStarHeuristic(heuristicPool, visitedSet, seed.visited.length, heuristicWeight),
      });
    }
  } else {
    open.push({
      score: 0,
      g: 0,
      f: 0,
      depth: 0,
      cookies: Game.cookies,
      cps: Math.max(1, Game.unbuffedCps),
      elapsedSec: 0,
      visited: [],
      visitedSet: new Set<string>(),
    });
  }

  const bestByState = new Map<string, number>();
  let openPeak = open.size;
  let expanded = 0;
  let budgetHit = false;
  let timedOut = false;
  const progressedRoots = new Set<string>();
  const nextFrontier: SearchPath[] = [];

  while (open.size && expanded < maxExpand) {
    if (performance.now() > deadline) {
      budgetHit = true;
      timedOut = true;
      break;
    }
    const node = open.pop();
    if (!node) break;
    const firstToken = node.visited[0];
    if (firstToken) {
      const previous = scores.get(firstToken) ?? 0;
      if (node.score > previous) {
        progressedRoots.add(firstToken);
      }
      scores.set(firstToken, Math.max(previous, node.score));
    }
    if (node.depth >= depthLimit) {
      nextFrontier.push({
        score: node.score,
        cookies: node.cookies,
        cps: node.cps,
        elapsedSec: node.elapsedSec,
        visited: [...node.visited],
      });
      continue;
    }

    for (const candidate of candidates) {
      if (node.visitedSet.has(candidate.token)) {
        continue;
      }
      expanded++;
      if (expanded >= maxExpand) {
        budgetHit = true;
      }
      const evaled = evaluateCandidateUtility(planner, candidate.item, node.cookies, node.cps, horizons, node.elapsedSec);
      const nextVisited = [...node.visited, candidate.token];
      const nextVisitedSet = new Set(node.visitedSet);
      nextVisitedSet.add(candidate.token);
      const elapsedBucket = Math.floor((node.elapsedSec + Math.max(0, evaled.wait)) / 2);
      const stateKey = `${nextVisited.join(">")}@${elapsedBucket}`;
      const nextG = node.g + evaled.utility * Math.pow(0.7, node.depth);
      const previousBest = bestByState.get(stateKey);
      if (previousBest !== undefined && previousBest >= nextG) {
        continue;
      }
      bestByState.set(stateKey, nextG);
      const heuristic = estimateAStarHeuristic(heuristicPool, nextVisitedSet, node.depth + 1, heuristicWeight);
      open.push({
        score: nextG,
        g: nextG,
        f: nextG + heuristic,
        depth: node.depth + 1,
        cookies: getNextCookiesAfterPurchase(planner, node.cookies, candidate.item.getPrice()),
        cps: Math.max(1, node.cps + evaled.gain),
        elapsedSec: node.elapsedSec + Math.max(0, evaled.wait),
        visited: nextVisited,
        visitedSet: nextVisitedSet,
      });
      open.trimToSize(openLimit);
      if (open.size > openPeak) {
        openPeak = open.size;
      }
      if (budgetHit) break;
    }
    if (budgetHit) break;
  }

  if (budgetHit) {
    planner.strategyState.budgetHitCount++;
    planner.strategyState.astarBudgetHitCount++;
  }
  if (timedOut) {
    planner.strategyState.timeoutCount++;
  }
  planner.strategyState.expandedNodes += expanded;
  planner.strategyState.openPeak = Math.max(planner.strategyState.openPeak, openPeak);

  return {
    scores,
    frontier: nextFrontier.slice(0, Math.max(3, Math.floor(planner.config.beamWidth))),
    mode: "full",
    algorithm: "astar" as StrategyAlgorithm,
    openPeak,
    budgetHit,
    progressCount: progressedRoots.size,
    timedOut,
  } as StrategySearchResult;
}

export function runAStarSearch(
  planner: CookiePaybackPlanner,
  all: Array<Building | Upgrade>,
  deadline: number,
  horizons: HorizonConfig
): StrategySearchResult {
  const candidates = buildCandidatePool(planner, all, horizons);
  const scores = assignBaselineStrategyScores(all);
  return runAStarSearchCore(planner, candidates, scores, deadline, horizons, []);
}

export function runIncrementalAStarSearch(
  planner: CookiePaybackPlanner,
  all: Array<Building | Upgrade>,
  deadline: number,
  horizons: HorizonConfig,
  seed: SearchPath[]
): StrategySearchResult {
  const candidates = buildCandidatePool(planner, all, horizons);
  const scores = assignBaselineStrategyScores(all);
  const tokenSet = new Set(candidates.map((candidate) => candidate.token));
  const seedFrontier = sanitizeFrontier(seed, tokenSet);
  const depth = Math.max(1, Math.floor(planner.config.beamDepth) - 1);
  const result = runAStarSearchCore(planner, candidates, scores, deadline, horizons, seedFrontier, depth);
  return {
    ...result,
    mode: "incremental",
  };
}


// These functions are serialized into the selected renderer. Keep them self-contained.
export function snapshot() {
  const planner = Object.values(Game.mods).find(mod => mod?.modId === 'BestDealHelper' || mod?.name === 'Best Deal Helper');
  if (!planner) throw new Error('找不到 Cookie Payback Planner');
  const items = [...Game.ObjectsById, ...Game.UpgradesInStore];
  const appEntries = Object.entries(globalThis.App?.mods || {});
  const aliases = values => values.filter(value => value !== undefined && value !== null && value !== '').map(value => String(value).trim().toLowerCase());
  const manifestFor = (id, mod) => {
    const keys = new Set(aliases([id, mod?.id, mod?.modId, mod?.name, mod?.displayname]));
    const matches = appEntries.filter(([appId, appMod]) => aliases([appId, appMod?.id, appMod?.name, appMod?.info?.ID, appMod?.info?.Name]).some(key => keys.has(key)));
    return matches.length === 1 ? matches[0][1] : undefined;
  };
  const versionInfo = (mod, manifest) => {
    const runtimeVersion = mod?.version;
    const manifestVersion = manifest?.info?.ModVersion;
    const hasRuntime = runtimeVersion !== undefined && runtimeVersion !== null && runtimeVersion !== '';
    return { version: hasRuntime ? runtimeVersion : manifestVersion ?? manifest?.version,
      runtimeVersion, manifestVersion, versionSource: hasRuntime ? 'runtime' : manifestVersion !== undefined ? 'App.mods.info.ModVersion' : manifest?.version !== undefined ? 'App.mods.version' : 'unavailable' };
  };
  const plannerId = Object.entries(Game.mods).find(([, mod]) => mod === planner)?.[0];
  return {
    version: Game.version, ready: Game.ready, visibility: document.visibilityState,
    planner: { name: planner.name, modId: planner.modId, ...versionInfo(planner, manifestFor(plannerId, planner)),
      experimentAvailable: typeof planner.performanceExperiment?.setVariant === 'function',
      variant: planner.performanceExperiment?.variant,
      experimentMetadata: JSON.parse(JSON.stringify(planner.performanceExperiment?.metadata ?? null)) },
    mods: Object.entries(Game.mods).map(([id, mod], order) => ({ id, order, name: mod?.name || mod?.displayname, ...versionInfo(mod, manifestFor(id, mod)), loaded: mod?.isLoaded })),
    appMods: appEntries.map(([id, mod], order) => ({ id, order, name: mod?.name || mod?.info?.Name, version: mod?.version ?? mod?.info?.ModVersion, path: mod?.path, dir: mod?.dir, disabled: mod?.disabled,
      info: { ID: mod?.info?.ID, Name: mod?.info?.Name, ModVersion: mod?.info?.ModVersion, GameVersion: mod?.info?.GameVersion } })),
    scripts: [...document.scripts].map(script => script.src).filter(Boolean),
    config: JSON.parse(JSON.stringify(planner.config)),
    metrics: {
      refreshDurationsMs: planner.refreshDurationsMs?.slice(),
      strategyRefreshDurationsMs: (planner.strategyState?.refreshDurationsMs || planner.strategyRefreshDurationsMs)?.slice(),
      profilerCallCount: planner.profilerCallCount, profilerComputeCount: planner.profilerComputeCount,
      strategyRuns: planner.strategyState?.runs ?? planner.strategyRuns,
      strategyTimeoutCount: planner.strategyState?.timeoutCount ?? planner.strategyTimeoutCount,
      candidateAgesMs: items.map(item => {
        const type = item.type === 'upgrade' || item.type !== 'building' && typeof item.buildingTie === 'object' ? 'upgrade' : 'building';
        const computedAt = planner.lastComputedAtByItem?.get(`${type}:${item.id}`);
        return {token: `${type}:${item.id}`, ageMs: typeof computedAt === 'number' ? Date.now() - computedAt : null};
      }),
    },
    methodShape: Object.fromEntries(['updateUI', 'updateBestCpsAcceleration', 'updateHelperOrder', 'estimateWaitSeconds', 'tuneAdaptiveBudget'].map(key => [key, typeof planner[key] === 'function' ? String(planner[key]) : null])),
    state: { cookies: Game.cookies, cps: Game.cookiesPs, unbuffedCps: Game.unbuffedCps,
      ascensions: Game.resets, buyBulk: Game.buyBulk, buyMode: Game.buyMode,
      buildings: Game.ObjectsById.map(item => [item.id, item.amount, item.bought, item.level]),
      upgrades: Object.values(Game.Upgrades).filter(item => item.bought).map(item => item.id),
      buffs: Object.entries(Game.buffs).map(([id, buff]) => [id, buff.time, buff.multCpS, buff.multClick]),
      season: Game.season, dragonAura: Game.dragonAura, dragonAura2: Game.dragonAura2,
      minigames: Game.ObjectsById.filter(item => item.minigameLoaded).map(item => [item.id, typeof item.minigame?.save === 'function' ? item.minigame.save() : null]) },
    recommendation: { top: planner.autoBuyTopCandidates?.map(item => ({ token: item.token, score: item.score, waitSec: item.waitSec })) || [],
      items: items.map(item => ({ id: item.id, name: item.name, type: item.type, score: item.BestCpsAcceleration, wait: item.BestWaitTime, amount: item.BestBuyToAmount })),
      buildingOrder: planner.lastSortedBuildingTokens, upgradeOrder: planner.lastSortedUpgradeTokens },
  };
}

export function beginObservation(observeGains = true, observeCandidates = true) {
  if (globalThis.__cppPerfObservation) throw new Error('效能觀察器已存在');
  const planner = Object.values(Game.mods).find(mod => mod?.modId === 'BestDealHelper' || mod?.name === 'Best Deal Helper');
  if (!planner) throw new Error('找不到 planner');
  const state = { timings: {}, frames: [], longtasks: [], truncated: false, startedAt: performance.now(), cleanup: [] };
  state.hidden = typeof document !== 'undefined' && document.visibilityState !== 'visible';
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    const visibility = () => { if (document.visibilityState !== 'visible') state.hidden = true; };
    document.addEventListener('visibilitychange', visibility);
    state.cleanup.push(() => document.removeEventListener('visibilitychange', visibility));
  }
  const append = (list, value) => { if (list.length < 100000) list.push(value); else state.truncated = true; };
  for (const [object, key, label] of [[planner, 'updateUI', 'updateUI'], [planner, 'updateBestCpsAcceleration', 'simulation'], [planner, 'updateHelperOrder', 'helpers'], [Game, 'CalculateGains', 'CalculateGains']]) {
    if (label === 'CalculateGains' && !observeGains) continue;
    if (label === 'simulation' && !observeCandidates) continue;
    const original = object[key];
    if (typeof original !== 'function') continue;
    const timings = state.timings[label] = [];
    const wrapped = function (...args) {
      const start = performance.now();
      try { return original.apply(this, args); }
      finally {
        const entry = { at: start - state.startedAt, ms: performance.now() - start };
        if (label === 'simulation') {
          const item = args[0];
          entry.token = `${item?.type === 'upgrade' ? 'upgrade' : 'building'}:${item?.id}`;
        }
        append(timings, entry);
      }
    };
    object[key] = wrapped;
    state.cleanup.push(() => { if (object[key] === wrapped) object[key] = original; });
  }
  let raf, previous;
  const frame = now => { if (previous !== undefined) append(state.frames, now - previous); previous = now; raf = requestAnimationFrame(frame); };
  raf = requestAnimationFrame(frame); state.cleanup.push(() => cancelAnimationFrame(raf));
  state.longtaskSupported = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask');
  if (state.longtaskSupported) {
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) append(state.longtasks, { at: entry.startTime - state.startedAt, ms: entry.duration }); });
    observer.observe({ entryTypes: ['longtask'] }); state.cleanup.push(() => observer.disconnect());
  }
  globalThis.__cppPerfObservation = state;
  return { installed: Object.keys(state.timings), longtaskSupported: state.longtaskSupported };
}

export function endObservation() {
  const state = globalThis.__cppPerfObservation;
  if (!state) return null;
  for (const cleanup of state.cleanup.reverse()) cleanup();
  delete globalThis.__cppPerfObservation;
  const { cleanup, ...result } = state;
  return { ...result, durationMs: performance.now() - state.startedAt };
}

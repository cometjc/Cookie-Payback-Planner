import { CookiePaybackPlanner } from "./core/predictor";
import { App, Game, ensureCCSE, getCCSE } from "./core/globals";
import {installPantheonBindingObserver} from "./calc/pantheonBinding";

const cookieProfitPredictor = new CookiePaybackPlanner();
const staleRegistered = (Game as any)?.mods?.[cookieProfitPredictor.name];
if (staleRegistered?.isDisposed) {
  delete (Game as any).mods[cookieProfitPredictor.name];
}
if (!staleRegistered || staleRegistered.isDisposed) {
  cookieProfitPredictor.stopPantheonBindingObserver = installPantheonBindingObserver(Game);
}

function tryRegisterMod() {
  const existing = (Game as any)?.mods?.[cookieProfitPredictor.name];
  if (existing && !existing.isDisposed) {
    return true;
  }
  try {
    cookieProfitPredictor.register();
    return true;
  } catch {
    const stale = (Game as any)?.mods?.[cookieProfitPredictor.name];
    if (stale?.isDisposed) {
      delete (Game as any).mods[cookieProfitPredictor.name];
      try {
        cookieProfitPredictor.register();
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

if (!cookieProfitPredictor.isLoaded) {
  const ccse = getCCSE();
  if (ccse && ccse.isLoaded) {
    tryRegisterMod();
  } else {
    const ensured = ensureCCSE();
    ensured.postLoadHooks?.push(() => {
      tryRegisterMod();
    });
    // Fallback path: some environments expose CCSE in Game.mods but not on globalThis.CCSE.
    // Register anyway so the mod can start and later use ensureCCSE shims safely.
    if (App?.mods?.CCSE && !cookieProfitPredictor.isLoaded) {
      tryRegisterMod();
    }
  }
}

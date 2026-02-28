import type { App as AppType, CCSE as CCSEType, Game as GameType } from "../types/game";

const globalScope = globalThis as typeof globalThis & {
  Game?: GameType;
  App?: AppType;
  CCSE?: CCSEType;
  l?: (id: string) => HTMLElement;
  Beautify?: (value: number, decimals: number) => string;
  PlaySound?: (url: string) => void;
};

export const Game = globalScope.Game as GameType;
export const App = globalScope.App as AppType | undefined;

export const getCCSE = () => globalScope.CCSE;

export const ensureCCSE = () => {
  if (!globalScope.CCSE) {
    globalScope.CCSE = {
      isLoaded: false,
      AppendCollapsibleOptionsMenu: () => {},
      AppendStatsVersionNumber: () => {},
      postLoadHooks: [],
    } as CCSEType;
  }
  if (!globalScope.CCSE.postLoadHooks) {
    globalScope.CCSE.postLoadHooks = [];
  }
  return globalScope.CCSE;
};

export const l = (id: string): HTMLElement => {
  if (typeof globalScope.l === "function") {
    return globalScope.l(id);
  }
  return document.getElementById(id) as HTMLElement;
};

export const Beautify = (value: number, decimals: number): string => {
  if (typeof globalScope.Beautify === "function") {
    return globalScope.Beautify(value, decimals);
  }
  return value.toFixed(decimals);
};

export const PlaySound = (url: string): void => {
  if (typeof globalScope.PlaySound === "function") {
    globalScope.PlaySound(url);
  }
};

export const ShowPopup = (text: string): void => {
  if (typeof Game?.Popup === "function") {
    Game.Popup(text);
    return;
  }
  if (typeof Game?.Notify === "function") {
    Game.Notify("Cookie Payback Planner", text);
    return;
  }
  console.log(`[CPP popup] ${text}`);
};

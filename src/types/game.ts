export type AnyFunction = (...args: any[]) => any;

export interface BaseItem {
  l: HTMLElement;
  buy: AnyFunction;
  isVaulted?: () => boolean;
  getPrice: () => number;
  amount: number;
  bought: number;
  id: number;
  name: string;
  dname: string;
  type: "building" | "upgrade" | string;
  pool: string;
  waitingTime?: string;
  SingleCps: number;
  BestBuyToAmount: number;
  BestCpsAcceleration: number;
  BestHelperOrder: number;
  BestHelperAmount: number;
  BestWaitTime: number;
  timeToTargetCookie: number;
}

export interface Building extends BaseItem {
  classList: DOMTokenList;
  price: number;
  locked: number;
  tieredUpgrades: Record<string, Upgrade>;
}

export interface Upgrade extends BaseItem {
  tier: number;
  tieredUpgrades?: Record<string, Upgrade>;
  buildingTie: Building;
}

export interface Tier {
  unlock: number;
}

export interface Game {
  mods?: Record<string, any>;
  customOptionsMenu: Array<() => void>;
  customStatsMenu: Array<() => void>;
  registerHook?: (hook: string, callback: () => void) => void;
  removeHook?: (hook: string, callback: () => void) => void;
  Upgrades: Upgrade[];
  UpgradesById: Upgrade[];
  UpgradesInStore: Upgrade[];
  ObjectsById: Building[];
  Objects: Record<string, Building>;
  Tiers: Record<string, Tier>;
  CpsAchievements: any[];
  GrandmaSynergies: any;
  CalculateGains: AnyFunction;
  ClickProduct: (what: number) => void;
  Has: AnyFunction;
  Logic: AnyFunction;
  RebuildUpgrades: AnyFunction;
  RefreshStore: AnyFunction;
  registerMod: (name: string, mod: any) => void;
  LoadMod?: (url: string, onload?: AnyFunction, onerror?: AnyFunction) => void;
  Upgrade: {
    prototype: {
      click: AnyFunction;
      click2?: AnyFunction;
    };
  };
  Win: AnyFunction;
  buyMode: number;
  buyBulk?: number | string;
  resets?: number;
  cookies: number;
  cookieClicks?: number;
  cookiesPs: number;
  cookiesPsRaw: number;
  cookiesPsRawHighest: number;
  globalCpsMult: number;
  storedCps: number;
  unbuffedCps: number;
  computedMouseCps?: number;
  buffs?: Record<string, Buff>;
  fps?: number;
  clickStr: string;
  Popup?: (text: string) => void;
  Notify?: (title: string, desc?: string, icon?: [number, number], quick?: boolean) => void;
}

export interface Buff {
  name?: string;
  dname?: string;
  type?: string;
  source?: string;
  time?: number;
  maxTime?: number;
  multCpS?: number;
  multCps?: number;
  multClick?: number;
  multClicks?: number;
  multMouse?: number;
}

export interface App {
  mods: Record<
    string,
    {
      dir?: string;
      path?: string;
      folder?: string;
      localDir?: string;
      src?: string;
    }
  >;
}

export interface CCSE {
  AppendCollapsibleOptionsMenu: (name: string, body: HTMLElement) => void;
  AppendStatsVersionNumber: (name: string, version: string) => void;
  isLoaded: boolean;
  postLoadHooks?: Array<() => void>;
}

export interface SandBoxData {
  item: Building | Upgrade;
  amount: number;
  bought: number;
  Logic: AnyFunction;
  Win: AnyFunction;
  cookiesPsRawHighest: number;
  CpsAchievements: any[];
}

export interface SimulateStatus {
  originalCookies: number;
  currentCookies: number;
  paidCookies: number;
  waitTime: number;
}

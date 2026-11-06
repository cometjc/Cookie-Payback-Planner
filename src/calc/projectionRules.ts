import { knownBuildingCps, knownSpecialBuildingCps, knownCpsFunctions, knownCpsHelpers, knownBuildingRelay,
  knownBuildingPrice, knownModifyBuildingPrice, knownHasAura, knownCcseHasAura, knownNativeWin, knownCcseWin } from "./knownCpsRules";
import {pantheonBindingFailure} from "./pantheonBinding";

const normalized = new WeakMap<Function, string>();
const expectedSources = new Map<string, string>();
const objectPrototypeKeys = new Set<PropertyKey>(["constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString"]);
const normalize = (source: string) => source.replace(/\r\n/g, "\n").trim();
const same = (fn: unknown, expected: string) => {
  if (typeof fn !== "function") return false;
  let source = normalized.get(fn);
  if (source === undefined) { source = normalize(Function.prototype.toString.call(fn)); normalized.set(fn, source); }
  let known = expectedSources.get(expected);
  if (known === undefined) { known = normalize(expected); expectedSources.set(expected, known); }
  return source === known;
};
const own = (object: any, key: string) => {
  if (!object) return undefined;
  if (typeof key !== "string" && (typeof key !== "number" || !Number.isFinite(key))) throw Error("Unsupported rule key");
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor && !(key in object)) return undefined;
  if (!descriptor || !("value" in descriptor)) throw Error("Unsupported rule accessor");
  return descriptor.value;
};
export const plainHookArray = (value: any, max: number): boolean => {
  if (value == null) return true;
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (const key in value) if (!Object.prototype.hasOwnProperty.call(value, key)) return false;
  return true;
};
const empty = (value: any) => plainHookArray(value, 0);
const writableData = (object: any, key: string) => {
  const d = Object.getOwnPropertyDescriptor(object, key);
  return d ? "value" in d && d.writable : !(key in object) && Object.isExtensible(object);
};

/** Source/hook gate only. Snapshot validity, helper closure data and native side effects require additional checks. */
export function projectionRuleFailure(game: any): string | undefined {
  try {
    if (own(game, "version") !== 2.053) return "version";
    const hasGod = own(game, "hasGod");
    if (hasGod) {
      const failure = pantheonBindingFailure(game, hasGod);
      if (failure) return failure;
      const hasAura = own(game, "hasAura");
      if (![knownHasAura, knownCcseHasAura].some(source => same(hasAura, source))) return "helper:hasAura";
    }
    for (const [key, source] of Object.entries(knownCpsFunctions)) if (!same(own(game, key), source)) return `function:${key}`;
    for (const [key, source] of Object.entries(knownCpsHelpers)) {
      const fn = own(game, key);
      if (fn != null && !same(fn, source)) return `helper:${key}`;
    }
    // Validate data before known helpers traverse it; matching source does not validate accessors.
    const upgrades = own(game, "Upgrades");
    if (upgrades && ![null, Object.prototype].includes(Object.getPrototypeOf(upgrades))) return "upgradeData";
    if (upgrades && Object.getPrototypeOf(upgrades) === Object.prototype) {
      for (const key of Reflect.ownKeys(Object.prototype)) {
        const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, key)!;
        if (!objectPrototypeKeys.has(key) || key !== "__proto__" && (!("value" in descriptor) || typeof descriptor.value !== "function")) return "upgradePrototype";
      }
    }
    for (const key in upgrades) if (!Object.prototype.hasOwnProperty.call(upgrades, key)) return "upgradeData";
    for (const key of Object.getOwnPropertyNames(upgrades || {})) {
      const upgrade = own(upgrades, key);
      const name = own(upgrade, "name"), bought = own(upgrade, "bought"), pool = own(upgrade, "pool"), tier = own(upgrade, "tier");
      if (name !== key || ![0, 1, false, true].includes(bought)) return "upgradeData";
      if (!writableData(upgrade, "bought")) return "upgradeData";
      if (pool !== undefined && typeof pool !== "string") return "upgradeData";
      if (tier !== undefined && typeof tier !== "string" && (typeof tier !== "number" || !Number.isFinite(tier))) return "upgradeData";
    }
    for (const key of ["dragonAura", "dragonAura2", "dragonLevel"]) {
      const value = own(game, key);
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) return "auraData";
    }
    for (const key of ["dragonAuras", "dragonAurasBN"]) {
      const auras = own(game, key);
      if (auras && ![null, Object.prototype, Array.prototype].includes(Object.getPrototypeOf(auras))) return "auraData";
      for (const name of Object.getOwnPropertyNames(auras || {})) {
        if (Array.isArray(auras) && name === "length") continue;
        const aura = own(auras, name);
        const label = own(aura, "name"), id = own(aura, "id");
        if (typeof label !== "string" || !Number.isInteger(id) || id < 0) return "auraData";
      }
      if (key === "dragonAuras" && auras) for (const field of ["dragonAura", "dragonAura2"]) {
        const id = own(game, field);
        if (id !== undefined) own(own(auras, String(id)), "name");
      }
    }
    for (const key of ["customGetTieredCpsMult", "customAuraMult", "customHasAura", "customGetVeilBoost", "customComputeLumpTimes", "customHeavenlyMultiplier", "customModifyBuildingPrice"]) {
      if (!empty(own(game, key))) return `hook:${key}`;
    }
    for (const key of ["cps", "cookiesPerClick"]) if (!empty(own(own(game, "modHooks"), key))) return `hook:${key}`;
    for (const key of ["cookiesPsRaw", "cookiesPsRawHighest", "BuildingsOwned"]) {
      const value = own(game, key);
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) return `scalar:${key}`;
    }
    // These native reads occur even when the production projection does not use them.
    const buffs = own(game, "buffs");
    if (buffs && ![null, Object.prototype].includes(Object.getPrototypeOf(buffs))) return "buffData";
    for (const name of ["Everything must go", "Crafty pixies", "Nasty goblins", "Haggler's luck", "Haggler's misery"]) own(buffs, name);
    if (own(buffs, "Cursed finger")) return "buff:Cursed finger";
    const wrinklers = own(game, "wrinklers");
    if (wrinklers != null) {
      if (!plainHookArray(wrinklers, Number.MAX_SAFE_INTEGER)) return "wrinklerData";
      for (const key of Object.keys(wrinklers)) {
        const phase = own(own(wrinklers, key), "phase");
        if (typeof phase !== "number" || !Number.isFinite(phase)) return "wrinklerData";
      }
    }
    const cpsAchievements = own(game, "CpsAchievements");
    if (cpsAchievements != null) {
      if (!plainHookArray(cpsAchievements, Number.MAX_SAFE_INTEGER)) return "achievementData";
      if (cpsAchievements.length && ![knownNativeWin, knownCcseWin].some(source => same(own(game, "Win"), source))) return "function:Win";
      if (!empty(own(game, "customWin"))) return "hook:customWin";
      for (const key of Object.keys(cpsAchievements)) {
        const entry = own(cpsAchievements, key), threshold = own(entry, "threshold"), name = own(entry, "name");
        if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 || typeof name !== "string") return "achievementData";
        if (own(game, "cookiesPsRaw") >= threshold) {
          const achievement = own(own(game, "Achievements"), name);
          if (achievement && ![1, true].includes(own(achievement, "won"))) return "achievement-pending";
        }
      }
    }
    if (!empty(own(own(game, "customBuildingsAll"), "cpsMult"))) return "hook:allBuildingCps";
    if (!same(own(game, "modifyBuildingPrice"), knownModifyBuildingPrice)) return "function:modifyBuildingPrice";
    const buildings = own(game, "ObjectsById"), objects = own(game, "Objects"), custom = own(game, "customBuildings");
    if (!Array.isArray(buildings) || !plainHookArray(buildings, Number.MAX_SAFE_INTEGER)) return "buildings";
    for (let i = 0; i < buildings.length; i++) {
      const building = own(buildings, String(i)), name = own(building, "name"), id = own(building, "id");
      if (typeof name !== "string" || id !== i || building !== own(objects, name)) return "buildingIdentity";
      for (const key of ["amount", "bought"]) {
        const value = own(building, key);
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "buildingData";
      }
      if (!same(own(building, "cps"), (id < 2 ? knownSpecialBuildingCps : knownBuildingCps)[name] || "")) return `cps:${name}`;
      if (!same(own(building, "getPrice"), knownBuildingPrice)) return `price:${name}`;
      const hooks = own(custom, name), mult = own(hooks, "cpsMult");
      if (!empty(own(hooks, "cpsAdd"))) return `hook:cpsAdd:${name}`;
      if (!(empty(mult) || plainHookArray(mult, 1) && own(mult, "length") === 1 && same(own(mult, "0"), knownBuildingRelay))) return `hook:cpsMult:${name}`;
      for (const key of ["amount", "bought", "storedCps", "storedTotalCps", "BestCpsAcceleration", "BestWaitTime", "BestBuyToAmount"]) {
        if (!writableData(building, key)) return `output:${name}.${key}`;
      }
    }
    for (const key of ["cookiesPs", "effs", "milkProgress", "buildingCps", "cookiesPsRaw", "cookiesPsRawHighest", "cpsSucked",
      "unbuffedCps", "globalCpsMult", "computedMouseCps", "lumpMatureAge", "lumpRipeAge", "lumpOverripeAge", "recalculateGains", "Win", "Logic", "CpsAchievements"]) {
      if (!writableData(game, key)) return `output:${key}`;
    }
    const typeKeys = ["cookiesPsByType", "cookiesMultByType"], typeTables = typeKeys.map(key => own(game, key));
    if (typeTables[0] && typeTables[0] === typeTables[1]) return "output:alias";
    for (const [index, key] of typeKeys.entries()) {
      const table = typeTables[index];
      if (table == null) continue;
      if (![null, Object.prototype].includes(Object.getPrototypeOf(table))) return `output:${key}`;
      const names = key === "cookiesMultByType" ? ["kittens", "eggs"] : [...buildings.map((b: any) => own(b, "name")), '"egg"'];
      for (const name of names) {
        if (!writableData(table, name)) return `output:${key}.${name}`;
      }
      // ponytail: standard numeric output records only; unknown aliases/metadata retain native simulation.
      const allowed = new Set(names);
      for (const name of Reflect.ownKeys(table)) {
        if (typeof name !== "string" || !allowed.has(name)) return `output:${key}`;
        const value = own(table, name);
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return `output:${key}`;
      }
    }
    // Unmodeled native mouse/lump inputs must not hide getters with per-call effects.
    for (const key of Object.getOwnPropertyNames(game)) {
      if (key !== "scriptLoaded" && !("value" in Object.getOwnPropertyDescriptor(game, key)!)) return "accessor";
    }
    return undefined;
  } catch { return "accessor"; }
}

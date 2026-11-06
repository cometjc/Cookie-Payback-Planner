import {observeCreatorLaunch} from "./creatorObserver";
import {knownPantheonGods, knownPantheonLaunch} from "./knownPantheonCreator";

const bindings = new WeakMap<Function, object>();
const own = (object: any, key: string): any => {
  if (!object) return undefined;
  const d = Object.getOwnPropertyDescriptor(object, key);
  if (d && "value" in d) return d.value;
  if (!d && !(key in object)) return undefined;
  throw Error("Opaque Pantheon field");
};

/** Observe future normal loads only; existing helpers never acquire retrospective provenance. */
export function installPantheonBindingObserver(game: any): () => void {
  try {
    if (!game || own(game, "version") !== 2.053) return () => {};
    const initial = Object.getOwnPropertyDescriptor(game, "scriptLoaded");
    if (initial ? !("value" in initial) || !initial.configurable || !initial.writable : "scriptLoaded" in game || !Object.isExtensible(game)) return () => {};
    let original = initial?.value, method: any, active = true;
    const wrap = (fn: any) => {
      if (typeof fn !== "function") return fn;
      let length: any, name: any;
      try { length = own(fn, "length"); name = own(fn, "name"); } catch { return fn; }
      const wrapped = function(this: any, ...args: any[]) {
        const who = args[0];
        if (!active) return fn.apply(this, args);
        let owner: any;
        try { owner = own(who, "name") === "Temple" ? own(who, "minigame") : undefined; }
        catch { return fn.apply(this, args); }
        if (!owner) return fn.apply(this, args);
        const observed = observeCreatorLaunch(game, owner, knownPantheonLaunch, () => fn.apply(this, args));
        try {
          const helper = own(game, "hasGod"), bound = observed.ownerOf(helper);
          if (bound === owner && typeof helper === "function") bindings.set(helper, owner);
        } catch { /* A third-party accessor remains opaque. */ }
        return observed.value;
      };
      // CCSE rewrites this function from toString(); retain its original source and signature.
      Object.defineProperties(wrapped, {
        toString: {value: () => fn.toString()}, length: {value: length}, name: {value: name},
      });
      return wrapped;
    };
    const get = () => method;
    const set = (fn: any) => { if (fn !== method) { original = fn; method = active ? wrap(fn) : fn; } };
    method = wrap(original);
    Object.defineProperty(game, "scriptLoaded", {configurable: true, enumerable: initial?.enumerable ?? true, get, set});
    return () => {
      active = false;
      const d = Object.getOwnPropertyDescriptor(game, "scriptLoaded");
      if (d?.get === get && d?.set === set && d.configurable && d.enumerable === (initial?.enumerable ?? true)) {
        if (!initial && original === undefined) delete game.scriptLoaded;
        else Object.defineProperty(game, "scriptLoaded", {...(initial || {configurable: true, enumerable: true, writable: true}), value: original});
      }
    };
  } catch { return () => {}; }
}

/** Binding proof and data purity are separate; never invoke the helper to validate either. */
export function pantheonBindingFailure(game: any, helper: Function): string | undefined {
  try {
    const owner = own(own(own(game, "Objects"), "Temple"), "minigame");
    if (!owner || bindings.get(helper) !== owner) return "pantheon-closure";
    const gods = own(owner, "gods"), slots = own(owner, "slot"), ids = new Set<number>();
    if (!gods || ![null, Object.prototype].includes(Object.getPrototypeOf(gods))
      || Reflect.ownKeys(gods).length !== knownPantheonGods.length) return "pantheon-data";
    for (const name of knownPantheonGods) {
      const id = own(own(gods, name), "id");
      if (!Number.isInteger(id) || id < 0 || ids.has(id)) return "pantheon-data";
      ids.add(id);
    }
    if (!Array.isArray(slots) || Object.getPrototypeOf(slots) !== Array.prototype
      || own(slots, "length") !== 3 || Reflect.ownKeys(slots).length !== 4) return "pantheon-data";
    for (let i = 0; i < 3; i++) {
      const id = own(slots, String(i));
      if (!Number.isInteger(id) || id !== -1 && !ids.has(id)) return "pantheon-data";
    }
    return undefined;
  } catch { return "pantheon-data"; }
}

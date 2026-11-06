import {afterEach, expect, it, vi} from "vitest";
import {installPantheonBindingObserver, pantheonBindingFailure} from "./pantheonBinding";

const source = vi.hoisted(() => "function(){var M=this;M.init=function(){Game.hasGod=function(){return M.slot[0];};};M.init();}");
vi.mock("./knownPantheonCreator", () => ({knownPantheonLaunch: source, knownPantheonGods: ["industry"]}));
const fixture = (strict = false) => {
  const game = {version: 2.053, Objects: {}};
  const owner = {gods: {industry: {id: 0}}, slot: [-1, -1, -1]};
  const temple = {name: "Temple", minigame: owner};
  game.Objects.Temple = temple;
  owner.launch = new Function("Game", `${strict ? '"use strict";' : ''}return (${source});`)(game);
  game.scriptLoaded = function(who, script) {who.minigame.launch(); return script;};
  return {game, owner, temple};
};
afterEach(() => vi.unstubAllGlobals());

it("observes a normal load, preserves CCSE source rewriting and restores the latest method", () => {
  const {game, temple} = fixture(), original = game.scriptLoaded;
  const stop = installPantheonBindingObserver(game);
  expect(game.scriptLoaded.toString()).toBe(original.toString());
  expect(game.scriptLoaded.length).toBe(original.length);
  const replacement = new Function(`return (${game.scriptLoaded.toString()});`)();
  game.scriptLoaded = replacement;
  expect(game.scriptLoaded(temple, "script")).toBe("script");
  expect(pantheonBindingFailure(game, game.hasGod)).toBeUndefined();
  expect(Object.getOwnPropertyDescriptor(game, "hasGod").value).toBe(game.hasGod);
  stop();
  expect(game.scriptLoaded).toBe(replacement);
  expect(Object.getOwnPropertyDescriptor(game, "scriptLoaded").value).toBe(replacement);
});
it("does not retrospectively bind an existing or same-source replacement helper", () => {
  const {game, owner, temple} = fixture();
  owner.launch(); const previous = game.hasGod;
  const stop = installPantheonBindingObserver(game);
  expect(pantheonBindingFailure(game, previous)).toBe("pantheon-closure");
  game.scriptLoaded(temple);
  const observed = game.hasGod;
  game.hasGod = new Function("M", `return (${observed.toString()});`)({slot: [1]});
  expect(pantheonBindingFailure(game, game.hasGod)).toBe("pantheon-closure");
  game.hasGod = observed;
  temple.minigame = {...owner};
  expect(pantheonBindingFailure(game, game.hasGod)).toBe("pantheon-closure");
  stop();
});
it("rechecks owner data without invoking slot or god accessors", () => {
  const {game, owner, temple} = fixture(), stop = installPantheonBindingObserver(game);
  game.scriptLoaded(temple); let reads = 0;
  Object.defineProperty(owner.slot, "0", {get() {reads++; return -1;}, configurable: true});
  expect(pantheonBindingFailure(game, game.hasGod)).toBe("pantheon-data");
  expect(reads).toBe(0);
  owner.slot = [-1, -1, -1];
  Object.defineProperty(owner.gods.industry, "id", {get() {reads++; return 0;}});
  expect(pantheonBindingFailure(game, game.hasGod)).toBe("pantheon-data");
  expect(reads).toBe(0); stop();
});
it("falls back when caller introspection or dynamic compilation is unavailable", () => {
  for (const strict of [false, true]) {
    const {game, temple} = fixture(strict), stop = installPantheonBindingObserver(game);
    if (!strict) vi.stubGlobal("Function", new Proxy(Function, {construct() {throw Error("CSP");}}));
    expect(() => game.scriptLoaded(temple)).not.toThrow();
    expect(pantheonBindingFailure(game, game.hasGod)).toBe("pantheon-closure");
    stop(); vi.unstubAllGlobals();
  }
});
it("supports installation before scriptLoaded exists and preserves third-party replacements", () => {
  const {game, temple} = fixture(), original = game.scriptLoaded;
  delete game.scriptLoaded;
  const stop = installPantheonBindingObserver(game);
  game.scriptLoaded = original;
  game.scriptLoaded(temple);
  expect(pantheonBindingFailure(game, game.hasGod)).toBeUndefined();
  const replacement = () => 8;
  Object.defineProperty(game, "scriptLoaded", {value: replacement, configurable: true});
  stop(); expect(game.scriptLoaded).toBe(replacement);
});
it("leaves unsupported versions and opaque load arguments to the native method", () => {
  const {game, temple} = fixture(), original = game.scriptLoaded;
  game.version = 999;
  installPantheonBindingObserver(game)();
  expect(game.scriptLoaded).toBe(original);
  game.version = 2.053;
  const stop = installPantheonBindingObserver(game); let reads = 0;
  Object.defineProperty(temple, "name", {get() {reads++; return "Temple";}});
  game.scriptLoaded(temple);
  expect(reads).toBe(0);
  expect(pantheonBindingFailure(game, game.hasGod)).toBe("pantheon-closure"); stop();
});
it("preserves zero argument calls and falls back when the Game cannot gain a helper field", () => {
  const {game, temple} = fixture(), original = game.scriptLoaded;
  game.scriptLoaded = function() {return arguments.length;};
  const stop = installPantheonBindingObserver(game);
  expect(game.scriptLoaded()).toBe(0);
  game.scriptLoaded = original;
  Object.preventExtensions(game);
  expect(game.scriptLoaded(temple, "native result")).toBe("native result");
  expect(Object.hasOwn(game, "hasGod")).toBe(false);
  expect(Object.getOwnPropertyDescriptor(temple.minigame, "init").value).toBe(temple.minigame.init);
  stop(); expect(game.scriptLoaded).toBe(original);
});

import {expect, it, vi} from "vitest";
const {game} = vi.hoisted(() => ({game: {}}));
vi.mock("./globals", () => ({Game: game}));
import {tryAutoBuyFromMainLoop} from "./lifecycle";

function fixture() {
  const item = {type: "building", id: 2, amount: 0, bought: 0, BestBuyToAmount: 100,
    getPrice() {return 20 + this.amount * 10;},
    buy: vi.fn(function(count) {
      for (let i = 0; i < (count || 100); i++) {
        const price = this.getPrice();
        if (game.cookies < price) break;
        game.cookies -= price; this.amount++;
      }
    })};
  Object.assign(game, {cookies: 120, unbuffedCps: 10, buyMode: 1, buyBulk: 100});
  const planner = {config: {autoBuy: true, isBanking: true}, autoBuyAttemptCount: 0,
    autoBuyBestCandidate: item, autoBuyBestCandidateAt: Date.now(), autoBuyCandidateMaxAgeMs: 10000,
    estimateWaitSeconds: () => 0, getBankCookies: () => 60, getCurrentBuyCount: () => 1, autoBuyRateWindow: {add() {}},
    enterSandBox: b => ({item: b, amount: b.amount, bought: b.bought}),
    leaveSandBox: s => {s.item.amount = s.amount; s.item.bought = s.bought;},
    purchaseRateWindow: {add() {}}, highPriorityIds: new Set(), autoBuyBuyCount: 0,
    autoBuyFastTrackUiMs: 100, autoBuyLastBoughtAt: 0};
  return {item, planner};
}

game.CalculateGains = () => {};

it("checks each native unit price and preserves the bank under bulk100", () => {
  const {item, planner} = fixture();
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.amount).toBe(2); expect(game.cookies).toBe(70);
  expect(item.buy.mock.calls).toEqual([[1], [1]]);
  expect(planner.pendingSimRecalc).toBe(true);
});

it("buys an affordable bulk100 target in one native batch after reserve preflight", () => {
  const {item, planner} = fixture(); game.cookies = 1000000;
  planner.getCurrentBuyCount = () => 100;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.amount).toBe(100);
  expect(item.buy.mock.calls).toEqual([[100]]);
  expect(game.cookies).toBeGreaterThanOrEqual(60);
});

it("skips intermediate gains when bulk buying without a bank reserve", () => {
  const {item, planner} = fixture(); planner.config.isBanking = false;
  planner.getCurrentBuyCount = () => 100; game.cookies = 1000000;
  const gains = game.CalculateGains;
  game.CalculateGains = vi.fn();
  try {
    tryAutoBuyFromMainLoop.call(planner);
    expect(item.amount).toBe(100); expect(item.buy.mock.calls).toEqual([[100]]);
    expect(game.CalculateGains).not.toHaveBeenCalled();
  } finally {game.CalculateGains = gains;}
});

it.each([10, 100])("buys only to the next multiple of %s", bulk => {
  const {item, planner} = fixture(); game.cookies = 1000000; item.amount = 123;
  item.BestBuyToAmount = 999; planner.getCurrentBuyCount = () => bulk;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.amount).toBe(bulk === 10 ? 130 : 200);
  expect(item.buy.mock.calls).toEqual([[bulk === 10 ? 7 : 77]]);
});

it.each([10, 100])("does not start an unaffordable batch of %s", bulk => {
  const {item, planner} = fixture(); planner.getCurrentBuyCount = () => bulk;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.buy).not.toHaveBeenCalled(); expect(item.amount).toBe(0); expect(game.cookies).toBe(120);
});

it("rejects a batch whose native prices rise as cookies are spent", () => {
  const {item, planner} = fixture();
  planner.getCurrentBuyCount = () => 10; planner.config.isBanking = false;
  game.cookies = 1000;
  item.getPrice = () => game.cookies >= 1000 ? 1 : 200;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.buy).not.toHaveBeenCalled();
  expect(item.amount).toBe(0); expect(game.cookies).toBe(1000);
});

it("rejects a batch affordable only after gains that native bulk buying defers", () => {
  const {item, planner} = fixture();
  planner.getCurrentBuyCount = () => 10; planner.config.isBanking = false;
  game.cookies = 20; game.cookiesPsRaw = 1;
  item.getPrice = () => game.cookiesPsRaw === 1 ? 10 : 1;
  const gains = game.CalculateGains;
  game.CalculateGains = () => {game.cookiesPsRaw = item.amount ? 2 : 1;};
  try {
    tryAutoBuyFromMainLoop.call(planner);
    expect(item.buy).not.toHaveBeenCalled();
    expect(item.amount).toBe(0); expect(game.cookies).toBe(20);
  } finally {game.CalculateGains = gains;}
});

it("keeps the reserve against native deferred-gains spending", () => {
  const {item, planner} = fixture(); planner.getCurrentBuyCount = () => 10;
  game.cookies = 150; game.cookiesPsRaw = 1;
  item.getPrice = () => game.cookiesPsRaw === 1 ? 10 : 1;
  const gains = game.CalculateGains;
  game.CalculateGains = () => {game.cookiesPsRaw = item.amount ? 2 : 1;};
  try {
    tryAutoBuyFromMainLoop.call(planner);
    expect(item.buy).not.toHaveBeenCalled();
    expect(item.amount).toBe(0); expect(game.cookies).toBe(150);
  } finally {game.CalculateGains = gains;}
});

it("rejects an entire batch when its post-purchase reserve rises beyond the balance", () => {
  const {item, planner} = fixture(); planner.getCurrentBuyCount = () => 10;
  game.cookies = 100000; planner.getBankCookies = () => item.amount >= 10 ? 100000 : 60;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.buy).not.toHaveBeenCalled(); expect(item.amount).toBe(0); expect(item.bought).toBe(0);
});

it("restores sandbox ownership when batch preflight throws", () => {
  const {item, planner} = fixture(); planner.getCurrentBuyCount = () => 100;
  game.cookies = 1000000;
  const gains = game.CalculateGains;
  game.CalculateGains = () => {throw Error('preflight gains');};
  try {
    expect(() => tryAutoBuyFromMainLoop.call(planner)).toThrow('preflight gains');
    expect(item.amount).toBe(0); expect(item.bought).toBe(0); expect(item.buy).not.toHaveBeenCalled();
    expect(game.cookies).toBe(1000000);
  } finally {game.CalculateGains = gains;}
});

it("starts a fresh full batch when already on a multiple", () => {
  const {item, planner} = fixture(); planner.getCurrentBuyCount = () => 10;
  game.cookies = 1000000; item.amount = item.bought = 130;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.amount).toBe(140); expect(item.buy.mock.calls).toEqual([[10]]);
});

it("rechecks a changing reserve before the next unit", () => {
  const {item, planner} = fixture();
  planner.getBankCookies = () => 60 + item.amount * 40;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.amount).toBe(1); expect(game.cookies).toBe(100);
});

it.each([NaN, Infinity, -1])("rejects invalid native price %s", price => {
  const {item, planner} = fixture(); item.getPrice = () => price;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.buy).not.toHaveBeenCalled(); expect(game.cookies).toBe(120);
});

it.each([NaN, Infinity, -1])("rejects invalid reserve %s", bank => {
  const {item, planner} = fixture(); planner.getBankCookies = () => bank;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.buy).not.toHaveBeenCalled(); expect(game.cookies).toBe(120);
});

it("stops at the recommendation target even with an affordable larger bulk", () => {
  const {item, planner} = fixture(); game.cookies = 1000000; item.BestBuyToAmount = 3;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.amount).toBe(3); expect(item.buy).toHaveBeenCalledTimes(3);
});

it("preserves native upgrade buy arguments and stops once owned", () => {
  const {planner} = fixture();
  const upgrade = {type: "upgrade", id: 3, bought: 0, getPrice: () => 20,
    buy: vi.fn(function() {if (!this.bought) {this.bought = 1; game.cookies -= 20;}})};
  game.UpgradesInStore = [upgrade]; planner.autoBuyBestCandidate = upgrade;
  tryAutoBuyFromMainLoop.call(planner);
  expect(upgrade.bought).toBe(1); expect(game.cookies).toBe(100);
  expect(upgrade.buy.mock.calls.every(args => args.length === 0)).toBe(true);
});

it("allows equality at the reserve and preserves native bulk when banking is off", () => {
  const {item, planner} = fixture(); game.cookies = 80;
  tryAutoBuyFromMainLoop.call(planner);
  expect(item.amount).toBe(1); expect(game.cookies).toBe(60);
  const next = fixture(); next.planner.config.isBanking = false;
  tryAutoBuyFromMainLoop.call(next.planner);
  expect(next.item.buy.mock.calls[0]).toEqual([]);
  expect(next.item.amount).toBe(3); expect(game.cookies).toBe(30);
});

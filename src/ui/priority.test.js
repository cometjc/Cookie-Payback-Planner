import { afterEach, expect, it, vi } from "vitest";
const game = vi.hoisted(() => ({ cookies: 20, cookiesPs: 1, ObjectsById: [], UpgradesInStore: [] }));
vi.mock("../core/globals", () => ({ Game: game, l: vi.fn(), PlaySound: vi.fn() }));
vi.mock("../strategy/engine", () => ({ refreshStrategyScores: vi.fn() }));
import { updateUI } from "./render";
import { getPriorityScore } from "../strategy/selectors";
import { ExperimentalBatch } from "../calc/experimentalBatch";

afterEach(() => vi.unstubAllGlobals());
it("indexes priorities once while preserving the reference ordering and ties", () => {
  vi.stubGlobal("document", { getElementById: () => null });
  const items = Array.from({ length: 30 }, (_, id) => ({
    id, type: "building", BestCpsAcceleration: 0,
    l: { isConnected: false, classList: { contains: () => false } },
    getPrice: vi.fn(() => id % 3 === 0 ? 10 : 100),
  }));
  game.ObjectsById = items;
  const actual = [];
  const planner = {
    getButtonID: key => key,
    config: {}, experimentalBatch: new ExperimentalBatch(),
    tickCount: 0, performanceExperiment: { withRefresh: fn => fn() },
    sampleSmoothedClickCps() {}, tuneAdaptiveBudget: () => 30,
    lastComputedAtByItem: new Map(items.map(x => [`building:${x.id}`, 100])),
    maxStalenessMs: 1000, highPriorityIds: new Set(["building:2"]),
    minBudget: 3, maxBudget: 60,
    updateBestCpsAcceleration: item => actual.push(item.id),
    updateHelperOrder() {}, updateColorRender() {},
    strategyState: { scoreByItem: new Map() },
  };
  const expected = [...items].sort((a, b) => getPriorityScore(planner, b, Date.now(), new Set()) - getPriorityScore(planner, a, Date.now(), new Set())).map(x => x.id);
  items.forEach(x => x.getPrice.mockClear());
  updateUI.call(planner);
  expect(actual).toEqual(expected);
  items.forEach(x => expect(x.getPrice).toHaveBeenCalledTimes(1));
});

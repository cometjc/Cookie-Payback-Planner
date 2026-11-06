import { describe, expect, it } from "vitest";
import { createBuildingCpsModel } from "./buildingCpsModel";

const node = (id, extra = {}) => ({ id, baseCps: 10, tierMultipliers: [], synergies: [], fortune: false, grandma: false, ...extra });
describe("pure building CPS overlay", () => {
  it("preserves formula order and both synergy directions", () => {
    const synergies = [{ tie1: 2, tie2: 3, enabled: true }];
    const model = createBuildingCpsModel([node(2, { tierMultipliers: [2, 2.3], synergies, fortune: true, grandma: true }), node(3, { synergies })], [0, 17, 5, 9]);
    let mult = 1; mult *= 2; mult *= 2.3; mult *= 1 + .05 * 9; mult *= 1.07; mult *= 1 + 17 * .01 * (1 / (2 - 1));
    expect(model.fork().cps(2)).toBe(10 * mult);
    expect(model.fork().cps(3)).toBe(10 * (1 + .001 * 5));
  });
  it("shares unaffected nodes, isolates branches and rebases without changing old forks", () => {
    const nodes = [node(2, { grandma: true }), node(3)];
    const amounts = [0, 10, 1, 1], model = createBuildingCpsModel(nodes, amounts);
    const old = model.fork(); expect(old.cps(2)).toBe(11); expect(old.cps(3)).toBe(10);
    const before = model.computations;
    const branch = model.fork([[1, 20]]);
    expect(branch.cps(3)).toBe(10); expect(model.computations).toBe(before);
    expect(branch.cps(2)).toBe(12); expect(old.cps(2)).toBe(11);
    const after = model.computations;
    model.rebase(nodes, [0, 20, 1, 1]);
    expect(model.fork().cps(3)).toBe(10); expect(model.computations).toBe(after);
    expect(model.fork().cps(2)).toBe(12); expect(old.cps(2)).toBe(11);
    nodes[0].baseCps = 99; amounts[1] = 99;
    expect(old.cps(2)).toBe(11);
  });
  it("invalidates changed rules and rejects invalid inputs without changing the base", () => {
    const model = createBuildingCpsModel([node(2)], [0, 0, 1]);
    const old = model.fork(); expect(old.cps(2)).toBe(10);
    model.rebase([node(2, { fortune: true })], [0, 0, 1]);
    expect(model.fork().cps(2)).toBe(10.700000000000001); expect(old.cps(2)).toBe(10);
    for (const patch of [[[8, 1]], [[2, NaN]], [[2, -1]], [[2, 1], [2, 2]]]) expect(() => model.fork(patch)).toThrow();
    expect(() => model.rebase([node(2), node(2)], [0, 0, 1])).toThrow();
    expect(model.fork().cps(2)).toBe(10.700000000000001);
    expect(() => old.cps(99)).toThrow();
  });
  it("rejects sparse amount snapshots before installing a new base", () => {
    const model = createBuildingCpsModel([node(2)], [0, 0, 1]);
    const sparse = Array(3); sparse[0] = 0; sparse[2] = 1;
    expect(() => model.rebase([node(2, { grandma: true })], sparse)).toThrow();
    expect(model.fork().cps(2)).toBe(10);
  });
  it("keeps uncomputed old branches immutable and invalidates synergy neighbours only", () => {
    const nodes = [node(2, { synergies: [{ tie1: 2, tie2: 3, enabled: true }] }), node(3), node(4)];
    const model = createBuildingCpsModel(nodes, [0, 10, 5, 9, 2]);
    const old = model.fork();
    expect(model.fork().cps(4)).toBe(10);
    model.rebase(nodes, [0, 10, 5, 19, 2]);
    const before = model.computations;
    expect(model.fork().cps(4)).toBe(10); expect(model.computations).toBe(before);
    expect(model.fork().cps(2)).toBe(10 * (1 + .05 * 19));
    expect(old.cps(2)).toBe(10 * (1 + .05 * 9));
    nodes[0].synergies[0].enabled = false;
    expect(old.cps(2)).toBe(10 * (1 + .05 * 9));
  });
});

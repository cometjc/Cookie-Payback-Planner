export type BuildingCpsNode = {
  id: number; baseCps: number; tierMultipliers: number[];
  synergies: { tie1: number; tie2: number; enabled: boolean }[];
  fortune: boolean; grandma: boolean;
};
type Entry = { node: BuildingCpsNode; dependencies: number[]; result?: number };
const number = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Pure ordinary-building formulas; callers validate game rules before constructing nodes. */
export function createBuildingCpsModel(nodes: BuildingCpsNode[], amounts: number[]) {
  let entries = new Map<number, Entry>(), base: number[] = [], computations = 0;
  const snapshot = (input: BuildingCpsNode[], values: number[]) => {
    if (!Array.isArray(values) || [...values].some(n => !number(n))) throw Error("Invalid building amounts");
    const next = new Map<number, Entry>();
    for (const raw of input) {
      if (!Number.isInteger(raw.id) || raw.id < 2 || raw.id >= values.length || next.has(raw.id)
        || !number(raw.baseCps) || ![...raw.tierMultipliers].every(number)
        || typeof raw.fortune !== "boolean" || typeof raw.grandma !== "boolean") throw Error("Invalid building node");
      const node = { ...raw, tierMultipliers: [...raw.tierMultipliers], synergies: raw.synergies.map(s => ({ ...s })) };
      const dependencies = new Set<number>();
      for (const s of node.synergies) {
        if (![s.tie1, s.tie2].every(id => Number.isInteger(id) && id >= 0 && id < values.length)
          || typeof s.enabled !== "boolean") throw Error("Invalid synergy");
        if (s.enabled && s.tie1 === node.id) dependencies.add(s.tie2);
        else if (s.enabled && s.tie2 === node.id) dependencies.add(s.tie1);
      }
      if (node.grandma) dependencies.add(1);
      const old = entries.get(node.id);
      next.set(node.id, old && JSON.stringify(old.node) === JSON.stringify(node)
        && old.dependencies.every(id => Object.is(base[id], values[id])) ? old : { node, dependencies: [...dependencies] });
    }
    return next;
  };
  const model = {
    get computations() { return computations; },
    rebase(input: BuildingCpsNode[], values: number[]) {
      const next = snapshot(input, values);
      entries = next; base = [...values];
    },
    fork(patches: Array<[number, number]> = []) {
      const values = [...base], seen = new Set<number>();
      for (const [id, value] of patches) {
        if (!Number.isInteger(id) || id < 0 || id >= values.length || seen.has(id) || !number(value)) throw Error("Invalid building patch");
        seen.add(id); values[id] = value;
      }
      const branch = new Map<number, Entry>();
      for (const [id, entry] of entries) branch.set(id, entry.dependencies.some(d => !Object.is(values[d], base[d]))
        ? { node: entry.node, dependencies: entry.dependencies } : entry);
      return { cps(id: number) {
        const entry = branch.get(id);
        if (!entry) throw Error("Unknown building node");
        if (entry.result !== undefined) return entry.result;
        const n = entry.node;
        let mult = 1;
        for (const tier of n.tierMultipliers) mult *= tier;
        for (const s of n.synergies) if (s.enabled) {
          if (s.tie1 === n.id) mult *= 1 + .05 * values[s.tie2];
          else if (s.tie2 === n.id) mult *= 1 + .001 * values[s.tie1];
        }
        if (n.fortune) mult *= 1.07;
        if (n.grandma) mult *= 1 + values[1] * .01 * (1 / (n.id - 1));
        computations++;
        return entry.result = n.baseCps * mult;
      } };
    }
  };
  model.rebase(nodes, amounts);
  return model;
}

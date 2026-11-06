import { createBuildingCpsModel, type BuildingCpsNode } from "./buildingCpsModel";
import { createCursorCps, createGrandmaCps, type CursorCpsInput, type GrandmaCpsInput } from "./specialBuildingCps";
import type { productionMultipliers } from "./productionMultipliers";
type Tier = Omit<BuildingCpsNode, "baseCps">;
export type ProductionSnapshot = {
  amounts: number[]; levels: number[]; ordinary: BuildingCpsNode[]; specialTiers: [Tier, Tier];
  cursor: Omit<CursorCpsInput, "amounts" | "tierMultiplier">;
  grandma: Omit<GrandmaCpsInput, "amounts" | "tierMultiplier">;
  ascensionMode: number; egg: boolean; milkTablets: boolean;
};
type Multipliers = ReturnType<typeof productionMultipliers>;
const number = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
/** Pure projection; checkpoints require exact ages/century clocks. takeOwnership requires a private numeric capture never reused or exposed. */
export function createProductionProjection(input: ProductionSnapshot, takeOwnership = false) {
  const s: ProductionSnapshot = takeOwnership && !("toJSON" in Object.prototype) && !("toJSON" in Array.prototype) ? input : JSON.parse(JSON.stringify(input, (_key, value) => {
    if (value === null || typeof value === "number" && !Number.isFinite(value)
      || !["object", "number", "boolean"].includes(typeof value)) throw Error("Invalid production snapshot");
    return value;
  }));
  if (!s || !Array.isArray(s.amounts) || s.amounts.length < 3 || ![...s.amounts].every(number)
    || !Array.isArray(s.levels) || s.levels.length !== s.amounts.length || ![...s.levels].every(number)
    || ![0, 1].includes(s.ascensionMode) || typeof s.egg !== "boolean" || typeof s.milkTablets !== "boolean"
    || !Array.isArray(s.specialTiers) || s.specialTiers.length !== 2 || !Array.isArray(s.ordinary)
    || s.ordinary.length !== s.amounts.length - 2) throw Error("Invalid production snapshot");
  const model = createBuildingCpsModel(s.ordinary, s.amounts);
  const baseBranch = model.fork();
  for (let id = 2; id < s.amounts.length; id++) baseBranch.cps(id);
  const tier = (id: number, amounts: number[]) => {
    const n = s.specialTiers[id];
    if (!n || n.id !== id || !Array.isArray(n.tierMultipliers) || ![...n.tierMultipliers].every(number)
      || !Array.isArray(n.synergies) || typeof n.fortune !== "boolean" || n.grandma !== false) throw Error("Invalid special tier rules");
    let mult = 1;
    for (const factor of n.tierMultipliers) mult *= factor;
    for (const syn of n.synergies) {
      if (!syn || ![syn.tie1, syn.tie2].every(i => Number.isInteger(i) && i >= 0 && i < amounts.length)
        || typeof syn.enabled !== "boolean") throw Error("Invalid special synergy");
      if (syn.enabled && syn.tie1 === id) mult *= 1 + .05 * amounts[syn.tie2];
      else if (syn.enabled && syn.tie2 === id) mult *= 1 + .001 * amounts[syn.tie1];
    }
    if (n.fortune) mult *= 1.07;
    return mult;
  };
  const cursor = createCursorCps(s.cursor), grandma = createGrandmaCps(s.grandma);
  const special = (amounts: number[]) => [cursor(amounts, tier(0, amounts)), grandma(amounts, tier(1, amounts))];
  const baseSpecial = special(s.amounts);
  // ponytail: pinned standard Objects order (Cursor, Grandma, then dense IDs); unknown order/hooks need a guarded adapter.
  return { fork(patches: Array<[number, number]>, checkpoints: Multipliers) {
    if (!checkpoints || ![checkpoints.buildMult, checkpoints.milkProgress, checkpoints.milkMult, checkpoints.catMult, checkpoints.rawMult, checkpoints.unbuffedMult].every(number)) throw Error("Invalid production checkpoints");
    const branch = model.fork(patches), amounts = [...s.amounts];
    for (const [id, amount] of patches) amounts[id] = amount;
    const cps = patches.length ? special(amounts) : baseSpecial, buildings = [];
    let buildingCps = 0;
    for (let id = 0; id < amounts.length; id++) {
      let storedCps = id < 2 ? cps[id] : branch.cps(id);
      if (s.ascensionMode !== 1) storedCps *= (1 + s.levels[id] * .01) * checkpoints.buildMult;
      if (id === 1 && s.milkTablets) storedCps *= 1 + .05 * checkpoints.milkProgress * checkpoints.milkMult;
      const storedTotalCps = amounts[id] * storedCps;
      buildingCps += storedTotalCps; buildings.push({ id, storedCps, storedTotalCps });
    }
    const total = s.egg ? buildingCps + 9 : buildingCps;
    return { buildings, buildingCps, cookiesPsRaw: total * checkpoints.rawMult, unbuffedCps: total * checkpoints.unbuffedMult };
  } };
}

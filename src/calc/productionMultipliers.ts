type Gods = { asceticism: number; ages: number; decadence: number; industry: number; labor: number; mother: number };
export type ProductionMultiplierSnapshot = {
  owned: string[]; cookiePowers: number[]; goldenUpgrades: boolean[]; ascensionMode: number;
  prestige: number; heavenlyPower: number; heavenlyMultiplier: number; cpsEffect: number; milkEffect: number;
  heralds: number; santaLevel: number; achievements: number; breathOfMilk: number; radiantAppetite: number;
  dragonFortune: number; gods: Gods; startDate: number; lumps: number; goldenCount: number; bakeryName: string; veilBoost: number;
};
const bonuses: [string, number][] = [["Specialized chocolate chips",1.01],["Designer cocoa beans",1.02],["Underworld ovens",1.03],["Exotic nuts",1.04],["Arcane sugar",1.05],["Increased merriness",1.15],["Improved jolliness",1.15],["A lump of coal",1.01],["An itchy sweater",1.01],["Santa's dominion",1.2],["Fortune #100",1.01],["Fortune #101",1.07],["Dragon scale",1.03]];
const kittens: [string, number][] = [["Kitten helpers",.1],["Kitten workers",.125],["Kitten engineers",.15],["Kitten overseers",.175],["Kitten managers",.2],["Kitten accountants",.2],["Kitten specialists",.2],["Kitten experts",.2],["Kitten consultants",.2],["Kitten assistants to the regional manager",.175],["Kitten marketeers",.15],["Kitten analysts",.125],["Kitten executives",.115],["Kitten admins",.11],["Kitten strategists",.105],["Kitten angels",.1],["Fortune #103",.05]];
const eggs = ["Chicken egg","Duck egg","Turkey egg","Quail egg","Robin egg","Ostrich egg","Cassowary egg","Salmon roe","Frogspawn","Shark egg","Turtle egg","Ant larva"];
const numeric = ["prestige","heavenlyPower","heavenlyMultiplier","cpsEffect","milkEffect","heralds","santaLevel","achievements","breathOfMilk","radiantAppetite","dragonFortune","startDate","lumps","veilBoost"] as const;
const godNames = ["asceticism","ages","decadence","industry","labor","mother"] as const;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const dense = (v: unknown, valid: (n: any) => boolean): boolean => Array.isArray(v) && [...v].every(valid);
/** nowMs is the ages read; centuryNowMs is the later Century egg read. Pure 2.053 checkpoints; cookiePowers contains owned powers in original order. Game rules/hooks must be guarded by the caller. */
export function productionMultipliers(s: ProductionMultiplierSnapshot, nowMs: number, centuryNowMs = nowMs) {
  if (!s || !finite(nowMs) || nowMs < 0 || !finite(centuryNowMs) || centuryNowMs < 0 || numeric.some(k => !finite(s[k]) || s[k] < 0)
    || ![0,1].includes(s.ascensionMode) || !Number.isSafeInteger(s.goldenCount) || s.goldenCount < 0
    || !dense(s.owned, n => typeof n === "string") || !dense(s.cookiePowers, n => finite(n) && n >= 0)
    || !dense(s.goldenUpgrades, n => typeof n === "boolean") || typeof s.bakeryName !== "string"
    || !s.gods || godNames.some(k => ![-1,0,1,2,3].includes(s.gods[k]))) throw Error("Invalid production multiplier snapshot");
  const owned = new Set(s.owned), has = (name: string) => owned.has(name), g = s.gods;
  let mult = 1;
  if (s.ascensionMode !== 1) mult += s.prestige * .01 * s.heavenlyPower * s.heavenlyMultiplier;
  mult *= s.cpsEffect;
  if (has("Heralds") && s.ascensionMode !== 1) mult *= 1 + .01 * s.heralds;
  for (const power of s.cookiePowers) mult *= 1 + power * .01;
  for (const [name, factor] of bonuses) if (has(name)) mult *= factor;
  let buildMult = 1;
  if (g.asceticism === 1) mult *= 1.15; else if (g.asceticism === 2) mult *= 1.1; else if (g.asceticism === 3) mult *= 1.05;
  if (g.ages >= 1) mult *= 1 + .15 * Math.sin((nowMs / 1000 / (60 * 60 * [3,12,24][g.ages - 1])) * Math.PI * 2);
  if (g.decadence === 1) buildMult *= .93; else if (g.decadence === 2) buildMult *= .95; else if (g.decadence === 3) buildMult *= .98;
  if (g.industry === 1) buildMult *= 1.1; else if (g.industry === 2) buildMult *= 1.06; else if (g.industry === 3) buildMult *= 1.03;
  if (g.labor === 1) buildMult *= .97; else if (g.labor === 2) buildMult *= .98; else if (g.labor === 3) buildMult *= .99;
  if (has("Santa's legacy")) mult *= 1 + (s.santaLevel + 1) * .03;
  const milkProgress = s.achievements / 25;
  let milkMult = 1;
  if (has("Santa's milk and cookies")) milkMult *= 1.05;
  milkMult *= 1 + s.breathOfMilk * .05;
  if (g.mother === 1) milkMult *= 1.1; else if (g.mother === 2) milkMult *= 1.05; else if (g.mother === 3) milkMult *= 1.03;
  milkMult *= s.milkEffect;
  let catMult = 1;
  for (const [name, factor] of kittens) if (has(name)) catMult *= 1 + milkProgress * factor * milkMult;
  mult *= catMult;
  let eggMult = 1;
  for (const name of eggs) if (has(name)) eggMult *= 1.01;
  if (has("Century egg")) {
    let day = Math.floor((centuryNowMs - s.startDate) / 1000 / 10) * 10 / 60 / 60 / 24;
    day = Math.min(day,100); eggMult *= 1 + (1 - Math.pow(1 - day / 100,3)) * .1;
  }
  mult *= eggMult;
  if (has("Sugar baking")) mult *= 1 + Math.min(100,s.lumps) * .01;
  mult *= 1 + s.radiantAppetite;
  const rawMult = mult;
  for (let i = 0; i < s.goldenCount; i++) mult *= 1 + s.dragonFortune * 1.23;
  const name = s.bakeryName.toLowerCase();
  if (name === "orteil") mult *= .99; else if (name === "ortiel") mult *= .98;
  if (has("Elder Covenant")) mult *= .95;
  if (has("Golden switch [off]")) {
    let switchMult = 1.5;
    if (has("Residual luck")) for (const bought of s.goldenUpgrades) if (bought) switchMult += .1;
    mult *= switchMult;
  }
  if (has("Shimmering veil [off]")) mult *= 1 + s.veilBoost;
  if (has("Magic shenanigans")) mult *= 1000;
  if (has("Occult obstruction")) mult *= 0;
  // ponytail: pre-buff production only; mouse/lumps/hooks require a separately guarded projection.
  return { buildMult, milkProgress, milkMult, catMult, rawMult, unbuffedMult: mult };
}

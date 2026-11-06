type Common = { amounts: number[]; tierMultiplier: number; effect: number };
// fingers: Thousand through Undecillion, then Unshackled cursors; basic: Reinforced, Carpal, Ambidextrous.
export type CursorCpsInput = Common & { fingers: boolean[]; basic: boolean[] };
// upgrades: Bingo, Ritual, Naughty, Elderwort, Cat ladies, One mind, Communal, Elder Pact (in that order).
export type GrandmaCpsInput = Common & {
  portalIndex: number; baseCps: number; upgrades: boolean[]; synergyOwned: boolean[]; kittensOwned: boolean[]; elderBattalion: number;
};
const number = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
const booleans = (values: unknown, length?: number): values is boolean[] => Array.isArray(values)
  && (length === undefined || values.length === length) && [...values].every(v => typeof v === "boolean");
function validate(input: Common) {
  if (!Array.isArray(input.amounts) || input.amounts.length < 2 || ![...input.amounts].every(number)
    || !number(input.tierMultiplier) || !number(input.effect)) throw Error("Invalid special building inputs");
}
// ponytail: pinned 2.053 formulas with empty CPS hooks and magicCpS=1; validate rules in the future Game adapter.
// Amounts follow Objects enumeration order, with Cursor at 0 and Grandma at 1; tierMultiplier is an exact helper checkpoint.
/** Snapshot fixed upgrade factors; each call validates the dynamic amounts and tier. */
export function createCursorCps(input: Omit<CursorCpsInput, "amounts" | "tierMultiplier">) {
  const effect = input.effect;
  if (!number(effect)) throw Error("Invalid special building inputs");
  if (!booleans(input.fingers, 13) || !booleans(input.basic, 3)) throw Error("Invalid Cursor upgrades");
  let add = 0;
  if (input.fingers[0]) add += .1;
  for (let i = 1; i < 13; i++) if (input.fingers[i]) add *= i === 1 ? 5 : i === 2 ? 10 : i === 12 ? 25 : 20;
  const fingers = add, base = .1 * Math.pow(2, Number(input.basic[0]) + Number(input.basic[1]) + Number(input.basic[2]));
  return (amounts: number[], tierMultiplier: number) => {
    validate({amounts, tierMultiplier, effect});
    let num = 0;
    for (let i = 1; i < amounts.length; i++) num += amounts[i];
    const add = fingers * num;
    let mult = 1;
    mult *= tierMultiplier;
    mult *= 1;
    mult *= effect;
    return (base + add) * mult;
  };
}
export function cursorCps(input: CursorCpsInput) {
  return createCursorCps(input)(input.amounts, input.tierMultiplier);
}
export function createGrandmaCps(input: Omit<GrandmaCpsInput, "amounts" | "tierMultiplier">) {
  const {effect, portalIndex, baseCps, elderBattalion} = input;
  if (!number(effect)) throw Error("Invalid special building inputs");
  if (!Number.isInteger(portalIndex) || portalIndex < 2
    || !number(baseCps) || !number(elderBattalion) || !booleans(input.upgrades, 8)
    || !booleans(input.synergyOwned) || !booleans(input.kittensOwned)) throw Error("Invalid Grandma inputs");
  const u = input.upgrades;
  let mult = 1;
  for (const owned of input.synergyOwned) if (owned) mult *= 2;
  if (u[0]) mult *= 4;
  if (u[1]) mult *= 2;
  if (u[2]) mult *= 2;
  if (u[3]) mult *= 1.02;
  mult *= effect;
  if (u[4]) for (const owned of input.kittensOwned) if (owned) mult *= 1.29;
  const prefix = mult, oneMind = u[5], communal = u[6], elderPact = u[7];
  return (amounts: number[], tierMultiplier: number) => {
    validate({amounts, tierMultiplier, effect});
    if (portalIndex >= amounts.length) throw Error("Invalid Grandma inputs");
    let mult = prefix;
    mult *= tierMultiplier;
    let add = 0;
    if (oneMind) add += amounts[1] * .02;
    if (communal) add += amounts[1] * .02;
    if (elderPact) add += amounts[portalIndex] * .05;
    let num = 0;
    for (let i = 0; i < amounts.length; i++) if (i !== 1) num += amounts[i];
    mult *= 1 + elderBattalion * .01 * num;
    mult *= 1;
    return (baseCps + add) * mult;
  };
}
export function grandmaCps(input: GrandmaCpsInput) {
  return createGrandmaCps(input)(input.amounts, input.tierMultiplier);
}

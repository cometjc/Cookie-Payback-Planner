import { CookiePaybackPlanner } from "./core/predictor";
import { ensureCCSE, getCCSE } from "./core/globals";

const cookieProfitPredictor = new CookiePaybackPlanner();

if (!cookieProfitPredictor.isLoaded) {
  const ccse = getCCSE();
  if (ccse && ccse.isLoaded) {
    cookieProfitPredictor.register();
  } else {
    const ensured = ensureCCSE();
    ensured.postLoadHooks?.push(() => cookieProfitPredictor.register());
  }
}

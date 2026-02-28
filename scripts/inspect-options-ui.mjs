import process from "node:process";
import { loadProjectEnv } from "./env-runtime.mjs";

loadProjectEnv();
const debugOrigin = process.env.COOKIE_REMOTE_DEBUG_URL || "http://127.0.0.1:9222";

async function getJson(pathname) {
  const res = await fetch(`${debugOrigin}${pathname}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${pathname}`);
  return res.json();
}

function isCookieTarget(target) {
  const source = `${target?.title || ""} ${target?.url || ""}`.toLowerCase();
  return source.includes("cookie clicker") || source.includes("orteil.dashnet.org");
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  ws.onmessage = (event) => {
    const data = JSON.parse(String(event.data));
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(JSON.stringify(data.error)));
      else resolve(data.result || {});
    }
  };
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      ws.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  return { ws, send };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result?.exceptionDetails) {
    const details = result.exceptionDetails;
    throw new Error(details?.exception?.description || details?.text || "Evaluate exception");
  }
  return result?.result?.value;
}

async function main() {
  const targets = await getJson("/json/list");
  const pageTargets = targets.filter((t) => t?.type === "page");
  const target = pageTargets.find(isCookieTarget) || pageTargets[0];
  if (!target?.webSocketDebuggerUrl) throw new Error("No Cookie target.");
  const cdp = createCdpClient(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    cdp.ws.onopen = resolve;
    cdp.ws.onerror = () => reject(new Error("WebSocket connect failed"));
  });
  try {
    await cdp.send("Runtime.enable");
    const data = await evaluate(
      cdp,
      `(() => {
        const mods = globalThis.Game?.mods || {};
        const mod = mods["Best Deal Helper"] || mods["BestDealHelper"] || null;
        const result = { modFound: Boolean(mod), knownMods: Object.keys(mods || {}) };
        if (mod) {
          result.modVersion = mod.version;
          result.configKeys = Object.keys(mod.config || {});
        }
        try {
          if (globalThis.Game?.ShowMenu) globalThis.Game.ShowMenu("prefs");
          if (globalThis.Game?.UpdateMenu) globalThis.Game.UpdateMenu();
          if (mod && typeof mod.addOptionsMenu === "function") {
            try {
              mod.addOptionsMenu();
              result.manualAddOptions = "ok";
            } catch (err) {
              result.manualAddOptions = "error:" + String(err);
            }
          }
          result.menuVisible = Boolean(document.getElementById("menu"));
          result.updateIntervalSliderExists = Boolean(document.getElementById("CookieProfitPredictor_UpdateMSSlider"));
          result.topKInputExists = [...document.querySelectorAll("label")].some((el) => String(el.textContent || "").includes("Top-K"));
        } catch (err) {
          result.menuError = String(err);
        }
        return result;
      })()`,
    );
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } finally {
    cdp.ws.close();
  }
}

main().catch((error) => {
  process.stderr.write(`[inspect-options-ui] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});


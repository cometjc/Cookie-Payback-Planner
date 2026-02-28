import process from "node:process";
import { loadProjectEnv } from "./env-runtime.mjs";

loadProjectEnv();
const debugOrigin = process.env.COOKIE_REMOTE_DEBUG_URL || "http://127.0.0.1:9444";

async function getJson(pathname) {
  const res = await fetch(`${debugOrigin}${pathname}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${pathname}`);
  }
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
    const description = details?.exception?.description || details?.text || "unknown";
    throw new Error(`Evaluate exception: ${description}`);
  }
  return result?.result?.value;
}

async function main() {
  const targets = await getJson("/json/list");
  const pageTargets = targets.filter((t) => t?.type === "page");
  const target = pageTargets.find(isCookieTarget) || pageTargets[0];
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No debuggable Cookie Clicker target found.");
  }

  const cdp = createCdpClient(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    cdp.ws.onopen = resolve;
    cdp.ws.onerror = () => reject(new Error("WebSocket connect failed"));
  });

  try {
    await cdp.send("Runtime.enable");
    const result = await evaluate(
      cdp,
      `(() => {
        const mods = globalThis.Game?.mods || {};
        const mod =
          mods["Best Deal Helper"] ||
          mods["BestDealHelper"] ||
          mods["Cookie Payback Planner"] ||
          null;
        if (!mod) {
          return { ok: false, reason: "mod-not-found", knownKeys: Object.keys(mods || {}) };
        }
        const now = Date.now();
        const startedAt = Number(mod.autoBuyMetricsWindowStartedAt || mod.metricsWindowStartedAt || now);
        const elapsedSec = Math.max(1, (now - startedAt) / 1000);
        const refreshSuccess = Number(mod.refreshSuccessCount || 0);
        const refreshAttempts = Number(mod.refreshAttemptCount || 0);
        const refreshHz = refreshSuccess / elapsedSec;
        return {
          ok: true,
          autoBuy: Boolean(mod.config?.autoBuy),
          refreshSuccess,
          refreshAttempts,
          elapsedSec: Number(elapsedSec.toFixed(1)),
          estimatedAutoBuyHz: Number(refreshHz.toFixed(3)),
          uiUpdateMs: Number(mod.config?.updateMS || 0),
          strategyRecomputeMs: Number(mod.config?.strategyRecomputeMs || 0),
          tickCount: Number(mod.tickCount || 0),
        };
      })();`,
    );
    process.stdout.write(`[inspect:auto-buy-hz] ${JSON.stringify(result)}\n`);
  } finally {
    cdp.ws.close();
  }
}

main().catch((error) => {
  process.stderr.write(`[inspect:auto-buy-hz] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});


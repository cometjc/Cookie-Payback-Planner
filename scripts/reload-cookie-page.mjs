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

async function main() {
  const targets = await getJson("/json/list");
  const pageTargets = targets.filter((t) => t?.type === "page");
  const target = pageTargets.find(isCookieTarget) || pageTargets[0];
  if (!target?.webSocketDebuggerUrl) throw new Error("No target found.");
  const cdp = createCdpClient(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    cdp.ws.onopen = resolve;
    cdp.ws.onerror = () => reject(new Error("WebSocket connect failed"));
  });
  await cdp.send("Page.enable");
  await cdp.send("Page.reload", { ignoreCache: true });
  cdp.ws.close();
  process.stdout.write("[reload] Cookie Clicker page reload triggered.\n");
}

main().catch((error) => {
  process.stderr.write(`[reload] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});


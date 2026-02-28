import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";

const defaultPort = 9222;
const defaultOrigin = `http://127.0.0.1:${defaultPort}`;
const defaultExe = "D:\\SteamLibrary\\steamapps\\common\\Cookie Clicker\\Cookie Clicker.exe";
const defaultSteamExe = "C:\\Program Files (x86)\\Steam\\steam.exe";
const defaultSteamAppId = "1454400";

export function getInspectConfig() {
  const debugPort = Number.parseInt(process.env.COOKIE_REMOTE_DEBUG_PORT || `${defaultPort}`, 10);
  const debugOrigin = process.env.COOKIE_REMOTE_DEBUG_URL || `http://127.0.0.1:${debugPort}`;
  const cookieExePath = process.env.COOKIE_CLICKER_EXE || defaultExe;
  const launchArgsRaw = process.env.COOKIE_CLICKER_ARGS || `--remote-debugging-port=${debugPort}`;
  const launchArgs = launchArgsRaw.split(/\s+/).filter(Boolean);
  const launchMode = process.env.COOKIE_CLICKER_LAUNCH_MODE || "steam";
  const steamExePath = process.env.COOKIE_STEAM_EXE || defaultSteamExe;
  const steamAppId = process.env.COOKIE_STEAM_APP_ID || defaultSteamAppId;
  const steamFallbackToExe = process.env.COOKIE_STEAM_FALLBACK_TO_EXE === "1";
  const maxWaitMs = Number.parseInt(process.env.COOKIE_INSPECT_WAIT_MS || "45000", 10);

  return {
    debugPort,
    debugOrigin: debugOrigin || defaultOrigin,
    cookieExePath,
    launchArgs,
    launchMode,
    steamExePath,
    steamAppId,
    steamFallbackToExe,
    maxWaitMs,
    pollIntervalMs: 1200,
  };
}

export function print(message) {
  process.stdout.write(`${message}\n`);
}

export function printError(message) {
  process.stderr.write(`${message}\n`);
}

export function toSafeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isCookieTarget(target) {
  const source = `${target?.title || ""} ${target?.url || ""}`.toLowerCase();
  return source.includes("cookie clicker") || source.includes("orteil.dashnet.org");
}

export async function getJson(debugOrigin, pathname) {
  const response = await fetch(`${debugOrigin}${pathname}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${pathname}`);
  }
  return response.json();
}

export function launchCookieClicker(cookieExePath, launchArgs, options = {}) {
  const launchMode = options.launchMode || "steam";
  const steamExePath = options.steamExePath || defaultSteamExe;
  const steamAppId = options.steamAppId || defaultSteamAppId;

  if (process.platform === "win32" && launchMode === "steam") {
    if (existsSync(steamExePath)) {
      print(`Launching via Steam: ${steamExePath}`);
      print(`Steam app: ${steamAppId}`);
      print(`Args: ${launchArgs.join(" ") || "(none)"}`);
      const steamChild = spawn(steamExePath, ["-applaunch", steamAppId, ...launchArgs], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      steamChild.unref();
      return;
    }
    printError(`Steam executable not found at ${steamExePath}; fallback to direct exe launch.`);
  }

  print(`Launching direct exe: ${cookieExePath}`);
  print(`Args: ${launchArgs.join(" ") || "(none)"}`);

  const child = spawn(cookieExePath, launchArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForCdpReady(debugOrigin, maxWaitMs, pollIntervalMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    try {
      await getJson(debugOrigin, "/json/version");
      return true;
    } catch {
      await sleep(pollIntervalMs);
    }
  }
  return false;
}

export async function collectTargetInfo(debugOrigin) {
  const version = await getJson(debugOrigin, "/json/version");
  const targets = await getJson(debugOrigin, "/json/list");
  const pageTargets = targets.filter((item) => item?.type === "page");
  const cookieTargets = pageTargets.filter(isCookieTarget);

  return {
    debugOrigin,
    browser: toSafeText(version.Browser) || "(unknown)",
    protocolVersion: toSafeText(version["Protocol-Version"]) || "(unknown)",
    totalTargets: targets.length,
    pageTargetsCount: pageTargets.length,
    cookieTargetsCount: cookieTargets.length,
    pageTargets,
    cookieTargets,
    selectedTarget: cookieTargets[0] || null,
    browserWebSocket: version.webSocketDebuggerUrl || "",
    timestamp: new Date().toISOString(),
  };
}

export function printTargetSummary(info) {
  print(`CDP ready: ${info.debugOrigin}`);
  print(`Browser: ${info.browser}`);
  print(`Protocol-Version: ${info.protocolVersion}`);
  print(`Total targets: ${info.totalTargets}`);
  print(`Page targets: ${info.pageTargetsCount}`);
  print(`Cookie targets: ${info.cookieTargetsCount}`);

  const targetsToShow = info.cookieTargetsCount > 0 ? info.cookieTargets : info.pageTargets;
  for (const target of targetsToShow.slice(0, 5)) {
    print(`- ${toSafeText(target.title) || "(no title)"}`);
    print(`  url: ${toSafeText(target.url) || "(no url)"}`);
    print(`  ws: ${toSafeText(target.webSocketDebuggerUrl) || "(no websocket url)"}`);
  }
}

export function printSessionMetadata(info) {
  const session = {
    timestamp: info.timestamp,
    debugOrigin: info.debugOrigin,
    browser: info.browser,
    protocolVersion: info.protocolVersion,
    browserWebSocket: info.browserWebSocket || null,
    target: info.selectedTarget
      ? {
          title: toSafeText(info.selectedTarget.title),
          url: toSafeText(info.selectedTarget.url),
          webSocketDebuggerUrl: toSafeText(info.selectedTarget.webSocketDebuggerUrl),
        }
      : null,
  };
  print("MCP session metadata:");
  print(JSON.stringify(session, null, 2));
}

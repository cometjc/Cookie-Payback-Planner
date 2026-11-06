import process from "node:process";
import {
  collectTargetInfo,
  getInspectConfig,
  launchCookieClicker,
  print,
  printError,
  printSessionMetadata,
  printTargetSummary,
  waitForCdpReady,
} from "./inspect-shared.mjs";

async function main() {
  const config = getInspectConfig();
  const shouldLaunch = process.env.COOKIE_MCP_SKIP_LAUNCH !== "1";

  print("Starting MCP inspect entry...");
  // Reuse existing game instance first to avoid spawning duplicates.
  try {
    const existing = await collectTargetInfo(config.debugOrigin);
    if (existing.cookieTargetsCount > 0) {
      print("Reusing existing Cookie Clicker instance.");
      printTargetSummary(existing);
      printSessionMetadata(existing);
      print("MCP inspect entry ready: you can now ask the agent to trace/analyze.");
      return;
    }
    print("CDP endpoint is up but no Cookie target found yet.");
  } catch {
    print("No active CDP endpoint detected yet.");
  }

  if (!shouldLaunch) {
    print("Skip launch enabled: COOKIE_MCP_SKIP_LAUNCH=1");
    print(`Waiting for CDP endpoint (${config.maxWaitMs} ms max)...`);
    const ready = await waitForCdpReady(config.debugOrigin, config.maxWaitMs, config.pollIntervalMs);
    if (!ready) {
      printError("Timed out waiting for CDP endpoint.");
      printError("Try running `npm run inspect:auto` first or verify debug port config.");
      process.exitCode = 1;
      return;
    }
  } else {
    await launchCookieClicker(config.cookieExePath, config.launchArgs, {
      launchMode: config.launchMode,
      steamExePath: config.steamExePath,
      steamAppId: config.steamAppId,
    });
    print(`Waiting for CDP endpoint (${config.maxWaitMs} ms max)...`);
    const ready = await waitForCdpReady(config.debugOrigin, config.maxWaitMs, config.pollIntervalMs);
    if (!ready) {
      if (config.launchMode === "steam" && config.steamFallbackToExe) {
        printError("Steam launch did not expose CDP endpoint; trying direct exe fallback.");
        await launchCookieClicker(config.cookieExePath, config.launchArgs, { launchMode: "exe" });
        const fallbackReady = await waitForCdpReady(
          config.debugOrigin,
          config.maxWaitMs,
          config.pollIntervalMs,
        );
        if (!fallbackReady) {
          printError("Timed out waiting for CDP endpoint even after fallback.");
          process.exitCode = 1;
          return;
        }
      } else {
        printError("Timed out waiting for CDP endpoint.");
        printError(
          "If using Steam launch mode, add --remote-debugging-port=9222 in Steam launch options, or set COOKIE_CLICKER_LAUNCH_MODE=exe.",
        );
        process.exitCode = 1;
        return;
      }
    }
  }

  const info = await collectTargetInfo(config.debugOrigin);
  printTargetSummary(info);
  if (info.cookieTargetsCount === 0) {
    printError("CDP is available, but Cookie Clicker target is not visible.");
    printError("Bring the game window to foreground and rerun `npm run inspect:mcp`.");
    process.exitCode = 2;
    return;
  }

  printSessionMetadata(info);
  print("MCP inspect entry ready: you can now ask the agent to trace/analyze.");
}

main().catch((error) => {
  printError(`MCP inspect failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

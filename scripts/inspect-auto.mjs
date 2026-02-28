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
  print("Starting automatic inspect flow...");

  try {
    const existing = await collectTargetInfo(config.debugOrigin);
    if (existing.cookieTargetsCount > 0) {
      print("Reusing existing Cookie Clicker instance.");
      printTargetSummary(existing);
      printSessionMetadata(existing);
      print("Auto inspect success: Cookie Clicker target is discoverable.");
      return;
    }
  } catch {
    // No existing endpoint, continue to launch flow.
  }

  launchCookieClicker(config.cookieExePath, config.launchArgs, {
    launchMode: config.launchMode,
    steamExePath: config.steamExePath,
    steamAppId: config.steamAppId,
  });

  print(`Waiting for CDP endpoint (${config.maxWaitMs} ms max)...`);
  const ready = await waitForCdpReady(config.debugOrigin, config.maxWaitMs, config.pollIntervalMs);
  if (!ready) {
    if (config.launchMode === "steam" && config.steamFallbackToExe) {
      printError("Steam launch did not expose CDP endpoint; trying direct exe fallback.");
      launchCookieClicker(config.cookieExePath, config.launchArgs, { launchMode: "exe" });
      const fallbackReady = await waitForCdpReady(config.debugOrigin, config.maxWaitMs, config.pollIntervalMs);
      if (!fallbackReady) {
        printError("Timed out waiting for CDP endpoint even after fallback.");
        printError("Try launching game manually from Steam and rerun inspect commands.");
        process.exitCode = 1;
        return;
      }
    } else {
      printError("Timed out waiting for CDP endpoint.");
      printError(
        "If using Steam launch mode, add --remote-debugging-port=9222 in Steam launch options, or set COOKIE_CLICKER_LAUNCH_MODE=exe.",
      );
      printError(`Current direct exe path: ${config.cookieExePath}`);
      process.exitCode = 1;
      return;
    }
  }

  const info = await collectTargetInfo(config.debugOrigin);
  printTargetSummary(info);
  if (info.cookieTargetsCount === 0) {
    printError("CDP is up, but Cookie Clicker target is not visible yet.");
    printError("Keep the game on foreground/main page, then rerun `npm run inspect:probe`.");
    process.exitCode = 2;
    return;
  }

  printSessionMetadata(info);
  print("Auto inspect success: Cookie Clicker target is discoverable.");
}

main().catch((error) => {
  printError(`Auto inspect failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

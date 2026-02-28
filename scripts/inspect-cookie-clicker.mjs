import process from "node:process";
import {
  collectTargetInfo,
  getInspectConfig,
  print,
  printError,
  printSessionMetadata,
  printTargetSummary,
} from "./inspect-shared.mjs";

async function main() {
  const config = getInspectConfig();
  print(`Probing CDP endpoint: ${config.debugOrigin}`);

  const info = await collectTargetInfo(config.debugOrigin);
  printTargetSummary(info);

  if (info.cookieTargetsCount === 0) {
    printError("No Cookie Clicker target found.");
    printError("Ensure Cookie Clicker is running with --remote-debugging-port=9222.");
    process.exitCode = 2;
    return;
  }

  printSessionMetadata(info);
  print("Inspect probe success: Cookie Clicker target is discoverable.");
}

main().catch((error) => {
  printError(`Probe failed: ${error instanceof Error ? error.message : String(error)}`);
  printError("Tip: start Cookie Clicker with --remote-debugging-port=9222 first.");
  process.exitCode = 1;
});

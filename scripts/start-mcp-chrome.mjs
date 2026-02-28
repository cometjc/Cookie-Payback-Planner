import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const chromeExe = process.env.MCP_CHROME_EXE || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const debugPort = Number.parseInt(process.env.MCP_CHROME_DEBUG_PORT || "9333", 10);
const startUrl = process.env.MCP_CHROME_START_URL || "https://orteil.dashnet.org/cookieclicker/";
const profileDir = process.env.MCP_CHROME_PROFILE_DIR || path.join(os.tmpdir(), "cpp-mcp-chrome-profile");

async function main() {
  await mkdir(profileDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    startUrl,
  ];

  const child = spawn(chromeExe, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();

  process.stdout.write(`[mcp-chrome] launched\n`);
  process.stdout.write(`exe: ${chromeExe}\n`);
  process.stdout.write(`debug: http://127.0.0.1:${debugPort}\n`);
  process.stdout.write(`url: ${startUrl}\n`);
  process.stdout.write(`profile: ${profileDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`[mcp-chrome] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});


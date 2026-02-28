import { readFileSync } from "node:fs";
import path from "node:path";

export function loadProjectEnv(rootDir = process.cwd()) {
  const envPath = path.join(rootDir, ".env");
  let text = "";
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return process.env;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  return process.env;
}

export function getCookieRoot() {
  return (
    process.env.COOKIE_CLICKER_ROOT ||
    "D:\\SteamLibrary\\steamapps\\common\\Cookie Clicker_upgrade_try"
  );
}

export function toCookieExe(cookieRoot) {
  return path.join(cookieRoot, "Cookie Clicker.exe");
}

export function toWorkshopRoot(cookieRoot) {
  return path.join(cookieRoot, "resources", "app", "mods", "workshop");
}

export function toBestDealHelperDir(cookieRoot) {
  return path.join(toWorkshopRoot(cookieRoot), "BestDealHelper");
}

export function toFileUrl(filePath) {
  const normalized = String(filePath).replace(/\\/g, "/");
  return `file:///${encodeURI(normalized)}`;
}


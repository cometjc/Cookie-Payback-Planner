import { createHash } from "node:crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const envPath = path.join(rootDir, ".env");
const infoPath = path.join(rootDir, "info.txt");
const filesToCopy = ["main.js", "info.txt", "thumbnail.png"];
const manifestName = "deploy-manifest.json";

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

async function readDotEnv(filePath) {
  const result = {};
  const content = await readFile(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = stripQuotes(trimmed.slice(eqIndex + 1).trim());
    result[key] = value;
  }
  return result;
}

function normalizeAbsolutePath(inputPath) {
  if (!inputPath) {
    return "";
  }
  const unescaped = inputPath.replace(/\\\\/g, "\\");
  return path.isAbsolute(unescaped) ? unescaped : path.resolve(rootDir, unescaped);
}

async function ensureReadable(targetPath, name) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`${name} does not exist: ${targetPath}`);
  }
}

function toManifestSignature(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function main() {
  await ensureReadable(envPath, ".env");
  await ensureReadable(infoPath, "info.txt");

  const dotEnv = await readDotEnv(envPath);
  const deployPathRaw = dotEnv.DEPLOY_MOD_PATH ?? process.env.DEPLOY_MOD_PATH;
  const deployPath = normalizeAbsolutePath(deployPathRaw);
  if (!deployPath) {
    throw new Error("DEPLOY_MOD_PATH is not set in .env or process env");
  }

  const info = JSON.parse(await readFile(infoPath, "utf8"));
  const modId = String(info.ID || "").trim();
  const modVersion = String(info.ModVersion || "").trim();
  if (!modId) {
    throw new Error("Mod ID not found in info.txt");
  }

  await mkdir(deployPath, { recursive: true });

  for (const fileName of filesToCopy) {
    const source = path.join(rootDir, fileName);
    const destination = path.join(deployPath, fileName);
    await ensureReadable(source, fileName);
    await copyFile(source, destination);
  }

  const mainJs = await readFile(path.join(rootDir, "main.js"), "utf8");
  const manifest = {
    modId,
    modVersion,
    deployedAt: new Date().toISOString(),
    buildHash: toManifestSignature(mainJs),
  };
  await writeFile(path.join(deployPath, manifestName), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  process.stdout.write(
    [
      `Deployed ${modId} v${modVersion || "unknown"}`,
      `Target: ${deployPath}`,
      `Manifest: ${manifestName}`,
    ].join("\n") + "\n",
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
